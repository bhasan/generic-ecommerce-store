# ForeverPOS (SAK) Order Sync via Outbox — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current in-process fire-and-forget POS push with a durable transactional outbox, and implement the real ForeverPOS (SAK) order-sync provider that creates an online order (with payment) on APPROVED and pushes later status changes.

**Architecture:** Capability-based `pos/` module. Order status changes enqueue a row into `pos_outbox` inside the order's DB transaction. An in-process worker (30s) drains the outbox with `FOR UPDATE SKIP LOCKED`, calling a pure `PosOrderSync` provider. The ForeverPOS provider uses a shared `ForeverPosClient` (auth + HTTP) and pushes a single catch-all line item + payment to SAK's `POST /api/Voucher/order`, then status via `PUT /api/Voucher/bulk-update`.

**Tech Stack:** TypeScript, Node, Express, Prisma (Postgres), Vitest. Generated Prisma client at `backend/generated/prisma`. Logger at `backend/src/utils/logger`. Prisma singleton default export at `backend/src/config/database`.

## Global Constraints

- **Providers are pure** — no DB access inside `providers/foreverpos/*`; persistence lives in `posOrderService`.
- **Worker interval:** 30s default, env `POS_OUTBOX_POLL_MS` (default `30000`).
- **Retry cap:** `MAX_ATTEMPTS = 5` before a row becomes `FAILED`.
- **Outbox claim:** `SELECT ... FOR UPDATE SKIP LOCKED`, oldest-first (`ORDER BY id`).
- **Push trigger:** SAK voucher is created on transition to `APPROVED` (`ORDER_CREATED`); other status changes passing `shouldPushStatus` enqueue `ORDER_UPDATED`.
- **SAK auth:** `POST /api/Users/login-email` `{email,password}` → `{accessToken}`; `Authorization: Bearer <token>`; refresh once on 401.
- **SAK create:** `POST /api/Voucher/order` (VoucherDto) → `{voucherId}`; `orderType:"online"`; single catch-all line using `sakCatchAllProductId`/`sakCatchAllVariantId`; payment via `cash`/`credit`/`otherPayment`.
- **SAK status:** `PUT /api/Voucher/bulk-update` `{ids:[voucherId], action:"Update", field:"status", value:"<mapped>"}`.
- **Status map:** APPROVED→`Processing`, READY_FOR_PICKUP/ARRIVED→`Ready`, OUT_FOR_DELIVERY→`Out for Delivery`, DELIVERED→`Delivered`, CANCELLED→`Cancelled`.
- **Payment map:** CC→`credit`, CASHAPP/EXTERNAL→`cash`, STORE_CREDIT→`otherPayment`, IN_STORE→`cash`. Money to fixed-2.
- **Log events (stable `event` field):** `pos_outbox_enqueued`, `pos_outbox_success`, `pos_outbox_retry`, `pos_outbox_failed`, `pos_outbox_backlog_high`, `pos_auth_failed`, `pos_worker_crashed`.
- **Commit after every task.** Run `npx tsc --noEmit` and the task's tests before committing.

---

### Task 1: Restructure `pos/` to capability layout (pure refactor)

