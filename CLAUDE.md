# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Generic Ecommerce Store is a multi-tenant e-commerce + delivery/POS platform. Three apps in one repo: `web/` (React 19 + Vite SPA), `backend/` (Express + TypeScript + Prisma API), `nginx/` (reverse proxy).

`backend/prisma/schema.prisma` is the DB source of truth; `backend/src/routes/*.ts` and `services/*.ts` are the behavioral source of truth. Older markdown docs may be stale — verify against code and schema.

## Commands

Backend/web tests use **vitest** (not jest). Run from repo root or per-package:

```bash
npm test                                          # backend + web
npm --prefix backend test -- order.service.test.ts   # single file
npm --prefix backend test -- -t "missing context"    # single test by name
npm --prefix web test -- AppContext.test.jsx
npm run test:e2e                                  # Playwright
npm --prefix web run lint                         # ESLint (frontend only; no backend lint)
npm --prefix backend run build                    # tsc typecheck
```

### Local dev (Docker — preferred)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build db backend web-dev
docker exec smoke-station-delivery-backend npm run prisma:migrate
```

App → `http://localhost:5843` (Vite, proxies `/api` → backend:3000). DB on host port `15432`. Always combine the base compose file with a `.dev.yml`/`.prod.yml` override — never run an override alone.

### Prisma (inside `backend/`)

`npm run prisma:generate` after schema edits, `prisma:migrate`, `prisma:studio`. The generated client lives at `backend/generated/prisma` (imported as `../../generated/prisma`), **not** `@prisma/client`.

## Multi-tenancy (read before touching the data layer)

Tenant isolation is enforced centrally, not at each call site:

1. **`resolveTenant` middleware** runs on every `/api` request. Resolves tenant from (priority order) `x-tenant-id`/`x-tenant-slug` headers → JWT `tenantId` claim → subdomain/custom domain. Apex/`www` → default slug `app`; `admin` subdomain → super-admin scope (`tenantId: 0`); unknown subdomain → 404. Wraps `next()` in `runWithTenant(ctx, ...)`.
2. **`runWithTenant`** stores `{ tenantId, storeId, scope }` in `AsyncLocalStorage`.
3. **The tenant-scoped Prisma client** is a `$extends` interceptor that reads the ALS context and auto-injects/filters `tenantId` (+ `storeId` for store-scoped tables) on every query. **Business code must never pass `tenantId` manually.**

Which client: **`getTenantPrisma()` (default export)** for request-scoped logic (auto-isolates); **`getUnscopedPrisma()`** for seeds, migrations, the outbox worker, super-admin ops, and the tenant lookup itself (no scoping — pass `tenantId`/`storeId` explicitly). Table scoping (unscoped vs store-scoped vs tenant-scoped) is declared in `tenantScope.ts`.

### Tenancy gotchas (cause silent leaks or runtime errors)

- **Always `await` inside the `runWithTenant` callback.** Returning a lazy `PrismaPromise` synchronously exits the ALS context before the query runs → `MissingTenantContextError` or cross-tenant leak. `await runWithTenant(ctx, async () => await prisma.x.findMany())`, never `runWithTenant(ctx, () => prisma.x.findMany())`.
- **`tenantId`/`storeId` are `Int?` in schema.prisma but `NOT NULL` in Postgres** — optional only so the scoped client can inject them. Writes via `getUnscopedPrisma()` must set them explicitly.
- **Missing tenant context fails closed in production AND tests** (`NODE_ENV=production`/`test` or `VITEST` → throw); dev logs a warning and passes through. A missing-context regression turns the suite red — keep it that way.
- **Look up unique rows by compound key** (`tenantId_username`, `tenantId_slug`) to use the compound index instead of the extension's `findFirst` fallback.
- **Reserved slugs** (never allow as a tenant slug): `admin`, `www`, `app`, `api`, `portal`, `status`, `health`, `metrics`, `dev`, `staging`, `prod`.
- **Uploads are tenant-isolated** under `uploads/tenants/<id>/`, served only via the guarded `/api/uploads/tenants/:tenantId/:filename` route; the broad static mount 404s that path to prevent cross-tenant leaks.

## Conventions

- Auth is **JWT with multi-role arrays** (`roles: RoleName[]`) and **`username`-based, not email**. Prefer `hasRole`/`hasAnyRole` over legacy single-role code. Don't reintroduce email-auth assumptions except on explicit backward-compat paths.
- Every request gets a `requestId` returned as `x-request-id`; errors preserve it end-to-end (frontend surfaces it via `services/api.js`). Keep that correlation intact.
- Prisma `Decimal` money fields → numbers in every JSON response via `serializeDecimal` middleware; don't re-serialize.
- Domain events flow through an in-process event bus + `subscribers/`; POS/printer integration drains a transactional **outbox** worker (started in `index.ts`).
- Outbound notifications/emails go to a shared **Make.com webhook** (`MAKE_*` env). Keep payloads sanitized — no addresses, phone numbers, payment handles, rejection notes, or raw message bodies.
- Frontend: code is organized by **feature** under `web/src/features/`; shared state is split React contexts under `web/src/context/` (composed by `AppContext.jsx`). API calls go through `web/src/services/*Api.js` (handles retries/timeouts/`requestId`) — don't `fetch` from components. `web/src/data/mockData.js` is legacy reference, not runtime truth.
- Tests live in `backend/src/**/*.test.ts` and `web/src/**/*.test.{js,jsx}`. Keep fixtures aligned with runtime truth (`username` auth, `roles` arrays, `requestId`). If behavior changes, update tests in the same branch.

Prefer additive changes; preserve response shapes, auth rules, redirects, and retry behavior unless the task authorizes a functional change.

## Key files

| Concern | File |
| --- | --- |
| DB schema, enums (`OrderStatus`, roles) | `backend/prisma/schema.prisma` |
| Tenant resolution (host/JWT/header → tenant) | `backend/src/middleware/tenant.middleware.ts` |
| ALS tenant context (`runWithTenant`) | `backend/src/config/tenantContext.ts` |
| Scoped/unscoped Prisma clients + `$extends` injector | `backend/src/config/database.ts` |
| Table scoping declarations | `backend/src/config/tenantScope.ts` |
| Role names + helpers | `backend/src/constants/roles.ts` |
| App bootstrap, middleware order, route mounts | `backend/src/index.ts` |
| Request ID / logging | `backend/src/middleware/logger.middleware.ts` |
| Event bus / subscribers | `backend/src/services/event-bus.service.ts`, `backend/src/subscribers/` |
| POS outbox worker | `backend/src/services/pos/orders/outboxWorker` |
| Frontend app shell + routes | `web/src/App.jsx` |
| Composed app state | `web/src/context/AppContext.jsx` |
| Frontend API client (retries/`requestId`) | `web/src/services/api.js` |
