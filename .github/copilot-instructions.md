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
