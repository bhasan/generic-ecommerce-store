# Smoke Station

E-commerce platform with React frontend, Express backend, PostgreSQL database, and Nginx reverse proxy.

## Current Status

This repository is a full-stack application.

- Frontend runtime code lives in `web/`
- Backend API code lives in `backend/`
- Nginx config lives in `nginx/`
- The most up-to-date inspected inventory is in `CODEBASE_WORKING_DOCUMENT.md`

Some older markdown files and examples in the repo were written before the backend and role model evolved. When in doubt, use the route files, service files, Prisma schema, and `CODEBASE_WORKING_DOCUMENT.md` as the current source of truth.

> Production deployment: see [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)

## Prerequisites

- Node.js v20+
- Docker v28+
- npm

## Docker Compose Structure

The repo uses a layered Docker Compose setup:

- `docker-compose.yml`
  - neutral shared base
- `docker-compose.dev.yml`
  - local development override
- `docker-compose.prod.yml`
  - production override

Always combine the base file with either the dev or prod override.

## Quick Start (Docker Dev)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build db backend web-dev
```

Access the local development app at `http://localhost:5843`.

Useful dev commands:

```bash
# Start or rebuild the full local dev stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build db backend web-dev

# Rebuild only the backend dev container
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build backend

# Rebuild only the frontend dev container
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build web-dev

# Stop the local dev stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

### Docker Services

| Service | Port | Description |
| --- | --- | --- |
| Database | 15432 host / 5432 container | PostgreSQL database in the local dev override |
| Backend | 3000 | Express API server in dev override |
| Web Dev | 5843 | Vite development server |

## First Time Setup

After starting the dev containers:

### 1. Run database migrations

```bash
docker exec smoke-station-delivery-backend npm run prisma:migrate
```

### 2. Optional seed

```bash
docker exec smoke-station-delivery-backend npm run prisma:seed
```

### 3. Prisma Studio

```bash
cd backend
npm install
npm run prisma:studio
```

## Local Development

### Backend

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

### Frontend

```bash
cd web
npm install
npm run dev
```

The frontend proxies `/api` to the backend in local development via `vite.config.js`.

### Docker Dev Override

Use the dev override when you want Docker-based development with backend dev dependencies available inside the container, including `ts-node` for `npm run prisma:seed`.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build db backend web-dev
docker exec smoke-station-delivery-backend npm run prisma:migrate
docker exec smoke-station-delivery-backend npm run prisma:seed
```

See [LOCAL_DOCKER_DEV_WORKFLOW.md](./LOCAL_DOCKER_DEV_WORKFLOW.md) for the full local Docker workflow, rebuild commands, and fresh-reset steps.

## Production Compose Commands

Use the neutral base file plus the production override:

```bash
# Build production images
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod build

# Start production
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d

# Check production status
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod ps

# Tail production logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod logs -f
```

## Environment Variables

### Backend

Use `backend/.env.example` as the source for backend env names.

Common values include:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `PORT`
- `NODE_ENV`
- `CORS_ORIGIN`
- `REQUEST_TIMEOUT_MS`
- `MAKE_API_KEY`
- `MAKE_WEBHOOK_URL` for the existing contact email flow
- `MAKE_NOTIFICATION_WEBHOOK_URL` as the default notification webhook
- Optional notification overrides such as `MAKE_NOTIFICATION_WEBHOOK_URL_ORDERS`, `MAKE_NOTIFICATION_WEBHOOK_URL_AUTH`, `MAKE_NOTIFICATION_WEBHOOK_URL_CONTACT`, `MAKE_NOTIFICATION_WEBHOOK_URL_DRIVER`, and `MAKE_NOTIFICATION_WEBHOOK_URL_ADMIN`

Notification delivery can share the same Make scenario as the contact email flow. If notification-specific webhook vars are not set, notification delivery falls back to `MAKE_WEBHOOK_URL`. Branch the shared Make scenario using payload fields such as `eventType`, `category`, `channelIntent`, `status`, `path`, and `requiresAttention`.

### Make Webhook Payload

Notification and email-style automation events sent to Make use one JSON payload per notification event.

```json
{
  "eventType": "ORDER_CREATED",
  "category": "ORDERS",
  "channelIntent": "ops_alert",
  "notificationId": 123,
  "occurredAt": "2026-04-02T21:30:00.000Z",
  "recipient": {
    "userId": 45
  },
  "targetRoles": ["EMPLOYEE", "MANAGEMENT", "ADMIN"],
  "actor": {
    "userId": 12,
    "username": "customer1"
  },
  "entity": {
    "type": "ORDER",
    "id": 987
  },
  "message": {
    "title": "New order submitted",
    "body": "Order #987 is waiting for review."
  },
  "status": "PENDING",
  "path": "/orders?status=PENDING",
  "requiresAttention": true,
  "metadata": {
    "orderId": 987,
    "path": "/orders?status=PENDING",
    "label": "Review order"
  }
}
```

Payload fields:

- `eventType`: event name such as `ORDER_CREATED`, `ORDER_STATUS_UPDATED`, `REGISTRATION_SUBMITTED`, or `CONTACT_REPLY_SENT`
- `category`: high-level domain such as `ORDERS`, `AUTH`, `CONTACT`, `DRIVER`, or `ADMIN`
- `channelIntent`: Make routing hint such as `ops_alert`, `email`, or `in_app_sync`
- `notificationId`: internal notification row id
- `occurredAt`: ISO timestamp
- `recipient.userId`: target user id
- `targetRoles`: role audience for role-targeted notifications when present
- `actor`: user who triggered the event when known
- `entity`: source record reference such as order, user, or contact message
- `message`: sanitized title/body for display or automation
- `status`: status value when relevant, mainly for order notifications
- `path`: frontend route to open when the notification is clicked
- `requiresAttention`: urgent flag used for Make branching and staff alert UX
- `metadata`: additional safe routing/display fields

