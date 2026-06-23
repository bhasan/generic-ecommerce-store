# Smoke Station Testing And Live Verification

## Purpose

This is the PHYSALIA-style validation workflow for Smoke Station Delivery. It separates local/preproduction verification from deployed/live verification and records evidence instead of relying on assumptions.

PASS must only be used when a check actually ran and produced evidence. Missing credentials, optional providers, AI gates, safe writes, and destructive checks are SKIP until explicitly configured.

## Status Meanings

| Status | Meaning |
| --- | --- |
| PASS | The command or check ran successfully and produced evidence. |
| SKIP | The check was intentionally not run because credentials, flags, tooling, or applicability are missing. SKIP is not production approval. |
| FAIL | The command or check ran and failed, or a required precondition was missing. Root cause must be investigated before rerun. |

## Runtime And Environment Preflight

Run:

```powershell
npm.cmd run preflight
```

The preflight runner checks:

- Node.js >= 20 and npm availability. On this Windows host, use `npm.cmd` because `npm.ps1` can be blocked by PowerShell execution policy.
- Docker and Docker Compose availability.
- Docker dev services from `docker-compose.yml` plus `docker-compose.dev.yml`.
- Backend health at `SMOKE_STATION_API_BASE_URL` or `http://localhost:3000/api`.
- Frontend entrypoint at `SMOKE_STATION_WEB_BASE_URL` or `http://localhost:5843`.
- Required local env keys by name only. Values are never printed.
- Optional provider/live/print-agent env keys as SKIP when absent.

Artifacts:

- `build/preflight-report/summary.json`
- `build/preflight-report/summary.md`

## Command Matrix

| Layer | Command | Evidence |
| --- | --- | --- |
| Preflight | `npm.cmd run preflight` | `build/preflight-report/` |
| Backend tests | `npm.cmd run test:backend` | terminal output / CI artifact |
| Prisma client | `npm.cmd --prefix backend run prisma:generate` | command exit status |
| Migration status | `docker exec smoke-station-delivery-backend npx prisma migrate status` | command exit status |
| Backend build | `npm.cmd --prefix backend run build` | command exit status |
| Frontend tests | `npm.cmd run test:web` | terminal output / CI artifact |
| Frontend build | `npm.cmd --prefix web run build` | `web/dist/` plus command exit status |
| Local smoke | `npm.cmd run smoke:local` | `build/smoke-report/` |
| Local E2E chain | `npm.cmd run verify:local` | `build/e2e-report/` |
| Browser local desktop | `npm.cmd run test:live:local` | `tests/live/reports/`, `tests/live/playwright-report/` |
| Browser local mobile | `npm.cmd run test:live:local-mobile` | screenshots/report artifacts |
| Deployed smoke | `npm.cmd run test:live:smoke` | live Playwright reports |
| Deployed full | `npm.cmd run test:live:full` | live Playwright reports |
| Deployed security | `npm.cmd run test:live:security` | live Playwright reports |
| Safe writes | `SMOKE_STATION_ALLOW_SAFE_WRITES=true npm.cmd run test:live:safe-writes` | disposable write evidence |
| Provider live | `SMOKE_STATION_ALLOW_PROVIDER_TESTS=true npm.cmd run test:provider:live` | provider shape evidence |
| AI live | `SMOKE_STATION_ALLOW_AI_TESTS=true npm.cmd run test:ai:live` | SKIP until AI exists |
| Performance smoke | `npm.cmd run test:perf:smoke` | `tests/live/reports/performance-smoke.json` |
| Release gates | `npm.cmd run release:check` | `build/release-report/` |

## Local Backend Tests

Run:

```powershell
npm.cmd --prefix backend run prisma:generate
npm.cmd run test:backend
npm.cmd --prefix backend run build
docker exec smoke-station-delivery-backend npx prisma migrate status
```

Coverage target:

- Service/domain behavior.
- Route/controller validation.
- Auth middleware and role middleware.
- Order lifecycle, delivery eligibility, product/category/settings behavior.
- Integration tests under `backend/src/integration`.

Safety rules:

- Destructive database tests must refuse to run unless the database name or URL is clearly disposable, for example a name containing `test`, `e2e`, or `ci`.
- Do not run destructive tests against `smoke-station-delivery-db`, production, or any shared local/dev DB.
- Schema changes are not complete until Prisma migration SQL exists, Prisma client is regenerated, and backend build passes.

Known root-cause pattern:

- If backend build reports `Property 'ARRIVED' does not exist on type OrderStatus`, the likely cause is stale generated Prisma client output. Regenerate with `npm.cmd --prefix backend run prisma:generate`, then rerun the build. Do not weaken status tests.

## Frontend Unit And Component Tests

Run:

```powershell
npm.cmd run test:web
npm.cmd --prefix web run build
```

Coverage target:

- Core routes in `web/src/App.jsx`.
- Login/register, products, cart, checkout, orders, dashboard, delivery dashboard, help, and management surfaces.
- Role-gated UI controls through shared role helpers.
- Loading, error, empty, modal, drawer, table/list, filter, and workflow states.

Rules:

