# Smoke Station Codebase Working Document

## Scope

This document is based on direct inspection of the repository contents on 2026-04-01.

Observed top-level entries:

- `.cursor/`
- `.git/`
- `.github/`
- `backend/`
- `cloudflare-ddns/`
- `nginx/`
- `web/`
- `.env.example`
- `.gitignore`
- `DEVOPS_PIPELINE.md`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `MONITORING.md`
- `package.json`
- `PRODUCTION_DEPLOYMENT.md`
- `production_deployment_summary.md`
- `README.md`

Observed automated test files:

- Backend Vitest suites under `backend/src`
- Frontend Vitest suites under `web/src`
- Root workspace test runner in `package.json`

## Runtime Shape

The repository contains:

- a React frontend in [`/D:/projects/smoke-station-delivery/smoke-station-delivery/web`](D:\projects\smoke-station-delivery\smoke-station-delivery\web)
- an Express and TypeScript backend in [`/D:/projects/smoke-station-delivery/smoke-station-delivery/backend`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend)
- Nginx reverse-proxy and static hosting config in [`/D:/projects/smoke-station-delivery/smoke-station-delivery/nginx`](D:\projects\smoke-station-delivery\smoke-station-delivery\nginx)
- Docker Compose files at the repo root

Development compose file:

- `db`: `postgres:16-alpine`, exposed on `5432`
- `backend`: built from `backend/`, exposed on `3000`, `NODE_ENV=development`
- `web`: built from `nginx/Dockerfile`, exposed on `80`

Production compose file:

- `db`: `postgres:16-alpine` with healthcheck
- `backend`: built from `backend/Dockerfile`, `NODE_ENV=production`
- `web`: built from `nginx/Dockerfile`, can expose `80` and `443`
- `cloudflare-ddns`: `timothyjmiller/cloudflare-ddns:latest`

## Current Hardening State

The repo now has:

