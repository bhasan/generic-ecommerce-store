# Copilot Instructions for smoke-station-delivery

Use this repository as a full-stack application, not a frontend-only mock app.

## Current Architecture

- Frontend: React + Vite in `web/`
- Backend: Express + TypeScript + Prisma in `backend/`
- Database: PostgreSQL via Prisma schema in `backend/prisma/schema.prisma`
- Reverse proxy / static hosting: Nginx in `nginx/`

## Current Truth Sources

- API routes: `backend/src/routes/*.ts`
- Service behavior: `backend/src/services/*.ts`
- Runtime app shell and routes: `web/src/App.jsx`
- Shared frontend state: `web/src/context/AppContext.jsx`
- Role helpers: `web/src/utils/roles.js` and `backend/src/constants/roles.ts`
- Current codebase inventory: `CODEBASE_WORKING_DOCUMENT.md`

## Important Notes for Future Edits

- Do not assume mock data drives the live app. `web/src/data/mockData.js` is legacy/reference material, not the active runtime source of truth.
- Backend request IDs are generated in `backend/src/middleware/logger.middleware.ts` and returned to clients as `x-request-id`.
- Frontend API errors preserve backend `requestId` in `web/src/services/api.js`.
- Authentication uses JWTs with multi-role arrays, although some legacy compatibility code still exists around single-role shapes.

## Safe Change Guidance

- Prefer additive logging, debugging aids, tests, and docs cleanup over behavioral changes.
- Preserve current response shapes, redirects, auth rules, and retry behavior unless the task explicitly authorizes functional change.
- When debugging, verify behavior from route files and service files before relying on older markdown docs.

## Testing Maintenance Rules

- Treat tests as part of the feature surface. If a behavior changes, update or add tests in the same branch.
- Use the current merged runtime shape in fixtures and assertions:
  - authentication is `username`-based
  - users may expose multi-role arrays in `roles`
  - backend/frontend request correlation may include `requestId`
- Reuse shared test helpers and canonical fixtures before creating one-off mocks.
- Prefer behavior-focused assertions over implementation-detail assertions.
- Add short comments only when they explain a business rule, compatibility shim, or why a non-obvious test setup exists.
- When fixing a bug or regression, add a test named after the business scenario it protects.
- Do not reintroduce older email-based auth assumptions into tests except when explicitly covering a backward-compatibility path.
