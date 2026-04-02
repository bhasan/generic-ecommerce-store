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
