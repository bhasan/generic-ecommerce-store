# Performance Baseline — Before Fixes

Captured: 2026-06-23 (before any performance tasks)
Branch: fix/performance_tweaks
Dataset: Dev seed — 6 products, 8 orders, 11 users, 2 categories (small; query-count metrics are valid regardless of size; latency numbers should be re-measured on a realistic dataset)

---

## DB Queries per Request

Measured by tailing `prisma:query` log lines in the running Docker backend (`NODE_ENV=development`, Prisma query logging enabled).

| Endpoint | Queries/req (before) | Queries/req (after) | Notes |
|---|---|---|---|
| `GET /api/config` | **1** | — | 4 `SettingsStore.read()` calls in `Promise.all()` — Prisma dataloader batches them into 1 `WHERE key IN ($1,$2,$3,$4)`. Plan predicted 4; actual is 1. Cache (Task 2) eliminates this to 0 on warm hits. |
| `GET /api/branding/css` | **1** | — | Single `findUnique` for branding key. Cache-Control: `no-store` confirmed. ETag+max-age (Task 3) will let browsers skip the request entirely after first load. |
| `GET /api/products` | **6** | — | products + categories + images + variants + qty_options + price_breaks (all Prisma-batched, no N+1). Task 7 cap bounds payload; Task 10A adds search; Task 10B bounds DOM. |
| `GET /api/orders?limit=25` (admin) | **6** | — | orders + users + items + variants + products + images. Task 4 lean items drops variants/products/images join → expected 3 queries after. |
| `POST /api/auth/login` (role lookup) | **3** | — | user + user_roles.findMany + role.findMany (2-step). Task 6 collapses to 1 nested query → 1 query after. |

---

## Payload Sizes

| Endpoint | Before (bytes) | After (bytes) |
|---|---|---|
| `GET /api/config` | 682 | — |
| `GET /api/branding/css` | 8 | — |
| `GET /api/products` | 6,537 | — |
| `GET /api/orders?limit=25` (admin) | 8,541 | — |

---

## p50 / p95 Latency (10 sequential requests, host → Docker container, dev environment)

> Note: these numbers are not meaningful for tuning — the Docker-on-WSL network and tiny seed data mean they will be ~2–10ms regardless. Re-run with a realistic dataset and `npx autocannon` for load-test numbers. Included here only for completeness.

| Endpoint | p50 (before) | p95 (before) | p50 (after) | p95 (after) |
|---|---|---|---|---|
| `GET /api/config` | 3ms | 3ms | — | — |
| `GET /api/branding/css` | 3ms | 3ms | — | — |
| `GET /api/products` | 6ms | 8ms | — | — |
| `GET /api/orders?limit=25` | 7ms | 9ms | — | — |

---

## Current HTTP Cache Headers

| Endpoint | Cache-Control (before) | Cache-Control (after) |
|---|---|---|
| `GET /api/config` | *(none)* | — |
| `GET /api/branding/css` | `no-store` | — |
| `GET /api/products` | *(none)* | — |

---

## Key Deviations from Static Analysis Predictions

1. **`/api/config` queries:** Plan predicted 4 separate `findUnique` calls. Actual: **1 batched query** — Prisma's dataloader coalesces the 4 concurrent calls in `Promise.all()` into `WHERE key IN (...)`. The in-process cache (Task 2) still eliminates this to 0 on warm requests; the per-call savings are smaller than predicted (1→0, not 4→0).

2. **Geocode loop (Task 5):** Confirmed not an N+1. Both `resolveAddress` callers pass a single-element `cacheKeys` array. Task 5 remains optional/deferred.

3. **Settings queries on every request:** Some endpoints fire a `key IN ($1,$2,$3,$4)` settings batch even outside `/api/config` (from concurrent frontend polling). The in-process cache benefits compound across all of these.

---

## Fill In After Each Relevant Task

Update the "after" columns above after Tasks 2, 3, 4, 6, 7, 10A are complete.