Mechanical move + rename only. Behavior and the existing fire-and-forget flow stay identical; all existing tests must still pass. The interface methods are NOT changed here (that's Task 4).

**Files:**
- Move: `backend/src/services/pos/PosProvider.ts` → `backend/src/services/pos/orders/PosOrderSync.ts`
- Move: `backend/src/services/pos/posService.ts` → `backend/src/services/pos/orders/posOrderService.ts`
- Move: `backend/src/services/pos/retry.ts` → `backend/src/services/pos/orders/retry.ts`
- Move: `backend/src/services/pos/posService.test.ts` → `backend/src/services/pos/orders/posOrderService.test.ts`
- Move: `backend/src/services/pos/retry.test.ts` → `backend/src/services/pos/orders/retry.test.ts`
- Modify: `backend/src/services/pos/registry.ts` (capability map + `getOrderSync`)
- Modify: `backend/src/services/pos/registry.test.ts`
- Modify: `backend/src/services/pos/providers/foreverpos.provider.ts` (import path + class name)
- Modify: `backend/src/services/pos/providers/foreverpos.provider.test.ts`
- Modify: `backend/src/services/order.service.ts:15` (import path)

**Interfaces:**
- Produces: `pos/orders/PosOrderSync.ts` exports `PosOrderSync` (renamed from `PosProvider`, same methods for now: `shouldPushStatus`, `pushOrder(order: PosOrderPayload): Promise<void>`, `pushPayment(order: PosOrderPayload): Promise<void>`), plus `PosOrderPayload`, `PosPaymentPayload`.
- Produces: `pos/registry.ts` exports `getOrderSync(settings: { posProvider?: string | null }): PosOrderSync | null`, `registerProvider(key: string, caps: PosCapabilities)`, `interface PosCapabilities { orderSync?: PosOrderSync }`.

- [ ] **Step 1: Rename the interface file and type**

Create `backend/src/services/pos/orders/PosOrderSync.ts` with the current contents of `PosProvider.ts`, renaming only the interface:

```ts
export interface PosPaymentPayload {
  id: number;
  method: string;
  amount: number;
  status: string;
}

export interface PosOrderPayload {
  id: number;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  deliveryMethod: string;
  items: { productName: string; variantLabel: string; quantity: number; unitPrice: number }[];
  payments: PosPaymentPayload[];
}

export interface PosOrderSync {
  /** Provider decides which statuses it cares about (covers create + all status changes). */
  shouldPushStatus(status: string): boolean;
  pushOrder(order: PosOrderPayload): Promise<void>;
  pushPayment(order: PosOrderPayload): Promise<void>;
}
```

Delete `backend/src/services/pos/PosProvider.ts`.

- [ ] **Step 2: Move retry + posService into `orders/` and fix their imports**

`git mv` retry and posService (and their tests) into `orders/`. In `orders/retry.ts` change the logger import from `'../../utils/logger'` to `'../../../utils/logger'`. In `orders/posOrderService.ts` change imports: prisma `'../../../config/database'`, logger `'../../../utils/logger'`, `StoreSettingsService` `'../../storeSettings.service'`, `getOrderSync` from `'../registry'` (was `getPosProvider`), `retryWithBackoff` from `'./retry'`, types from `'./PosOrderSync'`. Replace `getPosProvider` calls with `getOrderSync`.

```bash
cd backend
git mv src/services/pos/retry.ts src/services/pos/orders/retry.ts
git mv src/services/pos/retry.test.ts src/services/pos/orders/retry.test.ts
git mv src/services/pos/posService.ts src/services/pos/orders/posOrderService.ts
git mv src/services/pos/posService.test.ts src/services/pos/orders/posOrderService.test.ts
```

In `orders/retry.test.ts` fix the logger mock path to `'../../../utils/logger'`.

- [ ] **Step 3: Rewrite the registry as a capability map**

`backend/src/services/pos/registry.ts`:

```ts
import { logger } from '../../utils/logger';
import { PosOrderSync } from './orders/PosOrderSync';
import { ForeverPosProvider } from './providers/foreverpos.provider';

export interface PosCapabilities {
  orderSync?: PosOrderSync;
}

type PosSettingsSlice = { posProvider?: string | null };

const providers = new Map<string, PosCapabilities>();

export function registerProvider(key: string, caps: PosCapabilities): void {
  providers.set(key, caps);
}

export function getOrderSync(settings: PosSettingsSlice): PosOrderSync | null {
  if (!settings.posProvider) return null;
  const caps = providers.get(settings.posProvider);
  if (!caps?.orderSync) {
    logger.warn('Unknown or order-sync-less POS provider configured', { posProvider: settings.posProvider });
    return null;
  }
  return caps.orderSync;
}

// Register built-in providers
registerProvider('foreverpos', { orderSync: new ForeverPosProvider() });
```

- [ ] **Step 4: Update the provider class import + posOrderService + order.service**

In `providers/foreverpos.provider.ts` change the type import from `'../PosProvider'` to `'../orders/PosOrderSync'` and the interface name `PosProvider` → `PosOrderSync` in the `implements` clause (keep class name `ForeverPosProvider`, keep all methods). In `orders/posOrderService.ts` ensure it calls `getOrderSync(settings)`. In `order.service.ts:15` change `import * as posService from './pos/posService'` → `import * as posService from './pos/orders/posOrderService'`.

- [ ] **Step 5: Update remaining test imports**

In `registry.test.ts`: import `getOrderSync`/`registerProvider` from `'./registry'`; update assertions to the capability shape (`getOrderSync({ posProvider: 'foreverpos' })` returns non-null; unknown → null + warn; a registered `{ orderSync: mock }` is returned). In `providers/foreverpos.provider.test.ts`: no behavior change. In `orders/posOrderService.test.ts`: update mock path `vi.mock('../registry', ...)` exporting `getOrderSync`, and `vi.mock('./retry')`, prisma `vi.mock('../../../config/database')`, settings `vi.mock('../../storeSettings.service')`.

- [ ] **Step 6: Run the full pos suite + typecheck**

Run: `cd backend && npx vitest run src/services/pos/ && npx tsc --noEmit`
Expected: all pos tests PASS, 0 type errors.

- [ ] **Step 7: Commit**

```bash
cd backend && git add -A
git commit -m "refactor(pos): restructure module by capability (PosOrderSync, orders/, getOrderSync)"
```

---

### Task 2: Prisma migration — `pos_outbox` + `order_pos_mappings`

**Files:**
- Modify: `backend/prisma/schema.prisma` (add two models + Order back-relations)
- Create: migration under `backend/prisma/migrations/` (generated by `prisma migrate dev`)

**Interfaces:**
- Produces: Prisma models `PosOutbox` (table `pos_outbox`) and `OrderPosMapping` (table `order_pos_mappings`), available on `prisma.posOutbox` / `prisma.orderPosMapping` after `prisma generate`.

- [ ] **Step 1: Add models to schema.prisma**

Append to `backend/prisma/schema.prisma`:

```prisma
model PosOutbox {
  id        Int      @id @default(autoincrement())
  orderId   Int
  provider  String
  type      String   // 'ORDER_CREATED' | 'ORDER_UPDATED'
  status    String   @default("PENDING") // 'PENDING' | 'DONE' | 'FAILED'
  attempts  Int      @default(0)
  lastError String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  order     Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([status, id])
  @@map("pos_outbox")
}

model OrderPosMapping {
  id         Int      @id @default(autoincrement())
  orderId    Int
  provider   String
  externalId String
  createdAt  DateTime @default(now())
  order      Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@unique([orderId, provider])
  @@map("order_pos_mappings")
}
```

In `model Order { ... }`, add these two back-relations alongside the existing relations (e.g. after `payments  Payment[]`):

```prisma
  posOutbox    PosOutbox[]
  posMappings  OrderPosMapping[]
```

- [ ] **Step 2: Create the migration**

Run: `cd backend && npx prisma migrate dev --name add_pos_outbox_and_mappings`
Expected: a new migration directory is created, applied to the dev DB, and `prisma generate` runs (client now exposes `prisma.posOutbox`, `prisma.orderPosMapping`).

- [ ] **Step 3: Verify the client typings compile**

Run: `npx tsc --noEmit`
Expected: 0 errors (the new delegates exist on the generated client).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(pos): add pos_outbox and order_pos_mappings tables"
```

---

### Task 3: `posConfig` additions — SAK catch-all product IDs

**Files:**
- Modify: `backend/src/services/storeSettings.service.ts` (`PosConfig` + Zod + normalize)
- Modify: `backend/src/services/storeSettings.service.test.ts`

**Interfaces:**
- Produces: `PosConfig` gains `sakCatchAllProductId?: number`, `sakCatchAllVariantId?: number` (non-secret, plaintext, passed through normalize and onRead/onWrite untouched by encryption).

- [ ] **Step 1: Write the failing test**

Add to `backend/src/services/storeSettings.service.test.ts`:

```ts
it('persists SAK catch-all product ids in posConfig', async () => {
  const svc = new StoreSettingsService();
  const saved = await svc.updateStoreSettings({
    name: 'S', address: '', phoneNumber: '', tagline: '',
    notificationEmails: { adminEmail: '', managementEmail: '', employeeEmail: '' },
    posProvider: 'foreverpos',
    posConfig: { baseUrl: 'https://api.sakretailsolutions.com', sakCatchAllProductId: 93147, sakCatchAllVariantId: 104831 },
  } as any);
  expect(saved.posConfig.sakCatchAllProductId).toBe(93147);
  expect(saved.posConfig.sakCatchAllVariantId).toBe(104831);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd backend && npx vitest run src/services/storeSettings.service.test.ts -t "catch-all"`
Expected: FAIL (type/property missing or value undefined).

- [ ] **Step 3: Extend `PosConfig`, schema, normalize**

In `storeSettings.service.ts`, add to `PosConfig`:

```ts
  sakCatchAllProductId?: number;
  sakCatchAllVariantId?: number;
```

In the Zod `posConfig` object add:

```ts
    sakCatchAllProductId: z.number().int().optional(),
    sakCatchAllVariantId: z.number().int().optional(),
```

In `normalize()` `posConfig` block add pass-through:

```ts
      sakCatchAllProductId: data?.posConfig?.sakCatchAllProductId,
      sakCatchAllVariantId: data?.posConfig?.sakCatchAllVariantId,
```

(No change to `onRead`/`onWrite` — these are non-secret.)

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/services/storeSettings.service.test.ts`
Expected: PASS (all store-settings tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/storeSettings.service.ts src/services/storeSettings.service.test.ts
git commit -m "feat(pos): add SAK catch-all product ids to posConfig"
```

---

### Task 4: Rewrite `PosOrderSync` interface — `PosContext`, `pushStatus`

Change the order capability to the outbox-era shape. Update the stub provider and `posOrderService` to compile; `posOrderService` is fully rewritten in Task 7, so here it only needs to keep compiling (we temporarily simplify it).

**Files:**
- Modify: `backend/src/services/pos/orders/PosOrderSync.ts`
- Modify: `backend/src/services/pos/providers/foreverpos.provider.ts`
- Modify: `backend/src/services/pos/providers/foreverpos.provider.test.ts`
- Modify: `backend/src/services/pos/orders/posOrderService.ts` (temporary shim)
- Modify: `backend/src/services/pos/orders/posOrderService.test.ts`
- Modify: `backend/src/services/order.service.ts` (the two detached call sites compile against the shim)

**Interfaces:**
- Produces: `PosContext { order: PosOrderPayload; externalId?: string | null }`; `PosOrderSync { shouldPushStatus(status): boolean; pushOrder(ctx: PosContext): Promise<{ externalId: string | null }>; pushStatus(ctx: PosContext): Promise<void> }`.

- [ ] **Step 1: Update the interface**

In `orders/PosOrderSync.ts` replace the `PosOrderSync` interface and add `PosContext`:

```ts
export interface PosContext {
  order: PosOrderPayload;
  externalId?: string | null;
}

export interface PosOrderSync {
  shouldPushStatus(status: string): boolean;
  pushOrder(ctx: PosContext): Promise<{ externalId: string | null }>;
  pushStatus(ctx: PosContext): Promise<void>;
}
```

- [ ] **Step 2: Update the stub provider to the new signatures**

In `providers/foreverpos.provider.ts` replace `pushOrder`/`pushPayment` with:

```ts
  async pushOrder(ctx: PosContext): Promise<{ externalId: string | null }> {
    logger.info('ForeverPOS: pushOrder called', { orderId: ctx.order.id, status: ctx.order.status });
    return { externalId: null };
  }

  async pushStatus(ctx: PosContext): Promise<void> {
    logger.info('ForeverPOS: pushStatus called', { orderId: ctx.order.id, externalId: ctx.externalId });
  }
```

Update its import to include `PosContext` from `'../orders/PosOrderSync'`.

- [ ] **Step 3: Update provider tests to new signatures**

In `providers/foreverpos.provider.test.ts` replace `pushOrder(payload)`/`pushPayment(payload)` calls with `pushOrder({ order: payload })` and `pushStatus({ order: payload, externalId: '12' })`; assert `pushOrder` resolves to `{ externalId: null }` and both log.

- [ ] **Step 4: Temporary shim for posOrderService + its tests**

Replace `orders/posOrderService.ts` body with a minimal shim that keeps `order.service.ts` compiling (real logic comes in Task 7):

```ts
// Temporary shim — replaced by the outbox implementation in the outbox task.
export async function pushOrderCreated(_orderId: number): Promise<void> { /* no-op until outbox */ }
export async function pushOrderUpdated(_orderId: number): Promise<void> { /* no-op until outbox */ }
```

Reduce `orders/posOrderService.test.ts` to a single placeholder test asserting both exports are functions (it is fully rewritten in Task 7):

```ts
import { describe, it, expect } from 'vitest';
import * as svc from './posOrderService';
describe('posOrderService (shim)', () => {
  it('exports push functions', () => {
    expect(typeof svc.pushOrderCreated).toBe('function');
    expect(typeof svc.pushOrderUpdated).toBe('function');
  });
});
```

- [ ] **Step 5: Run pos suite + typecheck**

Run: `cd backend && npx vitest run src/services/pos/ && npx tsc --noEmit`
Expected: PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(pos): PosOrderSync gains PosContext + pushStatus (replaces pushPayment)"
```

---

### Task 5: `ForeverPosClient` — auth + HTTP

**Files:**
- Create: `backend/src/services/pos/providers/foreverpos/client.ts`
- Create: `backend/src/services/pos/providers/foreverpos/client.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (uses global `fetch`).
- Produces:
  ```ts
  export interface ForeverPosConfig {
    baseUrl: string; username: string; password: string;
    sakCatchAllProductId: number; sakCatchAllVariantId: number;
  }
  export class ForeverPosClient {
    constructor(cfg: ForeverPosConfig);
    request<T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T>;
  }
  ```
  `request` authenticates lazily (caches the JWT), retries once on 401 after re-auth, throws on non-2xx (and logs `pos_auth_failed` on auth failure).

- [ ] **Step 1: Write the failing tests**

`backend/src/services/pos/providers/foreverpos/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { ForeverPosClient, ForeverPosConfig } from './client';
import { logger } from '../../../../utils/logger';

const cfg: ForeverPosConfig = {
  baseUrl: 'https://sak.test', username: 'u@e.com', password: 'pw',
  sakCatchAllProductId: 1, sakCatchAllVariantId: 2,
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

beforeEach(() => vi.restoreAllMocks());

describe('ForeverPosClient', () => {
  it('authenticates then sends the request with a bearer token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'TOK' }))   // login
      .mockResolvedValueOnce(jsonResponse({ voucherId: 7 }));        // POST
    vi.stubGlobal('fetch', fetchMock);

    const client = new ForeverPosClient(cfg);
    const res = await client.request<{ voucherId: number }>('POST', '/api/Voucher/order', { a: 1 });

    expect(res.voucherId).toBe(7);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://sak.test/api/Users/login-email', expect.objectContaining({ method: 'POST' }));
    const second = fetchMock.mock.calls[1];
    expect(second[0]).toBe('https://sak.test/api/Voucher/order');
    expect((second[1] as any).headers.Authorization).toBe('Bearer TOK');
  });

  it('refreshes the token once on 401 and retries', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'OLD' }))   // login
      .mockResolvedValueOnce(jsonResponse({ msg: 'no' }, 401))        // first call 401
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'NEW' }))   // re-login
      .mockResolvedValueOnce(jsonResponse({ ok: true }));            // retry ok
    vi.stubGlobal('fetch', fetchMock);

    const client = new ForeverPosClient(cfg);
    await client.request('PUT', '/api/Voucher/bulk-update', {});
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('logs pos_auth_failed and throws when login fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'bad' }, 401)));
    const client = new ForeverPosClient(cfg);
    await expect(client.request('POST', '/x', {})).rejects.toThrow();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('auth'), expect.anything(), expect.objectContaining({ event: 'pos_auth_failed' }));
  });
});
```

- [ ] **Step 2: Run, verify they fail**

Run: `cd backend && npx vitest run src/services/pos/providers/foreverpos/client.test.ts`
Expected: FAIL ("Cannot find module './client'").

- [ ] **Step 3: Implement the client**

`backend/src/services/pos/providers/foreverpos/client.ts`:

```ts
import { logger } from '../../../../utils/logger';