Privacy note:

- Keep payloads sanitized. Do not add addresses, phone numbers, payment handles, rejection notes, or raw contact/support message bodies to this webhook contract.

### Frontend

Optional frontend overrides can go in `web/.env`:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_API_TIMEOUT_MS=15000
VITE_API_RETRY_MAX=2
VITE_API_RETRY_BASE_DELAY_MS=300
```

## Tests

Workspace-level test commands:

```bash
npm test
npm run test:backend
npm run test:web
npm run test:hardening
```

Package-level commands:

```bash
npm --prefix backend test
npm --prefix backend run build
npm --prefix web test
npm --prefix web run build
```

## Documentation Maintenance

Canonical project documentation lives in:

- `README.md`
- `AGENTS.md`
- `docs/PROJECT_DESIGN.md`
- `docs/DESIGN_DOCUMENTATION_INSTRUCTIONS.md`
- `docs/DOCUMENTATION_AUDIT.md`

When Mermaid diagrams in `docs/PROJECT_DESIGN.md` change, re-render the SVG assets:

```bash
npm run docs:render-mermaid
```

On Windows PowerShell, use the `.cmd` shim if script execution policy blocks `npm.ps1`:

```powershell
npm.cmd run docs:render-mermaid
```

### Testing Conventions

- Backend tests live under `backend/src/**/*.test.ts`.
- Frontend tests live under `web/src/**/*.test.{js,jsx}`.
- Keep fixtures aligned with current runtime truth:
  - authentication flows use `username`
  - authorization uses role arrays where available
  - request/error assertions preserve `requestId` when the app surfaces it
- Prefer shared test helpers and fixtures over per-file ad hoc mocks.
- Add short comments only when they explain business intent or a compatibility rule.
- If application behavior changes, update the nearest relevant tests in the same branch.

## Notification Release QA

Run this checklist before treating the notification feature as release-ready.

### Customer

- Place an order and confirm staff receives a new-order notification.
- Move the order through `APPROVED`, `READY_FOR_DELIVERY`, `OUT_FOR_DELIVERY`, and `DELIVERED` and confirm customer inbox updates appear with the expected route targets.
- Mark notifications read and confirm the bell count decreases.
- Confirm no browser sound plays for customer notifications.
- Submit a support message, then send a reply from staff and confirm the customer sees the `Support replied` notification linking to `/help`.
- Verify notification rows do not expose address, phone number, payment handles, rejection notes, or raw support-message bodies.

### Employee

- Confirm a new order creates an urgent notification with unread badge, red-dot treatment, and a one-time sound alert.
- Open the notification and confirm it routes to `/orders?status=PENDING`.
- Confirm unchanged polling does not replay the same sound.

### Management/Admin

- Confirm `REGISTRATION_SUBMITTED` creates an urgent notification that links to `/dashboard?section=pending-registrations`.
- Confirm `CONTACT_MESSAGE_RECEIVED` creates an urgent notification that links to `/dashboard?section=messages`.
- Confirm `READY_FOR_DELIVERY` appears as an operational notification and links to `/delivery-dashboard`.
- Confirm delivered-order visibility appears for management/admin without requiring Make delivery to succeed.

### Delivery Driver

- Confirm `READY_FOR_DELIVERY` and `OUT_FOR_DELIVERY` notifications appear in-app with `/delivery-dashboard` as the click target.
- Confirm `READY_FOR_DELIVERY` plays the one-time staff alert sound and `OUT_FOR_DELIVERY` does not.

### Make And Delivery Status

- Confirm important events reach the shared Make endpoint with routing fields such as `eventType`, `category`, `channelIntent`, `status`, `path`, and `requiresAttention`.
- Confirm webhook failures do not block the business action and that failed deliveries are logged with failed delivery status.

## Migration Validation

Use the current Prisma commands from `backend/package.json`:

```bash
npm --prefix backend run prisma:migrate
```

For production containers, `backend/package.json` runs `npx prisma migrate deploy && node dist/index.js` through `npm run start:prod`.

> Needs verification: migration status should be checked in the target deployment or CI environment before release.

## Troubleshooting

### Backend will not start

- Check PostgreSQL is running
- Verify `DATABASE_URL`
- Run `npm run prisma:generate`

### Frontend cannot reach backend

- Ensure backend is running on port 3000
- Check Vite proxy configuration
- Verify backend CORS settings

### Docker issues

- Ensure Docker is running
- Check ports 80 and 5432 are available
- Use `docker compose down -v` only if you intend to reset volumes

## Failure Modes and Recovery

### Database unavailable

- Symptom: `/api/health` reports degraded
- Action: verify PostgreSQL health and `DATABASE_URL`

### API timeouts

- Symptom: clients see timeout errors
- Action: inspect backend logs and `REQUEST_TIMEOUT_MS`

### Frontend network errors

- Symptom: repeated retries or backend unavailable notices
- Action: verify API availability and `VITE_API_BASE_URL`

### Post-deploy instability

- Symptom: spike in 4xx/5xx after deploy
- Action: compare recent migrations, config, and backend logs

## Related Docs

- [docs/DOCUMENTATION_AUDIT.md](./docs/DOCUMENTATION_AUDIT.md)
- [docs/PROJECT_DESIGN.md](./docs/PROJECT_DESIGN.md)
- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)
- [OPERATIONS_PIPELINE.md](./OPERATIONS_PIPELINE.md)
- [MONITORING.md](./MONITORING.md)
