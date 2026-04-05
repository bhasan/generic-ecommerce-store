# Production Deployment Guide

This guide covers deploying the Smoke Station application to a production server using the layered Docker Compose setup.

## Compose Architecture

Production should use:

- `docker-compose.yml`
  - neutral shared base
- `docker-compose.prod.yml`
  - production override
- root `.env.prod`
  - Docker Compose variable source
- `backend/.env`
  - backend runtime env file loaded inside the container

Do not use `docker-compose.dev.yml` in production.

## Summary

| Step | Action |
|------|--------|
| 1. Server setup | Install Docker and clone the repo |
| 2. Environment | Create `.env.prod` and `backend/.env` |
| 3. Build images | `docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod build` |
| 4. Start stack | `docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d` |
| 5. Migrate DB | `docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy` |
| 6. Verify | Check compose status, logs, and `/api/health` |

## Prerequisites

- Linux server with Docker and Docker Compose v2
- Domain and SSL certificate if serving over HTTPS
- Firewall allowing ports `80` and `443`

## Step 1: Clone The Repo

```bash
git clone <your-repo-url> smoke-station-delivery
cd smoke-station-delivery
git checkout <deployment-branch>
```

## Step 2: Environment Configuration

Production env is split across two files.

### Root `.env.prod`

Used by Docker Compose for service configuration and variable substitution.

Example:

```env
DB_USER=smoke_station_user
DB_PASSWORD=CHANGE_ME_STRONG_PASSWORD
DB_NAME=smoke_station_prod

JWT_SECRET=CHANGE_ME_STRONG_JWT_SECRET
JWT_EXPIRES_IN=24h

CORS_ORIGIN=https://your-domain.com

HTTP_PORT=80
HTTPS_PORT=443
AUTH_RATE_LIMIT_MAX=20

# Optional
CF_DDNS_API_TOKEN=
CF_DDNS_ZONE_ID=
```

### `backend/.env`

Used by the backend container at runtime. Keep DB credentials and secrets aligned with `.env.prod`.

Example:

```env
DATABASE_URL=postgresql://smoke_station_user:CHANGE_ME_STRONG_PASSWORD@db:5432/smoke_station_prod
JWT_SECRET=CHANGE_ME_STRONG_JWT_SECRET
JWT_EXPIRES_IN=24h
CORS_ORIGIN=https://your-domain.com
AUTH_RATE_LIMIT_MAX=20

PORT=3000
NODE_ENV=production
REQUEST_TIMEOUT_MS=30000

# Optional integrations
# MAKE_WEBHOOK_URL=https://hook.us2.make.com/...
# MAKE_API_KEY=...
# MAKE_NOTIFICATION_WEBHOOK_URL=https://hook.us2.make.com/...
```

## Step 3: Build And Start The Stack

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d
```

## Step 4: Run Migrations

```bash
docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy
docker exec smoke-station-delivery-backend-prod npx prisma migrate status
```

Optional first-time seed:

```bash
docker exec smoke-station-delivery-backend-prod npm run prisma:seed:prod
```

## Step 5: Verify Deployment

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod logs -f
curl -s http://localhost/api/health
```

Expected health response:

```json
{"status":"ok","checks":{"database":"ok"}}
```

## Production Notes

- Production uses `backend/Dockerfile` and `nginx/Dockerfile`.
- Production should not rely on bind mounts or Vite.
- `docker-compose.dev.yml` and `backend/Dockerfile.dev` are local development only.
- Notification delivery can reuse the shared Make scenario via payload routing fields such as `eventType`, `category`, and `channelIntent`.

## Related Docs

- [README.md](./README.md)
- [LOCAL_DOCKER_DEV_WORKFLOW.md](./LOCAL_DOCKER_DEV_WORKFLOW.md)
- [OPERATIONS_PIPELINE.md](./OPERATIONS_PIPELINE.md)