- workspace test scripts in [`/D:/projects/smoke-station-delivery/smoke-station-delivery/package.json`](D:\projects\smoke-station-delivery\smoke-station-delivery\package.json)
- backend Vitest config in [`/D:/projects/smoke-station-delivery/smoke-station-delivery/backend/vitest.config.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\vitest.config.ts)
- frontend Vitest config in [`/D:/projects\smoke-station-delivery\smoke-station-delivery\web\vitest.config.js`](D:\projects\smoke-station-delivery\smoke-station-delivery\web\vitest.config.js)
- backend request IDs and structured logging via [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\middleware\logger.middleware.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\middleware\logger.middleware.ts) and [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\utils\logger.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\utils\logger.ts)
- additive auth, validation, audit, and notification diagnostics across backend middleware, controllers, and services
- frontend API error preservation and dev-only request traces in [`/D:/projects\smoke-station-delivery\smoke-station-delivery\web\src\services\api.js`](D:\projects\smoke-station-delivery\smoke-station-delivery\web\src\services\api.js)
- frontend role-helper cleanup in protected-route and product review surfaces

## Recent Merge Guardrails

The following merge-sensitive behaviors were rechecked and should be preserved in future branches:

- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\web\src\context\AppContext.jsx`](D:\projects\smoke-station-delivery\smoke-station-delivery\web\src\context\AppContext.jsx) must continue exposing `featuredProductIds` and `promotions`.
  - [`/D:/projects\smoke-station-delivery\smoke-station-delivery\web\src\features\landing\LandingPage.jsx`](D:\projects\smoke-station-delivery\smoke-station-delivery\web\src\features\landing\LandingPage.jsx) reads both arrays directly and can throw if they become `undefined`.
  - Current safe default is empty arrays, with hydration from `/api/config` when available.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\index.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\index.ts) must keep mounting `/api/landing-page-settings`.
  - The dashboard management UI still calls this endpoint for featured products and promotions.
  - If it is dropped again, management load/save flows fall back to 404s.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\web\src\features\cart\CheckoutPage.jsx`](D:\projects\smoke-station-delivery\smoke-station-delivery\web\src\features\cart\CheckoutPage.jsx) must preserve the disabled-delivery reason path.
  - When `deliveryDisabled` is true, the UI should show `deliveryDisabledMessage` instead of minimum-order text.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\web\src\features\products\ManageProductsPanel.jsx`](D:\projects\smoke-station-delivery\smoke-station-delivery\web\src\features\products\ManageProductsPanel.jsx) must keep omitting `image` from product create/update payloads when there is no gallery image URL.
  - Backend product validation treats `image` as optional-but-string, so `image: null` breaks `POST /api/products` with a 400 validation error.
  - Current safe contract is:
    - `thumbnail` may be `null`
    - `images` may be `[]`
    - `image` should only be sent when `images[0]` is a real string URL
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\web\src\context\AppContext.jsx`](D:\projects\smoke-station-delivery\smoke-station-delivery\web\src\context\AppContext.jsx) now intentionally persists the cart in `localStorage['cartData']`.
  - Refreshing the browser should no longer empty the cart for guests or authenticated users.
  - The persisted cart should still clear on successful checkout, explicit logout, forced unauthorized logout, and order-success cleanup.
- Product media upload behavior should stay aligned between frontend and backend.
  - Frontend management flows now intentionally reject unsupported media types before upload instead of allowing broad `image/*`.
  - Current allowed types are `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `video/mp4`, and `video/webm`.
  - Do not reintroduce silent acceptance of unsupported formats such as `HEIC/HEIF` unless real conversion support is added.
- Product image save logic should keep using one canonical normalized gallery list on save.
  - [`/D:/projects\smoke-station-delivery\smoke-station-delivery\web\src\features\products\ManageProductsPanel.jsx`](D:\projects\smoke-station-delivery\smoke-station-delivery\web\src\features\products\ManageProductsPanel.jsx) now derives both `images` and primary `image` from the same normalized array.
  - Placeholder empty rows are useful in form state, but they must not leak into saved product payloads.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\order.service.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\order.service.ts) should not expose `user.cashapp` in order payloads unless there is a clearly approved operational requirement.
  - Order detail and workflow screens should use generic external-payment labels by default.
  - Re-adding payment handles to order payloads should be treated as a privacy decision, not a convenience refactor.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\thermalPrinter.service.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\thermalPrinter.service.ts) should also avoid carrying payment handles in webhook payloads unless the receipt format actually requires them.
  - The current 80mm staff ticket does not print the Cash App handle.
  - Keep printer payloads limited to the fields the local print agent and receipt template truly need.
- Checkout and payment merges must preserve all three active paths together:
  - delivery eligibility and address snapshot behavior
  - printer/manual receipt flows
  - `IN_STORE` payment support from `develop`
- Prisma schema changes must ship with committed SQL migrations.
  - A production failure was traced to code using `products.vipOnly` and pickup statuses before migration history covered them.
  - Current repair migration is [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\prisma\migrations\20260411170935_add_vip_only_and_pickup_statuses\migration.sql`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\prisma\migrations\20260411170935_add_vip_only_and_pickup_statuses\migration.sql).
  - Future Prisma field or enum additions should not be considered complete until the migration file is committed, the Prisma client is regenerated, and the backend image/runtime is rebuilt.
- Root [`.gitignore`](D:\projects\smoke-station-delivery\smoke-station-delivery\.gitignore) must keep allowing Prisma migration SQL files to be tracked.
  - The repo still ignores generic `*.sql`, so the explicit exception for `backend/prisma/migrations/**/*.sql` is required.
  - If that exception is removed, new migrations can be created locally and silently fail to enter version control.
- Delivery verification fallback defaults were intentionally softened for production resilience.
  - [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\orderingConstraints.service.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\orderingConstraints.service.ts) now defaults `offlineZipFallbackEnabled` to `true`.
  - The default offline ZIP allowlist now starts with the store ZIP `77083` so delivery checks have a safe fallback when live geocoding is unavailable.
- Customer-facing delivery verification copy was simplified on purpose.
  - [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\deliveryEligibility.service.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\deliveryEligibility.service.ts) should keep human-readable messages rather than internal/provider-style error wording.
- Full verification that last passed on this merged branch:
  - backend tests: `139/139`
  - web tests: `264/264`
  - backend build: passed
  - web build: passed

## Key Backend Files

- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\index.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\index.ts)
  Express entrypoint with middleware, routes, health check, and global error handling.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\middleware\auth.middleware.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\middleware\auth.middleware.ts)
  Bearer auth plus additive success and failure logs.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\middleware\role.middleware.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\middleware\role.middleware.ts)
  Role authorization plus denial logs.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\auth.service.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\auth.service.ts)
  Registration, login, and profile resolution with structured auth logs.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\user.service.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\user.service.ts)
  User CRUD, approvals, rejections, pending/rejected lists, and audit logs.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\product.service.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\product.service.ts)
  Product CRUD, quantity normalization, and mutation logs.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\category.service.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\category.service.ts)
  Category hierarchy and quantity-rule management with mutation logs.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\announcement.service.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\announcement.service.ts)
  Announcement CRUD with count and mutation logs.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\controllers\contact.controller.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\controllers\contact.controller.ts)
  Contact submission, message management, and reply workflow with validation and correlation logs.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\email.service.ts`](D:\projects\smoke-station-delivery\smoke-station-delivery\backend\src\services\email.service.ts)
  Make.com webhook wrapper with optional request correlation context in logs.