- Demo/seed data must be labeled as such in tests and docs.
- UI numbers must match API/source calculations within documented rounding rules.
- Role-gated controls must follow real permissions, not mocked assumptions.

## Local Smoke Tests

Run:

```powershell
npm.cmd run smoke:local
```

Default read-only checks:

- `GET /api/health`
- `GET /api/config`
- `GET /api/products`
- `GET /api/categories`
- unauthenticated protected endpoint probes such as `/api/users` and `/api/orders/delivery-eligibility`

Optional auth checks:

- Set `SMOKE_STATION_SMOKE_USERNAME` and `SMOKE_STATION_SMOKE_PASSWORD`.
- The script logs in through `/api/auth/login`, stores the token only in memory, and never writes token/auth response values to artifacts.
- It then checks `/api/auth/profile` and `/api/orders`.

Artifacts:

- `build/smoke-report/summary.json`
- `build/smoke-report/summary.md`

## Local E2E Verification

Run:

```powershell
npm.cmd run verify:local
```

The chain runs:

1. preflight
2. Prisma generate
3. migration status
4. backend tests
5. backend build
6. frontend tests
7. frontend build
8. local smoke

PASS means controlled local/preproduction verification passed. It does not mean production readiness, security signoff, provider reconciliation, backup/restore acceptance, or manual release approval.

Artifacts:

- `build/e2e-report/summary.json`
- `build/e2e-report/summary.md`

## Visual And Mobile QA

Run:

```powershell
npm.cmd run test:live:local
npm.cmd run test:live:local-mobile
```

Required viewports:

- Desktop: `1366x900`
- Mobile: `390x844`

Checks:

- Route-specific page content loads, not only the shared shell.
- Console errors fail the route check.
- Horizontal overflow fails the mobile check.
- Screenshots are saved under `tests/live/reports/screenshots/`.

## API Contract And Route Matrix

The Playwright API matrix checks:

- public endpoints return controlled JSON and no accidental 500s.
- protected endpoints reject anonymous access with 401/403 instead of leaking data.
- authenticated customer profile/order reads run only when credentials are configured.
- route render checks wait for route-specific page content.

Optional features must SKIP clearly when credentials or flags are absent.

## Security, Auth, Role, And Account Boundaries

Roles currently used by Smoke Station include customer, employee, management, admin, delivery driver, VIP, and guest-style compatibility behavior.

Required checks:

- Login/logout behavior.
- Anonymous access to management/admin routes.
- Customer denial from `/api/users`.
- Delivery-driver limitation to delivery-status behavior.
- Admin-only order-history and delete surfaces.
- Own-profile and own-order scoping.

Unauthorized responses must be controlled 401/403/404 responses. Sensitive fields such as payment handles, addresses, phone numbers, passwords, tokens, and webhook URLs must not be exposed in diagnostics, logs, exports, or test artifacts.

## Data Accuracy And Reconciliation

Required checks:

- Cart totals match order payload calculations.
- UI order status counts match `/api/orders` results for the authenticated role.
- Product price/quantity displays match API values.
- Filters, sorting, pagination, empty states, and cross-page order visibility are verified when implemented.

Evidence artifacts should record expected vs actual values on mismatch, not transform aggregate or demo data into false source-confirmed truth.

## Provider And External API Live Checks

Live provider tests are opt-in:

```powershell
$env:SMOKE_STATION_ALLOW_PROVIDER_TESTS="true"
npm.cmd run test:provider:live
```

Current provider/integration boundaries:

- Google Geocoding may affect delivery eligibility when configured.
- Make.com webhooks handle contact and notification delivery when configured.
- Print agent checks require `PRINT_AGENT_SHARED_KEY`.

Rules:

- Missing provider credentials produce SKIP.
- Raw credentials, webhook URLs, auth responses, and tokens are never written to reports.
- Provider evidence records response shape, status, safe mode/source fields, and mismatches.
- Provider-specific logic remains isolated from canonical app truth.

## AI / LLM Live Checks

No AI/LLM integration is currently implemented in Smoke Station.

Normal tests must never call live AI providers. The AI live gate is SKIP / not applicable until a real integration exists. If AI is later added:

- live AI tests must be opt-in with `SMOKE_STATION_ALLOW_AI_TESTS=true`.
- fallback/deterministic mode cannot satisfy live AI evidence.
- AI must not approve irreversible actions, hide uncertainty, or invent unsupported facts.

## Deployed / Production Live Verification

Configure:

```text
SMOKE_STATION_LIVE_BASE_URL=https://your-domain.example
SMOKE_STATION_LIVE_API_BASE_URL=https://your-domain.example/api
SMOKE_STATION_LIVE_CUSTOMER_USERNAME=
SMOKE_STATION_LIVE_CUSTOMER_PASSWORD=
SMOKE_STATION_LIVE_MANAGER_USERNAME=
SMOKE_STATION_LIVE_MANAGER_PASSWORD=
SMOKE_STATION_LIVE_ADMIN_USERNAME=
SMOKE_STATION_LIVE_ADMIN_PASSWORD=
SMOKE_STATION_LIVE_DRIVER_USERNAME=
SMOKE_STATION_LIVE_DRIVER_PASSWORD=
```

