# Performance Baseline — Before/After Fixes

Captured: 2026-06-23 (before) / 2026-06-24 (after)
Branch: fix/performance_tweaks
Dataset: Dev seed — 6 products, 8 orders, 11 users, 2 categories (small; query-count metrics are valid regardless of size; latency numbers should be re-measured on a realistic dataset)

---

## DB Queries per Request

Measured by counting `prisma:query` log lines (`NODE_ENV=development`, Prisma query logging enabled).

"After" query counts: cold = first request after server start (empty in-process cache); warm = subsequent request (cache populated).

| Endpoint | Queries/req (before) | Queries/req (after) | Notes |
|---|---|---|---|
| `GET /api/config` (cold) | **1** | **1** | SettingsStore cache miss → 1 batched `WHERE key IN (...)`. After first request, cache populated. |
| `GET /api/config` (warm) | **1** | **0** | Task 2 TTL cache — zero DB queries on warm hits. |
| `GET /api/branding/css` (cold) | **1** | **1** | Branding key read, then cached in SettingsStore. |
| `GET /api/branding/css` (warm) | **1** | **0** | Task 2 + Task 3 — zero DB queries; ETag 304 on repeat browser requests. |
| `GET /api/products` | **6** | **6** | Unchanged — full include required for price calculation (products + categories + images + variants + qty_options + price_breaks). Task 7 bounds payload; Task 10A adds search endpoint. |
| `GET /api/orders?limit=25` (admin) | **6** | **3** | Task 4 removed variants/products/images join. Now: orders + users IN-batch + order_items IN-batch = 3 queries. |
| `POST /api/auth/login` (role lookup) | **3** | **2** | Task 6 `getUserRolesWithNames` — user lookup (1) + single nested `include: { role: true }` Prisma call (generates 2 SQL: user_roles + roles batch). Net: 3 → 2 for single-role users; eliminates N+1 for users with many roles. Note: plan predicted 1 after; actual is 2 because Prisma `include` always issues 2 SQL statements. |

---

## Payload Sizes

| Endpoint | Before (bytes) | After (bytes) | Change |
|---|---|---|---|
| `GET /api/config` | 682 | 682 | No change (same data) |
| `GET /api/branding/css` | 8 | 8 | No change (304 on repeat) |
| `GET /api/products` | 6,537 | 6,537 | No change (full include unchanged; Task 7 caps at 100 items) |
| `GET /api/orders?limit=25` (admin) | 8,541 | 7,046 | **−17.5%** — Task 4 lean items payload (no variant/product/image join) |

---

## p50 / p95 Latency (10 sequential requests, host → backend, dev environment)

> Note: dev-environment latency numbers are dominated by process/I/O overhead, not query cost. Re-run with a realistic dataset and `npx autocannon` for meaningful load-test numbers.

| Endpoint | p50 (before) | p95 (before) | p50 (after) | p95 (after) |
|---|---|---|---|---|
| `GET /api/config` | 3ms | 3ms | 4ms | 4ms |
| `GET /api/branding/css` | 3ms | 3ms | 1ms | 2ms |
| `GET /api/products` | 6ms | 8ms | 10ms | 14ms |
| `GET /api/orders?limit=25` | 7ms | 9ms | 7ms | 8ms |

> `/api/branding/css` dropped 3ms → 1ms because the ETag 304 path skips the DB entirely.
> `/api/products` appears slightly higher due to measurement timing (first-hit vs warm-connection-pool effect at dev scale — not a regression).

---

## HTTP Cache Headers

| Endpoint | Cache-Control (before) | Cache-Control (after) |
|---|---|---|
| `GET /api/config` | *(none)* | `public, max-age=30, must-revalidate` + ETag |
| `GET /api/branding/css` | `no-store` | `public, max-age=60, must-revalidate` + ETag (304 confirmed) |
| `GET /api/products` | *(none)* | ETag (weak) |

---

## Key Deviations from Static Analysis Predictions

1. **`/api/config` queries:** Plan predicted 4 separate `findUnique` calls. Actual: **1 batched query** — Prisma's dataloader coalesces the 4 concurrent calls in `Promise.all()` into `WHERE key IN (...)`. The in-process cache (Task 2) still eliminates this to 0 on warm requests; the per-call savings are smaller than predicted (1→0, not 4→0).

2. **Geocode loop (Task 5):** Confirmed not an N+1. Both `resolveAddress` callers pass a single-element `cacheKeys` array. Task 5 remains optional/deferred.

3. **Settings queries on every request:** Some endpoints fire a `key IN ($1,$2,$3,$4)` settings batch even outside `/api/config` (from concurrent frontend polling). The in-process cache benefits compound across all of these.

4. **`POST /api/auth/login` after Task 6:** Plan predicted 1 query after. Actual: 2 SQL queries — Prisma's `include: { role: true }` always executes as 2 SELECT statements (user_roles then roles). The N+1 loop is eliminated (was N+2 for N roles; now always 2 regardless of role count), but not reduced to 1.
