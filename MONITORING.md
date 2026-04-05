# Monitoring Guide

This document outlines practical monitoring and debugging steps for the Smoke Station stack (React + Express + PostgreSQL + Nginx), from local checks to production observability.

## 0) Current Debugging Baseline

The application currently has:

- backend request IDs generated in `backend/src/middleware/logger.middleware.ts`
- structured backend logs in `backend/src/utils/logger.ts`
- additive auth and admin audit logs in backend middleware, controllers, and services
- frontend API error objects that preserve backend `requestId`
- workspace test commands:
  - `npm test`
  - `npm run test:backend`
  - `npm run test:web`
  - `npm run test:hardening`

Use the backend `requestId` as the primary correlation key between UI failures and server logs.

## 1) Basic Local Monitoring

### View logs
```bash
# Backend logs
docker compose logs -f backend

# Nginx / web proxy logs
docker compose logs -f web

# Database logs
docker compose logs -f db
```

### Health check
```bash
# Through Nginx (Docker)
curl http://localhost/api/health

# Direct backend (non-Docker)
curl http://localhost:3000/api/health
```

Expected:

- `status: "ok"`
- `checks.database: "ok"`

If the DB is down:

- `status: "degraded"`
- `checks.database: "error"`

### Resource usage
```bash
docker stats
docker system df
```

## 2) Log Rotation

Docker defaults to unbounded JSON logs. Add rotation to `docker-compose.prod.yml` to prevent disk growth:

```yaml
services:
  backend:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

Repeat the same pattern for `web` and `db`.

## 3) Uptime Monitoring

Use a managed uptime service such as UptimeRobot, Better Uptime, or Pingdom to ping:

- `https://yourdomain.com/api/health`

Alert on:

- non-200 responses
- response time above your threshold

## 4) Metrics and Dashboards

Recommended minimum metrics:

- API latency at p50, p95, and p99
- error rate by endpoint
- database connection pool usage
- backend container CPU and memory
- Nginx 4xx and 5xx rate

## 5) Error Tracking

Use Sentry or LogRocket to capture:

- frontend React errors and network failures
- backend exceptions with request IDs

If you are debugging locally without a third-party tool:

- reproduce the issue in the browser
- inspect the frontend error object for `requestId`, `status`, and `code`
- search backend logs for the same `requestId`
- follow matching auth, user, product, category, announcement, contact, or notification logs

## 6) Alerting Rules

Recommended alerts:

- health check down for more than 1 minute
- API error rate above 2 percent for 5 minutes
- p95 latency above 1 second for 5 minutes
- database connections above 80 percent of max

## 7) Docker Test Flow

### Build and start
```bash
cd web
npm install
npm run build
cd ..

docker compose up --build -d
```

### Check containers
```bash
docker compose ps
docker compose logs -f backend
```

### Health checks
```bash
curl http://localhost/api/health
docker compose stop db
curl http://localhost/api/health
docker compose start db
```

### Retry behavior
```bash
docker compose stop backend
# Open the app and trigger an API call to observe retry + error handling
docker compose start backend
```

## 8) Workspace Verification Flow

Use these after logging or debugging changes:

```bash
npm test
npm --prefix backend test
npm --prefix web test
```

These are the fastest current guardrails for the hardening work. They do not replace end-to-end runtime checks, but they do verify that the logging and debugging surfaces we changed still behave as expected.
