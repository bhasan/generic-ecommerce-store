# POS Integration Design — ForeverPOS (v1)

**Date:** 2026-06-26
**Status:** Approved

## Overview

A provider-agnostic POS integration layer that pushes order and payment data to a configured POS vendor whenever orders are created or updated. ForeverPOS is the first concrete provider. The system is designed so adding new providers requires no changes to the orchestration layer.

## Goals

- Push order data to a POS vendor on order creation and status update
- Push payment data to a POS vendor on order creation
- Support multiple POS providers, configurable per store
- Degrade gracefully — POS push failures never block or fail the order
- Auth is provider-internal and transparent to the orchestrator

## Non-Goals

- Real-time sync of existing historical orders
- POS-to-app reverse sync (inbound webhooks from POS)
- Guaranteed delivery / persistent queue (out of scope for v1; can evolve to Option C event bus later)

## File Structure

```
backend/src/services/pos/
├── PosProvider.ts              # Interface + shared types
├── registry.ts                 # Maps provider key → PosProvider instance
├── retry.ts                    # Shared async retry with exponential backoff
└── providers/
    └── foreverpos.provider.ts  # ForeverPOS implementation
```

## PosProvider Interface

```ts
export interface PosOrder {
  id: number;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  deliveryMethod: string;
  items: { productName: string; variantLabel: string; quantity: number; unitPrice: number }[];
}

export interface PosPayment {
  orderId: number;
  method: string;
  amount: number;
}

export interface PosProvider {
  pushOrder(order: PosOrder): Promise<void>;
  pushPayment(payment: PosPayment): Promise<void>;
}
```

Providers that combine order and payment into a single API call implement `pushOrder` with the full payload and make `pushPayment` a no-op.

## Store Settings Schema

Two new fields on store settings:

| Field | Type | Description |
|-------|------|-------------|
| `posProvider` | `string \| null` | Provider key, e.g. `'foreverpos'`. `null` disables POS integration for this store. |
| `posConfig` | `JsonValue` | Provider-specific config blob (credentials, base URL, etc.). Shape is defined and validated per provider. |

`posConfig` is a flexible JSON blob so new providers never require schema migrations for unrelated stores.

## Registry

```ts
// registry.ts
export function getPosProvider(settings: StoreSettings): PosProvider | null {
  if (!settings.posProvider) return null;
  // returns registered provider instance initialized with settings.posConfig
}
```

## Orchestration

### Order Creation

`dispatchOrderCreatedEffects` in `order.service.ts` gains one new call:

```ts
await posService.pushOrderCreated(orderId);
```

This fetches the full order (items, totals, payment records) from DB, then calls:
1. `provider.pushOrder(order)` — with retry
2. `provider.pushPayment(order)` — with retry

### Order Status Update

`updateOrderStatus` in `order.service.ts` gains one new call after the status is persisted:

```ts
await posService.pushOrderUpdated(orderId);
```

This calls `provider.pushOrder(order)` only — payment does not change on status update.

## Retry Behavior

- **Attempts:** 3
- **Backoff:** Exponential — 1s, 2s, 4s between attempts
- **Per attempt:** Log attempt number, provider name, orderId, and error
- **On exhaustion:** Log final warning, continue without throwing — order is never affected
- Retry logic lives in `retry.ts` and is shared across all providers

## Auth (Provider-Internal)

- Each provider owns its auth entirely — the interface and orchestrator are auth-unaware
- ForeverPOS auth approach TBD pending API docs (likely username/password → token, or API key)
- Token cached in-memory; refreshed on 401 response
- If auth fails after retries → same graceful degradation, logged and continue

## Data Flow

```
createOrder (DB transaction completes)
  └── dispatchOrderCreatedEffects
        ├── notificationEventsService.notifyOrderCreated   (existing)
        ├── thermalPrinterService.dispatchReceipt          (existing)
        └── posService.pushOrderCreated(orderId)           (new)
              ├── fetch full order from DB
              ├── getPosProvider(storeSettings) → null = early return
              ├── provider.pushOrder(order)   [retry x3]
              └── provider.pushPayment(order) [retry x3]

updateOrderStatus (status persisted)
  └── posService.pushOrderUpdated(orderId)                 (new)
        ├── fetch full order from DB
        ├── getPosProvider(storeSettings) → null = early return
        └── provider.pushOrder(order) [retry x3]
```

## Testing

| Test file | Coverage |
|-----------|----------|
| `pos/retry.test.ts` | Attempt count, backoff, exhausted retries log and continue without throwing |
| `pos/registry.test.ts` | Correct provider returned for known key, null for missing/disabled |
| `pos/providers/foreverpos.provider.test.ts` | `pushOrder`, `pushPayment`, token refresh on 401 (HTTP mocked) |
| `order.routes.test.ts` (extended) | POS push attempted on order creation and status update (registry mocked) |

Live integration testing is done manually once API docs are available.

## Future Considerations

- If guaranteed delivery becomes a requirement, evolve to an event bus / message queue (Option C) — the `PosProvider` interface remains unchanged, only the dispatch mechanism changes
- Additional providers are added as new files under `providers/` + a registry entry — no changes to orchestration or interface