Run:

```powershell
npm.cmd run test:live:smoke
npm.cmd run test:live:full
npm.cmd run test:live:security
npm.cmd run test:live:mobile
```

Default mode is read-only. Safe writes require:

```powershell
$env:SMOKE_STATION_ALLOW_SAFE_WRITES="true"
npm.cmd run test:live:safe-writes
```

Destructive/admin tests require a separate explicit flag and disposable targets only:

```powershell
$env:SMOKE_STATION_ALLOW_DESTRUCTIVE_TESTS="true"
```

PASS means the configured deployed environment passed the runnable checks with provided credentials and flags. Skipped checks must be reviewed before claiming production readiness.

## Safe Writes, Cleanup, And Test Data Naming

Rules:

- Live and E2E writes use clear prefixes such as `LIVE_TEST`, `E2E_`, or `test-*`.
- Cleanup is dry-run/reviewed first where a cleanup script exists.
- Prefer archive/resolve/disable over hard delete.
- Preserve audit records.
- No hard delete unless explicitly safe and documented.

The current safe-write spec creates a disposable authenticated contact message and resolves it with a manager account when both personas and `SMOKE_STATION_ALLOW_SAFE_WRITES=true` are configured.

## Performance And Load Testing

Run:

```powershell
npm.cmd run test:perf:smoke
```

Current performance smoke checks public hot APIs:

- `/api/health`
- `/api/config`
- `/api/products`
- `/api/categories`

Artifacts:

- `tests/live/reports/performance-smoke.json`

Before adding caches, materialized views, or indexes, investigate:

- filters and pagination
- stable sort/limit behavior
- duplicate frontend calls
- N+1 database queries
- payload size and endpoint latency

## Release Gates

Run:

```powershell
npm.cmd run release:check
```

Required gates:

- backend tests pass
- frontend tests pass
- Prisma client generation passes
- backend build passes
- frontend build passes
- dependency audits pass at high severity
- migration status is clean
- app health and local smoke pass
- local E2E verification passes

External/review gates:

- Docker build, enabled by `SMOKE_STATION_RELEASE_DOCKER_BUILD=true`
- deployed/live verification reviewed
- security/account isolation reviewed
- backup/restore reviewed if applicable
- docs/changelog updated

Release cannot be approved unless all required checks pass or a responsible reviewer documents SKIP/not applicable with reason and evidence.

## Latest Local Evidence Captured During Setup

Evidence captured on 2026-06-06:

- Docker dev services were running: db healthy, backend healthy, web-dev up.
- `GET http://localhost:3000/api/health` returned 200 with database `ok`.
- `GET http://localhost:5843` returned 200.
- `docker exec smoke-station-delivery-backend npx prisma migrate status` reported database schema up to date with 37 migrations.
- `npm.cmd run test:backend` passed 37 files / 222 tests.
- `npm.cmd run test:web` passed 46 files / 473 tests, with existing React `act(...)` warnings and an existing jsdom AbortSignal warning in output.
- `npm.cmd --prefix web run build` passed.
- `npm.cmd --prefix backend run build` initially failed because generated Prisma client output did not include `OrderStatus.ARRIVED`; after `npm.cmd --prefix backend run prisma:generate`, backend build passed.
- `npm.cmd run test:live:full` passed against local defaults with seeded local personas supplied through process env: 33 passed, 3 skipped. The remaining skips were the explicitly disabled safe-write, provider-live, and AI-live gates.
- Authenticated local browser checks passed for customer profile/orders API access, UI login/logout, same-tab session recovery after logout and second login, authenticated protected-route rendering, product add-to-cart, cart subtotal/tax/total reconciliation, authenticated mobile product route rendering, customer denial from management user list, and delivery-driver denial for disallowed order status changes.
- Browser validation exposed and then verified a UI fix for product category navigation: desktop category navigation is now in-flow/sticky instead of a fixed mid-page overlay that could intercept visible `Add to Cart` controls. Mobile keeps the bottom floating category strip.
- `SMOKE_STATION_ALLOW_SAFE_WRITES=true npm.cmd run test:live:safe-writes` passed against the local dev environment with seeded local customer and manager personas. It created a disposable `LIVE_TEST` contact message and resolved it through the manager cleanup path.
- Dependency audit blockers were remediated by upgrading backend `bcrypt` to remove the vulnerable `@mapbox/node-pre-gyp`/`tar` chain and upgrading backend/web `vitest` to a non-vulnerable v4 release. Backend tests were updated to use constructible function mocks required by Vitest v4.
- `npm.cmd run verify:local` passed and wrote `build/e2e-report/summary.json`.
- `SMOKE_STATION_RELEASE_DOCKER_BUILD=true npm.cmd run release:check` passed required local gates including the Docker dev build gate. External/review gates remained SKIP unless explicitly enabled or reviewed: deployed/live verification, security isolation review signoff, backup/restore review, and docs/changelog operator review.

These observations are local evidence only. They are not production readiness, provider reconciliation, security signoff, or backup/restore acceptance.
