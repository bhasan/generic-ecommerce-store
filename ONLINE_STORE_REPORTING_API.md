# Online Store Reporting API

## Purpose

The online store exposes a trusted, server-to-server Reporting API for stable ecommerce source facts. PHYSALIA is one trusted internal consumer of this generic Online Store Reporting API.

The API provides source/reporting data for:

- products
- categories
- inventory snapshots derived from available product stock
- online orders
- online order line items
- safe payment summaries
- refunds only if truly modeled by this application
- fulfillment status where available from order state
- customers only when explicitly enabled and kept minimal

The online store does not own canonical analytics, dashboard logic, forecasting, reorder recommendations, purchase orders, AI explanations, POS adapter logic, or inventory movement history unless those workflows are truly represented in this application.

## Provider Identity

```text
provider_key = ONLINE_STORE
source_system = online_store
source_display_name = Online Store
schema_version = 2026-06-online-store-reporting-v1
base_path = /api/reporting/v1
```

## Authority Matrix

| Data area | Online store authority? | Notes |
| --- | --- | --- |
| Online orders | Yes | Source of truth for ecommerce orders. |
| Online order line items | Yes | Actual ecommerce line items from the order database. |
| Online payments | Partial | Summary only; no sensitive processor data. |
| Online refunds | No for current V1 | No first-class refund model exists today. |
| Fulfillment/shipping | Partial | Derived from current pickup/delivery/curbside order statuses. |
| Product catalog | Yes for app catalog | SKU, barcode, brand, and cost are not currently modeled. |
| Inventory | Partial | Snapshot values derived from current product stock; no movement ledger. |
| Customers | Optional | Disabled by default; only stable internal IDs when enabled. |
| Vendor/PO/receiving | No for V1 | Not owned by this online store workflow. |

## Routes

Canonical V1 routes:

```text
GET /api/reporting/v1/health
GET /api/reporting/v1/metadata
GET /api/reporting/v1/products
GET /api/reporting/v1/categories
GET /api/reporting/v1/inventory-snapshots
GET /api/reporting/v1/orders
GET /api/reporting/v1/refunds
```

Do not expose or alias `/api/physalia/v1/*`.

Future routes, only if real source models are added:

```text
GET /api/reporting/v1/payments
GET /api/reporting/v1/fulfillments
GET /api/reporting/v1/customers
GET /api/reporting/v1/delta
```

## Security

- Server-to-server API only.
- Disabled by default with `ONLINE_STORE_REPORTING_API_ENABLED=false`.
- Bearer token required from `ONLINE_STORE_REPORTING_API_TOKEN`.
- No browser-exposed token.
- Auth headers must not be logged.
- All responses include or preserve a `request_id`.
- No customer passwords.
- No payment processor secrets.
- No card numbers, CVV, or raw payment tokens.
- No unrestricted admin endpoints.
- Rate limits are controlled by `ONLINE_STORE_REPORTING_API_RATE_LIMIT_PER_MINUTE`.

Recommended request headers:

```http
Authorization: Bearer <ONLINE_STORE_REPORTING_API_TOKEN>
Accept: application/json
X-Request-Id: <uuid>
```

## Response Envelope

