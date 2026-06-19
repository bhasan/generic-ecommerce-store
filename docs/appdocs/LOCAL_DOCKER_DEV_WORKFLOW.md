# Local Docker Dev Workflow

This document is for local development only. It is not a production deployment guide.

## Purpose

Use this workflow when you want to run the app locally with Docker, hot-reload the frontend/backend, and keep full dev tooling available inside the containers.

## Files Used

- Root `.env`
  - Used by `docker compose` variable substitution for DB credentials and shared local settings.
- `backend/.env`
  - Used by the backend container for runtime app configuration.
- `docker-compose.yml`
  - Neutral shared base.
- `docker-compose.dev.yml`
  - Dev-only override that enables:
    - backend dev container with dev dependencies
    - `npm run prisma:seed`
    - `web-dev` Vite server on port `5843`

## Required Local Env Values

### Root `.env`

Typical keys:

```env
DB_USER=backend_user
DB_PASSWORD=change-me
DB_NAME=smoke-station-delivery-db
JWT_SECRET=replace-with-local-secret
```

### `backend/.env`

Typical keys:

```env
DATABASE_URL=postgresql://backend_user:change-me@db:5432/smoke-station-delivery-db
JWT_SECRET=replace-with-local-secret
JWT_EXPIRES_IN=24h
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5843
REQUEST_TIMEOUT_MS=10000
MAKE_WEBHOOK_URL=
MAKE_API_KEY=
```

Notes:
- Notification delivery falls back to `MAKE_WEBHOOK_URL` if notification-specific webhook env vars are not set.
- Keep secrets only in local env files. Do not create tracked env snapshots.

## First-Time Local Docker Boot

From the repo root:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build db backend web-dev
```

Then apply schema and seed:

```powershell
docker exec smoke-station-delivery-backend npm run prisma:migrate
docker exec smoke-station-delivery-backend npm run prisma:seed
```

Open:

- Vite dev frontend: `http://localhost:5843`
- Backend API: `http://localhost:3000`

## Rebuild Commands

Rebuild backend only:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build backend
```

Rebuild frontend dev only:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build web-dev
```

Rebuild full dev stack:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build db backend web-dev
```

## Fresh Reset

Warning: this deletes local Postgres data.

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build db backend web-dev
docker exec smoke-station-delivery-backend npm run prisma:migrate
docker exec smoke-station-delivery-backend npm run prisma:seed
```

## Why The Dev Override Exists

The dev override keeps production-oriented Docker behavior separate from local development:

- backend uses `backend/Dockerfile.dev`
- backend has dev dependencies available inside the container
- `ts-node` exists for `npm run prisma:seed`
- frontend runs Vite directly in `web-dev`
- `VITE_DEV_PROXY_TARGET=http://backend:3000` lets browser requests hit `/api` through Vite while the backend stays on the Docker network

## Production Boundary

These dev-only files are not part of production deployment logic:

- `docker-compose.dev.yml`
- `backend/Dockerfile.dev`
- this document

Production deployment should continue to use:

- `docker-compose.prod.yml`
- `backend/Dockerfile`
- `nginx/Dockerfile`
- `PRODUCTION_DEPLOYMENT.md`

## Good Hygiene

- Do not create `.env1`, `backend/.env1`, or similar snapshots.
- Keep local-only secrets in ignored env files.
- If you add new dev-only Docker changes, prefer the dev override instead of changing production compose/build files.
