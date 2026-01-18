# Monitoring Guide

This document outlines practical monitoring steps for the Smoke Station stack (React + Express + PostgreSQL + Nginx), from basic local checks to production-grade observability.

## 1) Basic Local Monitoring (No Setup)

### View logs
```bash
# Backend logs
docker-compose logs -f backend

# Nginx / web proxy logs
docker-compose logs -f web

# Database logs
docker-compose logs -f db
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

## 2) Uptime Monitoring (Production)

Use a managed uptime service (UptimeRobot, Better Uptime, Pingdom) to ping:

- `https://yourdomain.com/api/health`

Alert on:
- non-200 responses
- response time > N seconds

## 3) Metrics & Dashboards (Recommended)

Add metrics collection + dashboards using one of:

- Prometheus + Grafana (self-hosted)
- Datadog / New Relic / Grafana Cloud (managed)

Track at minimum:
- API latency (p50/p95/p99)
- Error rate (4xx/5xx)
- DB connection pool usage
- Backend container CPU/memory
- Nginx 4xx/5xx rate

## 4) Error Tracking (Frontend + Backend)

Use Sentry or LogRocket to capture:

- Frontend React errors and network failures
- Backend exceptions with request IDs

## 5) Alerting Rules (Minimum Set)

Recommended alerts:

- Health check down > 1 minute
- API error rate > 2% for 5 minutes
- p95 latency > 1s for 5 minutes
- DB connections > 80% max

## 6) Docker Test Flow (Local)

### Build & start
```bash
# build the frontend
cd web
npm install
npm run build
cd ..

# start all services
docker-compose up --build -d
```

### Check containers
```bash
docker-compose ps
docker-compose logs -f backend
```

### Health check (DB up)
```bash
curl http://localhost/api/health
```

### Health check (DB down)
```bash
docker-compose stop db
curl http://localhost/api/health
docker-compose start db
```

### Timeout behavior (optional)
Set `REQUEST_TIMEOUT_MS=1` in `backend/.env`, then restart the backend:
```bash
docker-compose restart backend
```
Hit a non-trivial endpoint; it should return a `REQUEST_TIMEOUT` error.

### Frontend retry behavior
```bash
docker-compose stop backend
# Open the app and trigger an API call to observe retry + error handling
docker-compose start backend
```