Every list response uses:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "page_size": 100,
    "has_next": false,
    "next_page": null
  },
  "meta": {
    "request_id": "req_123",
    "generated_at": "2026-06-16T10:00:00Z",
    "source_system": "online_store",
    "provider_key": "ONLINE_STORE",
    "schema_version": "2026-06-online-store-reporting-v1"
  }
}
```

Every record should include, where supported by the source schema:

- `id`
- `created_at`
- `updated_at`
- `deleted_at`
- `status`
- `source_updated_at`, if different from `updated_at`

## Query Behavior

Every list endpoint supports:

```text
?page=1
&page_size=100
&updated_since=2026-06-01T00:00:00Z
&created_since=2026-06-01T00:00:00Z
&created_until=2026-06-16T23:59:59Z
```

Order endpoints also support:

```text
&placed_since=2026-06-01T00:00:00Z
&placed_until=2026-06-16T23:59:59Z
&status=paid
```

Rules:

- Use UTC ISO-8601 timestamps.
- Never return random source IDs.
- Source IDs must be stable.
- `updated_since` must catch product edits, order changes, fulfillment changes, and refund changes where those models exist.
- Soft-deleted or archived records should be represented through `deleted_at`/`status` when the source app supports those states.
- Do not invent fields the source schema does not have.
- Return `null`, `[]`, or documented limitations for unsupported source facts.

## Endpoint Contracts

### Health

`GET /api/reporting/v1/health`

```json
{
  "status": "ok",
  "service": "online_store_reporting_api",
  "provider_key": "ONLINE_STORE",
  "source_system": "online_store",
  "schema_version": "2026-06-online-store-reporting-v1",
  "generated_at": "2026-06-16T10:00:00Z"
}
```

### Metadata

`GET /api/reporting/v1/metadata`

Metadata reports actual current capability. Current V1 should report:

```json
{
  "provider_key": "ONLINE_STORE",
  "source_system": "online_store",
  "source_display_name": "Online Store",
  "schema_version": "2026-06-online-store-reporting-v1",
  "store_timezone": "America/Chicago",
  "currency": "USD",
  "supports": {
    "products": true,
    "variants": false,
    "categories": true,
    "inventory_snapshots": true,
    "orders": true,
    "order_line_items": true,
    "payments": true,
    "refunds": false,
    "fulfillments": true,
    "customers": false,
    "webhooks": false
  },
  "limits": {
    "max_page_size": 250,
    "default_page_size": 100,
    "max_backfill_months": 24
  }
}
```

### Products

`GET /api/reporting/v1/products`

Includes product fields such as `id`, nullable `sku`, nullable `barcode`, `name`, `description`, `category_id`, `category_name`, nullable `brand`, `status`, `price`, nullable `cost`, `inventory_quantity`, timestamps, and `variants: []`.

### Categories

`GET /api/reporting/v1/categories`

Includes `id`, `name`, `parent_id`, `status`, timestamps, and `deleted_at`.

### Inventory Snapshots

`GET /api/reporting/v1/inventory-snapshots`

This endpoint exposes inventory snapshots, not a movement ledger. Values are derived from current product stock.

### Orders

`GET /api/reporting/v1/orders`

Orders include headers, real ecommerce order line items, and safe payment summaries inline for V1. Historical subtotal/tax/name snapshot fields are limited by the current schema and documented in each order's `limitations`.

### Refunds

`GET /api/reporting/v1/refunds`

The current app does not have a first-class refund model. V1 returns an empty paginated response with metadata:

- `refunds_supported=false`
- cancellations are represented through order status where available
- partial refunds are not supported
- refund restock is not modeled

Do not fake refund records.

## Environment Variables

```bash
ONLINE_STORE_REPORTING_API_ENABLED=false
ONLINE_STORE_REPORTING_API_TOKEN=
ONLINE_STORE_REPORTING_API_MAX_PAGE_SIZE=250
ONLINE_STORE_REPORTING_API_DEFAULT_PAGE_SIZE=100
ONLINE_STORE_REPORTING_API_RATE_LIMIT_PER_MINUTE=120
ONLINE_STORE_REPORTING_API_INCLUDE_CUSTOMERS=false
ONLINE_STORE_REPORTING_API_INCLUDE_PAYMENT_DETAILS=false
ONLINE_STORE_REPORTING_API_SCHEMA_VERSION=2026-06-online-store-reporting-v1
```

## Non-Goals for V1

The Online Store Reporting API will not:

- expose customer passwords
- expose full card numbers, CVV, processor secrets, or payment tokens
- expose internal admin-only APIs
- perform consumer-specific canonical mapping
- calculate dashboards
- create reorder recommendations
- create purchase orders
- perform AI analysis
- replace downstream sync/reconciliation
- expose inventory movement history unless the online store truly records movement events