## Key Frontend Files

- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\web\src\App.jsx`](D:\projects\smoke-station-delivery\smoke-station-delivery\web\src\App.jsx)
  Application shell, error boundary, navbar, routes, and app provider.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\web\src\context\AppContext.jsx`](D:\projects\smoke-station-delivery\smoke-station-delivery\web\src\context\AppContext.jsx)
  Main client state container for auth, products, orders, cart, categories, notifications, and staff badge counts.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\web\src\services\api.js`](D:\projects\smoke-station-delivery\smoke-station-delivery\web\src\services\api.js)
  Shared fetch wrapper with timeout, retry, normalized errors, requestId preservation, and dev-only request tracing.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\web\src\components\layout\ProtectedRoute.jsx`](D:\projects\smoke-station-delivery\smoke-station-delivery\web\src\components\layout\ProtectedRoute.jsx)
  Route guard using guest sentinel and shared role helpers.
- [`/D:/projects\smoke-station-delivery\smoke-station-delivery\web\src\components\common\ErrorBoundary.jsx`](D:\projects\smoke-station-delivery\smoke-station-delivery\web\src\components\common\ErrorBoundary.jsx)
  Fallback UI with route-aware crash diagnostics.

## Known Non-Functional Gaps

These remain intentionally unchanged in this hardening pass:

1. `OrderService.createOrder` is still non-transactional.
2. `OrderService.addItemToOrder` still does not adjust stock for added items.
3. `ContactController.submitContactForm` still stores messages without sending outbound contact email.
4. Pending-registration count semantics in `NotificationService` and `UserService` can still drift.
5. Guest routing still depends on the `guest@smokestation.com` sentinel.
6. [`/D:/projects\smoke-station-delivery\smoke-station-delivery\web\src\features\users\UsersPage.jsx`](D:\projects\smoke-station-delivery\smoke-station-delivery\web\src\features\users\UsersPage.jsx) still appears stale and references `AdminLayout` without importing it.
7. [`/D:/projects\smoke-station-delivery\smoke-station-delivery\web\src\context\AppContext.jsx`](D:\projects\smoke-station-delivery\smoke-station-delivery\web\src\context\AppContext.jsx) still needs broader direct test coverage if we continue the debugging-hardening track.

## Verification

Current workspace test commands:

- `npm test`
- `npm run test:backend`
- `npm run test:web`
- `npm run test:hardening`

Build and lint verification were not rerun in this pass.