export interface ForeverPosConfig {
  baseUrl: string;
  username: string;
  password: string;
  sakCatchAllProductId: number;
  sakCatchAllVariantId: number;
}

export class ForeverPosClient {
  private token: string | null = null;
  constructor(private readonly cfg: ForeverPosConfig) {}

  private async login(): Promise<string> {
    const res = await fetch(`${this.cfg.baseUrl}/api/Users/login-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: '*/*' },
      body: JSON.stringify({ email: this.cfg.username, password: this.cfg.password }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error('ForeverPOS auth failed', new Error(`login ${res.status}`), { event: 'pos_auth_failed', status: res.status, body: text.slice(0, 200) });
      throw new Error(`ForeverPOS login failed: ${res.status}`);
    }
    const body = (await res.json()) as { accessToken?: string };
    if (!body.accessToken) {
      logger.error('ForeverPOS auth missing token', new Error('no accessToken'), { event: 'pos_auth_failed' });
      throw new Error('ForeverPOS login returned no accessToken');
    }
    this.token = body.accessToken;
    return this.token;
  }

  private async ensureToken(): Promise<string> {
    return this.token ?? (await this.login());
  }

  async request<T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T> {
    let token = await this.ensureToken();
    let res = await this.send(method, path, body, token);
    if (res.status === 401) {
      this.token = null;
      token = await this.login();
      res = await this.send(method, path, body, token);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ForeverPOS ${method} ${path} failed: ${res.status} ${text.slice(0, 200)}`);
    }
    // Some SAK endpoints return 204 with no body.
    const text = await res.text().catch(() => '');
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private send(method: string, path: string, body: unknown, token: string): Promise<Response> {
    return fetch(`${this.cfg.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', accept: '*/*', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/services/pos/providers/foreverpos/client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/pos/providers/foreverpos/client.ts src/services/pos/providers/foreverpos/client.test.ts
git commit -m "feat(pos): add ForeverPosClient (auth + HTTP, refresh on 401)"
```

---

### Task 6: `foreverpos/orders.ts` — `PosOrderSync` implementation

**Files:**
- Create: `backend/src/services/pos/providers/foreverpos/orders.ts`
- Create: `backend/src/services/pos/providers/foreverpos/orders.test.ts`

**Interfaces:**
- Consumes: `ForeverPosClient`, `ForeverPosConfig` from `./client`; `PosOrderSync`, `PosContext` from `../../orders/PosOrderSync`.
- Produces: `class ForeverPosOrderSync implements PosOrderSync` (constructor `(client: ForeverPosClient, cfg: ForeverPosConfig)`), plus exported `STATUS_MAP` and `paymentBuckets(payments)` helper.

- [ ] **Step 1: Write the failing tests**

`backend/src/services/pos/providers/foreverpos/orders.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../../../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { ForeverPosOrderSync } from './orders';
import type { PosContext } from '../../orders/PosOrderSync';

const cfg = { baseUrl: 'https://sak.test', username: 'u', password: 'p', sakCatchAllProductId: 1, sakCatchAllVariantId: 2 };

function ctx(over: Partial<PosContext['order']> = {}, externalId?: string): PosContext {
  return {
    externalId,
    order: {
      id: 55, status: 'APPROVED', subtotal: 10, tax: 0.5, total: 10.5, deliveryMethod: 'PICKUP',
      items: [{ productName: 'X', variantLabel: 'g', quantity: 1, unitPrice: 10 }],
      payments: [{ id: 9, method: 'CC', amount: 10.5, status: 'SETTLED' }],
      ...over,
    },
  };
}

let client: { request: ReturnType<typeof vi.fn> };
beforeEach(() => { client = { request: vi.fn() }; });

describe('ForeverPosOrderSync.shouldPushStatus', () => {
  it('accepts mapped statuses, rejects unmapped', () => {
    const s = new ForeverPosOrderSync(client as any, cfg as any);
    expect(s.shouldPushStatus('APPROVED')).toBe(true);
    expect(s.shouldPushStatus('DELIVERED')).toBe(true);
    expect(s.shouldPushStatus('PENDING')).toBe(false);
  });
});

describe('ForeverPosOrderSync.pushOrder', () => {
  it('posts a single catch-all line with CC payment in credit and returns voucherId', async () => {
    client.request.mockResolvedValue({ voucherId: 321 });
    const s = new ForeverPosOrderSync(client as any, cfg as any);
    const res = await s.pushOrder(ctx());
    expect(res).toEqual({ externalId: '321' });
    const [method, path, body] = client.request.mock.calls[0];
    expect(method).toBe('POST');
    expect(path).toBe('/api/Voucher/order');
    expect(body.orderType).toBe('online');
    expect(body.status).toBe('Processing');
    expect(body.credit).toBe(10.5);
    expect(body.cash ?? 0).toBe(0);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].productId).toBe(1);
    expect(body.items[0].productVariantId).toBe(2);
    expect(body.items[0].total).toBe(10.5);
  });

  it('buckets cash payments into cash', async () => {
    client.request.mockResolvedValue({ voucherId: 1 });
    const s = new ForeverPosOrderSync(client as any, cfg as any);
    await s.pushOrder(ctx({ payments: [{ id: 1, method: 'EXTERNAL', amount: 10.5, status: 'SETTLED' }] }));
    const body = client.request.mock.calls[0][2];
    expect(body.cash).toBe(10.5);
    expect(body.credit ?? 0).toBe(0);
  });
});

describe('ForeverPosOrderSync.pushStatus', () => {
  it('sends bulk-update with mapped status', async () => {
    client.request.mockResolvedValue({ updated: 1 });
    const s = new ForeverPosOrderSync(client as any, cfg as any);
    await s.pushStatus(ctx({ status: 'DELIVERED' }, '321'));
    const [method, path, body] = client.request.mock.calls[0];
    expect(method).toBe('PUT');
    expect(path).toBe('/api/Voucher/bulk-update');
    expect(body).toEqual({ ids: [321], action: 'Update', field: 'status', value: 'Delivered' });
  });

  it('throws when externalId is missing', async () => {
    const s = new ForeverPosOrderSync(client as any, cfg as any);
    await expect(s.pushStatus(ctx({ status: 'DELIVERED' }))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, verify they fail**

Run: `cd backend && npx vitest run src/services/pos/providers/foreverpos/orders.test.ts`
Expected: FAIL ("Cannot find module './orders'").

- [ ] **Step 3: Implement the adapter**

`backend/src/services/pos/providers/foreverpos/orders.ts`:

```ts
import { PosOrderSync, PosContext, PosPaymentPayload } from '../../orders/PosOrderSync';
import { ForeverPosClient, ForeverPosConfig } from './client';

export const STATUS_MAP: Record<string, string> = {
  APPROVED: 'Processing',
  READY_FOR_PICKUP: 'Ready',
  ARRIVED: 'Ready',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const money = (n: number): number => Number(n.toFixed(2));

export function paymentBuckets(payments: PosPaymentPayload[]): { cash: number; credit: number; otherPayment: number } {
  const buckets = { cash: 0, credit: 0, otherPayment: 0 };
  for (const p of payments) {
    if (p.status !== 'SETTLED') continue;
    switch (p.method) {
      case 'CC': buckets.credit += p.amount; break;
      case 'STORE_CREDIT': buckets.otherPayment += p.amount; break;
      default: buckets.cash += p.amount; break; // CASHAPP/EXTERNAL/IN_STORE
    }
  }
  return { cash: money(buckets.cash), credit: money(buckets.credit), otherPayment: money(buckets.otherPayment) };
}

export class ForeverPosOrderSync implements PosOrderSync {
  constructor(private readonly client: ForeverPosClient, private readonly cfg: ForeverPosConfig) {}

  shouldPushStatus(status: string): boolean {
    return status in STATUS_MAP;
  }

  async pushOrder(ctx: PosContext): Promise<{ externalId: string | null }> {
    const o = ctx.order;
    const { cash, credit, otherPayment } = paymentBuckets(o.payments);
    const grand = money(o.total);
    const body = {
      total: money(o.subtotal),
      grandTotal: grand,
      vat: money(o.tax),
      discount: 0,
      cash, credit, otherPayment,
      applyAutomaticPromotions: false,
      orderType: 'online',
      status: STATUS_MAP[o.status] ?? o.status,
      note: `Online Order #${o.id}`,
      items: [{
        productId: this.cfg.sakCatchAllProductId,
        productVariantId: this.cfg.sakCatchAllVariantId,
        productName: `Online Order #${o.id}`,
        rate: grand,
        quantity: 1,
        unitDiscountAmount: 0,
        subTotal: grand,
        vatAmount: 0,
        totalVat: 0,
        total: grand,
      }],
    };
    const res = await this.client.request<{ voucherId: number }>('POST', '/api/Voucher/order', body);
    return { externalId: res?.voucherId != null ? String(res.voucherId) : null };
  }

  async pushStatus(ctx: PosContext): Promise<void> {
    if (!ctx.externalId) throw new Error(`pushStatus requires externalId for order ${ctx.order.id}`);
    const value = STATUS_MAP[ctx.order.status] ?? ctx.order.status;
    await this.client.request('PUT', '/api/Voucher/bulk-update', {
      ids: [Number(ctx.externalId)],
      action: 'Update',
      field: 'status',
      value,
    });
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/services/pos/providers/foreverpos/orders.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/pos/providers/foreverpos/orders.ts src/services/pos/providers/foreverpos/orders.test.ts
git commit -m "feat(pos): ForeverPosOrderSync (catch-all line, payment buckets, status map)"
```

---

### Task 7: `posOrderService` — enqueue, build context, process outbox

Rewrite the shim into the real orchestrator. Wires the provider via the registry, builds the catch-all-agnostic `PosContext`, owns idempotency + mapping persistence. The registry registration is updated to construct `ForeverPosOrderSync` from store settings lazily (per push) so encrypted creds are read fresh.

**Files:**
- Rewrite: `backend/src/services/pos/orders/posOrderService.ts`
- Rewrite: `backend/src/services/pos/orders/posOrderService.test.ts`
- Modify: `backend/src/services/pos/registry.ts` (build provider from settings)
- Modify: `backend/src/services/pos/providers/foreverpos.provider.ts` → delete (replaced by `foreverpos/orders.ts` + a factory)

**Interfaces:**
- Consumes: `getOrderSync(settings)` (now returns a `PosOrderSync` built from settings); `prisma`; `StoreSettingsService`; `ForeverPosOrderSync` + `ForeverPosClient`.
- Produces:
  ```ts
  export async function enqueue(tx: Prisma.TransactionClient, orderId: number, type: 'ORDER_CREATED' | 'ORDER_UPDATED'): Promise<void>;
  export async function processOutboxRow(row: { id: number; orderId: number; provider: string; type: string; attempts: number }): Promise<void>;
  export async function countPending(): Promise<number>;
  ```

- [ ] **Step 1: Make the registry build the provider from settings**

Replace `registry.ts` so `getOrderSync` constructs the provider from the resolved `posConfig` (returns `null` if provider unknown or required config missing). Delete the stub `providers/foreverpos.provider.ts` and its test.

```ts
import { logger } from '../../utils/logger';
import { PosOrderSync } from './orders/PosOrderSync';
import { ForeverPosClient } from './providers/foreverpos/client';
import { ForeverPosOrderSync } from './providers/foreverpos/orders';
import type { StoreSettings } from '../storeSettings.service';

export function getOrderSync(settings: StoreSettings): PosOrderSync | null {
  if (!settings.posProvider) return null;
  if (settings.posProvider === 'foreverpos') {
    const c = settings.posConfig ?? {};
    if (!c.baseUrl || !c.username || !c.password || c.sakCatchAllProductId == null || c.sakCatchAllVariantId == null) {
      logger.warn('ForeverPOS configured but posConfig incomplete', { event: 'pos_auth_failed', have: Object.keys(c) });
      return null;
    }
    const cfg = {
      baseUrl: c.baseUrl, username: c.username, password: c.password,
      sakCatchAllProductId: c.sakCatchAllProductId, sakCatchAllVariantId: c.sakCatchAllVariantId,
    };
    return new ForeverPosOrderSync(new ForeverPosClient(cfg), cfg);
  }
  logger.warn('Unknown POS provider configured', { posProvider: settings.posProvider });
  return null;
}
```

Update `registry.test.ts` accordingly: a complete `foreverpos` settings object returns a non-null `PosOrderSync`; incomplete config returns null + warn; `posProvider:null` returns null; unknown key returns null + warn. (Provide a full `StoreSettings` literal in the test.)

```bash
git rm src/services/pos/providers/foreverpos.provider.ts src/services/pos/providers/foreverpos.provider.test.ts
```

- [ ] **Step 2: Write the failing posOrderService tests**

`backend/src/services/pos/orders/posOrderService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({ default: {
  order: { findUnique: vi.fn() },
  orderPosMapping: { findUnique: vi.fn(), create: vi.fn() },
  posOutbox: { count: vi.fn() },
} }));
vi.mock('../../storeSettings.service', () => ({ StoreSettingsService: vi.fn(() => ({ getStoreSettings: getStoreSettings })) }));
vi.mock('../registry', () => ({ getOrderSync: getOrderSync }));
vi.mock('../../../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const getStoreSettings = vi.fn();
const getOrderSync = vi.fn();

import prisma from '../../../config/database';
import { enqueue, processOutboxRow } from './posOrderService';

const mockOrder = {
  id: 5, status: 'APPROVED', deliveryMethod: 'PICKUP',
  subtotal: { toNumber: () => 10 }, tax: { toNumber: () => 0.5 }, total: { toNumber: () => 10.5 },
  items: [{ productName: 'X', variantLabel: 'g', quantity: 1, unitPrice: { toNumber: () => 10 }, voided: false }],
  payments: [{ id: 1, method: 'CC', amount: { toNumber: () => 10.5 }, status: 'SETTLED' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  getStoreSettings.mockResolvedValue({ posProvider: 'foreverpos', posConfig: {} });
});

describe('enqueue', () => {
  it('creates a pos_outbox row on the given tx', async () => {
    const tx = { posOutbox: { create: vi.fn() } } as any;
    await enqueue(tx, 5, 'ORDER_CREATED');
    expect(tx.posOutbox.create).toHaveBeenCalledWith({ data: { orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED' } });
  });
});

describe('processOutboxRow ORDER_CREATED', () => {
  it('pushes order, stores mapping', async () => {
    (prisma as any).orderPosMapping.findUnique.mockResolvedValue(null);
    (prisma as any).order.findUnique.mockResolvedValue(mockOrder);
    const provider = { shouldPushStatus: () => true, pushOrder: vi.fn().mockResolvedValue({ externalId: '321' }), pushStatus: vi.fn() };
    getOrderSync.mockReturnValue(provider);

    await processOutboxRow({ id: 1, orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 0 });

    expect(provider.pushOrder).toHaveBeenCalledWith(expect.objectContaining({ order: expect.objectContaining({ id: 5 }) }));
    expect((prisma as any).orderPosMapping.create).toHaveBeenCalledWith({ data: { orderId: 5, provider: 'foreverpos', externalId: '321' } });
  });

  it('is idempotent when a mapping already exists', async () => {
    (prisma as any).orderPosMapping.findUnique.mockResolvedValue({ externalId: '321' });
    const provider = { shouldPushStatus: () => true, pushOrder: vi.fn(), pushStatus: vi.fn() };
    getOrderSync.mockReturnValue(provider);
    await processOutboxRow({ id: 1, orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 0 });
    expect(provider.pushOrder).not.toHaveBeenCalled();
  });
});

describe('processOutboxRow ORDER_UPDATED', () => {
  it('defers (throws) when no mapping yet', async () => {
    (prisma as any).orderPosMapping.findUnique.mockResolvedValue(null);
    (prisma as any).order.findUnique.mockResolvedValue(mockOrder);
    getOrderSync.mockReturnValue({ shouldPushStatus: () => true, pushOrder: vi.fn(), pushStatus: vi.fn() });
    await expect(processOutboxRow({ id: 2, orderId: 5, provider: 'foreverpos', type: 'ORDER_UPDATED', attempts: 0 }))
      .rejects.toThrow(/no mapping/i);
  });

  it('pushes status when mapping exists', async () => {
    (prisma as any).orderPosMapping.findUnique.mockResolvedValue({ externalId: '321' });
    (prisma as any).order.findUnique.mockResolvedValue({ ...mockOrder, status: 'DELIVERED' });
    const provider = { shouldPushStatus: () => true, pushOrder: vi.fn(), pushStatus: vi.fn().mockResolvedValue(undefined) };
    getOrderSync.mockReturnValue(provider);
    await processOutboxRow({ id: 2, orderId: 5, provider: 'foreverpos', type: 'ORDER_UPDATED', attempts: 0 });
    expect(provider.pushStatus).toHaveBeenCalledWith(expect.objectContaining({ externalId: '321' }));
  });
});
```

- [ ] **Step 3: Run, verify fail**

Run: `cd backend && npx vitest run src/services/pos/orders/posOrderService.test.ts`
Expected: FAIL (functions not implemented / signatures differ).

- [ ] **Step 4: Implement `posOrderService.ts`**

```ts
import prisma from '../../../config/database';
import { Prisma } from '../../../generated/prisma';
import { logger } from '../../../utils/logger';
import { StoreSettingsService } from '../../storeSettings.service';
import { getOrderSync } from '../registry';
import { PosContext, PosOrderPayload } from './PosOrderSync';

const PROVIDER = 'foreverpos';

export async function enqueue(
  tx: Prisma.TransactionClient,
  orderId: number,
  type: 'ORDER_CREATED' | 'ORDER_UPDATED',
): Promise<void> {
  await tx.posOutbox.create({ data: { orderId, provider: PROVIDER, type } });
  logger.info('POS outbox enqueued', { event: 'pos_outbox_enqueued', orderId, type });
}

export async function countPending(): Promise<number> {
  return prisma.posOutbox.count({ where: { status: 'PENDING' } });
}

async function buildPayload(orderId: number): Promise<PosOrderPayload | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, payments: true } });
  if (!order) { logger.warn('POS: order not found', { orderId }); return null; }
  return {
    id: order.id,
    status: order.status,
    subtotal: order.subtotal.toNumber(),
    tax: order.tax.toNumber(),
    total: order.total.toNumber(),
    deliveryMethod: order.deliveryMethod,
    items: order.items.filter(i => !i.voided).map(i => ({
      productName: i.productName, variantLabel: i.variantLabel, quantity: i.quantity, unitPrice: i.unitPrice.toNumber(),
    })),
    payments: order.payments.map(p => ({ id: p.id, method: p.method, amount: p.amount.toNumber(), status: p.status })),
  };
}

// Throws on any failure so the worker can record attempts / retry.
export async function processOutboxRow(row: {
  id: number; orderId: number; provider: string; type: string; attempts: number;
}): Promise<void> {
  const settings = await new StoreSettingsService().getStoreSettings();
  const provider = getOrderSync(settings);
  if (!provider) { logger.warn('POS provider unavailable; skipping row', { orderId: row.orderId, rowId: row.id }); return; }

  if (row.type === 'ORDER_CREATED') {
    const existing = await prisma.orderPosMapping.findUnique({ where: { orderId_provider: { orderId: row.orderId, provider: PROVIDER } } });
    if (existing) return; // idempotent

    const payload = await buildPayload(row.orderId);
    if (!payload) return;
    const ctx: PosContext = { order: payload };
    const { externalId } = await provider.pushOrder(ctx);
    if (!externalId) throw new Error(`pushOrder returned no externalId for order ${row.orderId}`);
    await prisma.orderPosMapping.create({ data: { orderId: row.orderId, provider: PROVIDER, externalId } });
    logger.info('POS order created', { event: 'pos_outbox_success', type: row.type, orderId: row.orderId, voucherId: externalId });
    return;
  }

  if (row.type === 'ORDER_UPDATED') {
    const mapping = await prisma.orderPosMapping.findUnique({ where: { orderId_provider: { orderId: row.orderId, provider: PROVIDER } } });
    if (!mapping) throw new Error(`no mapping yet for order ${row.orderId} (defer ORDER_UPDATED)`);
    const payload = await buildPayload(row.orderId);
    if (!payload) return;
    await provider.pushStatus({ order: payload, externalId: mapping.externalId });
    logger.info('POS status updated', { event: 'pos_outbox_success', type: row.type, orderId: row.orderId, voucherId: mapping.externalId });
    return;
  }

  throw new Error(`unknown outbox type: ${row.type}`);
}
```

Note: `orderId_provider` is the compound unique selector generated from `@@unique([orderId, provider])`.

- [ ] **Step 5: Run, verify pass**

Run: `npx vitest run src/services/pos/orders/posOrderService.test.ts && npx vitest run src/services/pos/registry.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(pos): posOrderService enqueue + outbox processing + idempotency + mapping"
```

---

### Task 8: Outbox worker + start in `index.ts`

The "defer ORDER_UPDATED" case (thrown when no mapping yet) must NOT consume an attempt — the worker treats a deferral distinctly from a real failure.

**Files:**
- Create: `backend/src/services/pos/orders/outboxWorker.ts`
- Create: `backend/src/services/pos/orders/outboxWorker.test.ts`
- Modify: `backend/src/index.ts` (start the worker after `app.listen`)

**Interfaces:**
- Consumes: `processOutboxRow`, `countPending` from `./posOrderService`; `prisma`.
- Produces: `export async function runOutboxOnce(): Promise<void>`; `export function startOutboxWorker(): NodeJS.Timeout`.

- [ ] **Step 1: Write the failing tests**

`backend/src/services/pos/orders/outboxWorker.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({ default: {
  $queryRaw: vi.fn(),
  posOutbox: { update: vi.fn() },
} }));
vi.mock('./posOrderService', () => ({ processOutboxRow: vi.fn(), countPending: vi.fn().mockResolvedValue(0) }));
vi.mock('../../../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import prisma from '../../../config/database';
import { processOutboxRow } from './posOrderService';
import { runOutboxOnce } from './outboxWorker';
import { logger } from '../../../utils/logger';

beforeEach(() => vi.clearAllMocks());

describe('runOutboxOnce', () => {
  it('marks a row DONE on success', async () => {
    (prisma as any).$queryRaw.mockResolvedValue([{ id: 1, orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 0 }]);
    (processOutboxRow as any).mockResolvedValue(undefined);
    await runOutboxOnce();
    expect((prisma as any).posOutbox.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'DONE' } });
  });

  it('increments attempts and stays PENDING on failure below cap', async () => {
    (prisma as any).$queryRaw.mockResolvedValue([{ id: 2, orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 1 }]);
    (processOutboxRow as any).mockRejectedValue(new Error('boom'));
    await runOutboxOnce();
    expect((prisma as any).posOutbox.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { status: 'PENDING', attempts: 2, lastError: expect.stringContaining('boom') } });
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ event: 'pos_outbox_retry' }));
  });

  it('marks FAILED at the attempts cap', async () => {
    (prisma as any).$queryRaw.mockResolvedValue([{ id: 3, orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 4 }]);
    (processOutboxRow as any).mockRejectedValue(new Error('boom'));
    await runOutboxOnce();
    expect((prisma as any).posOutbox.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { status: 'FAILED', attempts: 5, lastError: expect.stringContaining('boom') } });
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), expect.anything(), expect.objectContaining({ event: 'pos_outbox_failed' }));
  });

  it('defers ORDER_UPDATED without consuming an attempt', async () => {
    (prisma as any).$queryRaw.mockResolvedValue([{ id: 4, orderId: 5, provider: 'foreverpos', type: 'ORDER_UPDATED', attempts: 0 }]);
    (processOutboxRow as any).mockRejectedValue(new Error('no mapping yet for order 5 (defer ORDER_UPDATED)'));
    await runOutboxOnce();
    expect((prisma as any).posOutbox.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && npx vitest run src/services/pos/orders/outboxWorker.test.ts`
Expected: FAIL ("Cannot find module './outboxWorker'").

- [ ] **Step 3: Implement the worker**

`backend/src/services/pos/orders/outboxWorker.ts`:

```ts
import prisma from '../../../config/database';
import { Prisma } from '../../../generated/prisma';
import { logger } from '../../../utils/logger';
import { processOutboxRow, countPending } from './posOrderService';

const MAX_ATTEMPTS = 5;
const POLL_MS = Number(process.env.POS_OUTBOX_POLL_MS ?? 30000);
const BATCH = 10;
const BACKLOG_THRESHOLD = Number(process.env.POS_OUTBOX_BACKLOG_THRESHOLD ?? 50);

interface OutboxRow { id: number; orderId: number; provider: string; type: string; attempts: number; }

function isDeferral(err: unknown): boolean {
  return err instanceof Error && /defer ORDER_UPDATED/.test(err.message);
}

export async function runOutboxOnce(): Promise<void> {
  // Claim oldest PENDING rows; SKIP LOCKED makes this safe across instances.
  const rows = await prisma.$queryRaw<OutboxRow[]>(Prisma.sql`
    SELECT id, "orderId", provider, type, attempts
    FROM pos_outbox
    WHERE status = 'PENDING'
    ORDER BY id
    LIMIT ${BATCH}
    FOR UPDATE SKIP LOCKED
  `);

  for (const row of rows) {
    try {
      await processOutboxRow(row);
      await prisma.posOutbox.update({ where: { id: row.id }, data: { status: 'DONE' } });
    } catch (err) {
      if (isDeferral(err)) {
        // Not a failure — the ORDER_CREATED row hasn't completed yet. Leave PENDING, no attempt consumed.
        continue;
      }
      const attempts = row.attempts + 1;
      const lastError = err instanceof Error ? err.message : String(err);
      if (attempts >= MAX_ATTEMPTS) {
        await prisma.posOutbox.update({ where: { id: row.id }, data: { status: 'FAILED', attempts, lastError } });
        logger.error('POS outbox row failed permanently', err, { event: 'pos_outbox_failed', rowId: row.id, orderId: row.orderId, attempts });
      } else {
        await prisma.posOutbox.update({ where: { id: row.id }, data: { status: 'PENDING', attempts, lastError } });
        logger.warn('POS outbox row will retry', { event: 'pos_outbox_retry', rowId: row.id, orderId: row.orderId, attempts, error: lastError });
      }
    }
  }

  const pending = await countPending();
  if (pending > BACKLOG_THRESHOLD) {
    logger.warn('POS outbox backlog high', { event: 'pos_outbox_backlog_high', pending, threshold: BACKLOG_THRESHOLD });
  }
}

export function startOutboxWorker(): NodeJS.Timeout {
  logger.info('POS outbox worker starting', { pollMs: POLL_MS });
  return setInterval(() => {
    runOutboxOnce().catch((err) => logger.error('POS outbox worker loop crashed', err, { event: 'pos_worker_crashed' }));
  }, POLL_MS);
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/services/pos/orders/outboxWorker.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Start the worker in `index.ts`**

In `backend/src/index.ts`, add an import near the top:

```ts
import { startOutboxWorker } from './services/pos/orders/outboxWorker';
```

Inside the existing `app.listen(PORT, () => { ... })` callback, after the existing startup logs, add:

```ts
  startOutboxWorker();
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: 0 errors.

```bash
git add -A && git commit -m "feat(pos): outbox worker (FOR UPDATE SKIP LOCKED, retry/fail/defer) started in index"
```

---

### Task 9: Wire enqueues into `order.service.ts`; remove old detached calls

Replace the fire-and-forget POS calls with transactional enqueues. The SAK order is created on the APPROVED transition; other status changes passing `shouldPushStatus` enqueue `ORDER_UPDATED`. Order *creation* no longer pushes to POS.

**Files:**
- Modify: `backend/src/services/order.service.ts`
- Modify: `backend/src/services/order.service.test.ts`

**Interfaces:**
- Consumes: `enqueue(tx, orderId, type)` from `./pos/orders/posOrderService`; `getOrderSync` from `./pos/registry`.

- [ ] **Step 1: Update the order.service tests**

In `backend/src/services/order.service.test.ts`, replace the existing posService mock with the enqueue/registry mocks:

```ts
const posOrderService = vi.hoisted(() => ({ enqueue: vi.fn().mockResolvedValue(undefined), pushOrderCreated: vi.fn(), pushOrderUpdated: vi.fn() }));
const posRegistry = vi.hoisted(() => ({ getOrderSync: vi.fn() }));
vi.mock('./pos/orders/posOrderService', () => posOrderService);
vi.mock('./pos/registry', () => posRegistry);
```

In `beforeEach`, default the provider to "pushes everything":

```ts
posOrderService.enqueue.mockClear();
posRegistry.getOrderSync.mockReturnValue({ shouldPushStatus: () => true, pushOrder: vi.fn(), pushStatus: vi.fn() });
```

Add assertions:
- In the APPROVED-transition status-update test:
  ```ts
  await vi.waitFor(() => expect(posOrderService.enqueue).toHaveBeenCalledWith(expect.anything(), expect.any(Number), 'ORDER_CREATED'));
  ```
- In a non-APPROVED status-update test (e.g. → DELIVERED on an already-approved order):
  ```ts
  await vi.waitFor(() => expect(posOrderService.enqueue).toHaveBeenCalledWith(expect.anything(), expect.any(Number), 'ORDER_UPDATED'));
  ```
- In the order-*creation* happy path test, assert NO POS push at creation:
  ```ts
  expect(posOrderService.enqueue).not.toHaveBeenCalled();
  ```
- When `getOrderSync` returns null (no provider), assert `enqueue` is not called on a status change.

- [ ] **Step 2: Run, verify the new assertions fail**

Run: `cd backend && npx vitest run src/services/order.service.test.ts`
Expected: FAIL on the new enqueue assertions.

- [ ] **Step 3: Convert `updateOrderStatus` to a callback transaction + enqueue**

In `order.service.ts`:

1. Replace the import at line 15:
   ```ts
   import * as posOrderService from './pos/orders/posOrderService';
   import { getOrderSync } from './pos/registry';
   ```
2. Remove the POS push from `dispatchOrderCreatedEffects` (delete the `void posService.pushOrderCreated(...)` block). Keep notifications + printing.
3. In `dispatchOrderStatusUpdatedEffects`, remove the `void posService.pushOrderUpdated(...)` block (enqueue now happens inside the transaction, not here). Keep `notifyOrderStatusUpdated`.
4. Convert the `updateOrderStatus` array transaction to a callback so the enqueue is atomic with the status write. Replace:
   ```ts
   const [updatedOrder] = await prisma.$transaction([
     prisma.order.update({ where: { id: orderId }, data: { status: data.status } }),
     prisma.orderStatusEvent.create({ data: { orderId, fromStatus: order.status, toStatus: data.status, changedBy: data.changedBy ?? null, note: data.note ?? null } }),
   ]);
   ```
   with:
   ```ts
   const settings = await new StoreSettingsService().getStoreSettings();
   const orderSync = getOrderSync(settings);
   const updatedOrder = await prisma.$transaction(async (tx) => {
     const upd = await tx.order.update({ where: { id: orderId }, data: { status: data.status } });
     await tx.orderStatusEvent.create({ data: { orderId, fromStatus: order.status, toStatus: data.status, changedBy: data.changedBy ?? null, note: data.note ?? null } });
     if (data.status === OrderStatus.APPROVED && order.paymentMethod === PaymentMethodEnum.EXTERNAL) {
       await tx.payment.updateMany({ where: { orderId, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.SETTLED } });
     }
     if (orderSync) {
       if (data.status === OrderStatus.APPROVED) {
         await posOrderService.enqueue(tx, orderId, 'ORDER_CREATED');
       } else if (orderSync.shouldPushStatus(data.status)) {
         await posOrderService.enqueue(tx, orderId, 'ORDER_UPDATED');
       }
     }
     return upd;
   });
   ```
   Remove the now-duplicated post-transaction `if (data.status === APPROVED && ... EXTERNAL)` payment-settle block (it moved inside the transaction). Add `StoreSettingsService` to the imports if not already present.

5. In `customerArrive`, after the status write, enqueue an `ORDER_UPDATED` if the provider wants it. Inside its transaction/update path add:
   ```ts
   const settings = await new StoreSettingsService().getStoreSettings();
   const orderSync = getOrderSync(settings);
   if (orderSync && orderSync.shouldPushStatus(OrderStatus.ARRIVED)) {
     await prisma.posOutbox.create({ data: { orderId, provider: 'foreverpos', type: 'ORDER_UPDATED' } }).catch(() => undefined);
   }
   ```
   (If `customerArrive` already uses a transaction, prefer `posOrderService.enqueue(tx, ...)` inside it; otherwise the direct create above is acceptable since ARRIVED is not payment-critical.)

`StoreSettingsService` is imported from `'./storeSettings.service'`.

- [ ] **Step 4: Run order.service tests + full pos suite + typecheck**

Run: `cd backend && npx vitest run src/services/order.service.test.ts src/services/pos/ && npx tsc --noEmit`
Expected: PASS, 0 type errors.

- [ ] **Step 5: Run the integration suite**

Run: `npx vitest run src/integration/order.routes.test.ts`
Expected: PASS (order routes mock the whole order.service; no POS coupling at the route layer).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(pos): enqueue ORDER_CREATED on APPROVED and ORDER_UPDATED on status changes (transactional); drop creation-time POS push"
```

---

## Final Verification

- [ ] Run the whole backend suite: `cd backend && npx vitest run` — triage any flaky `order.service.*` parallel-contention failures by re-running the named files in isolation (a known pre-existing flake, not caused by this work).
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] Manual live smoke (optional, against SAK sandbox, real `posConfig`): set an order to APPROVED → confirm a `pos_outbox` row goes `PENDING → DONE`, an `order_pos_mappings` row appears with the SAK `voucherId`, and the order shows in `GET /api/Voucher/online-orders`. Change status → confirm a `bulk-update` reaches SAK. Stop the server mid-outage → confirm the row stays `PENDING` and drains on restart.
- [ ] **Rotate the SAK password** before production; ensure creds live only in encrypted `posConfig`.

## Self-Review Notes (coverage map)

- Capability restructure → Task 1. Outbox/mapping tables → Task 2. posConfig catch-all IDs → Task 3. Interface (`PosContext`/`pushStatus`) → Task 4. Client (auth/401) → Task 5. Provider (catch-all line, payment buckets, status map, bulk-update) → Task 6. Orchestrator (enqueue/process/idempotency/mapping/defer) → Task 7. Worker (`SKIP LOCKED`, retry/fail/defer, backlog) + `index.ts` start → Task 8. APPROVED-trigger wiring + remove creation-time push → Task 9. Observability events appear across Tasks 5–8 (`pos_auth_failed`, `pos_outbox_*`, `pos_worker_crashed`). Returns/refunds + per-product inventory: out of scope per spec.
