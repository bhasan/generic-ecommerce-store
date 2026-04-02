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

- Node.js v18+
- Docker v28+
- npm or yarn

## Quick Start (Docker)

```bash
cd web
npm install
npm run build
cd ..

docker compose up --build -d
```

Access the application at `http://localhost:80`.

Command to update only the backend container:

```bash
docker compose up --build --force-recreate -d backend
```

### Docker Services

| Service | Port | Description |
| --- | --- | --- |
| Database | 5432 | PostgreSQL database |
| Backend | 3000 (internal) | Express API server |
| Web | 80 | Nginx reverse proxy + React app |

## First Time Setup

After starting the containers:

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

- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)
- [OPERATIONS_PIPELINE.md](./OPERATIONS_PIPELINE.md)
- [MONITORING.md](./MONITORING.md)
