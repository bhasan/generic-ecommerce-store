# Monitoring & Observability

## Overview

This project uses **Grafana Cloud** (free tier) for log aggregation and metrics. The stack is provider-agnostic: switching to self-hosted or another provider requires only environment variable changes — no application code changes.

## Architecture

```
Docker containers (nginx, backend, postgres)
  └─ stdout logs (structured JSON)
       └─ Promtail (reads Docker socket, adds labels)
            └─ Loki endpoint [LOKI_URL]
                  └─ Grafana dashboards + alerts

Express backend
  └─ GET /metrics  (prom-client, internal only)
       └─ Prometheus (scrapes every 15s)
            └─ Remote write [PROMETHEUS_REMOTE_WRITE_URL]
                  └─ Grafana dashboards + alerts
```

## Components

| Component | Role | Image |
|-----------|------|-------|
| **Promtail** | Ships container logs to Loki | `grafana/promtail:3.0.0` |
| **Prometheus** | Scrapes `/metrics`, remote-writes to Grafana Cloud | `prom/prometheus:v2.53.0` |
| **Grafana Cloud** | Hosted Loki + Prometheus + dashboards + alerts | SaaS (free tier) |

The `/metrics` endpoint on the backend is restricted to Docker-internal IPs (`127.x`, `172.x`, `10.x`, `192.168.x`) and is not proxied by Nginx — it is never reachable from the public internet.

## Running with monitoring

```bash
# Production
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f monitoring/docker-compose.monitoring.yml \
  --env-file .env.prod \
  up -d

# The deploy script includes monitoring by default.
# Pass --no-monitoring to skip it.
```

## Switching providers

All external endpoints live in `.env.prod`. To switch from Grafana Cloud to self-hosted:

1. Stand up local Loki and Prometheus instances
2. Update the six env vars below to point at your local endpoints
3. Remove `remote_write` from `monitoring/prometheus/prometheus.yml` (Prometheus works standalone without it)
4. Redeploy — no application code changes needed

```
LOKI_URL=http://your-loki:3100
LOKI_USERNAME=         # leave blank for unauthenticated local Loki
LOKI_PASSWORD=

PROMETHEUS_REMOTE_WRITE_URL=   # remove or leave blank
PROMETHEUS_USERNAME=
PROMETHEUS_PASSWORD=
```

## Environment variables

Add to `.env.prod` on the server:

```
LOKI_URL=
LOKI_USERNAME=
LOKI_PASSWORD=
PROMETHEUS_REMOTE_WRITE_URL=
PROMETHEUS_USERNAME=
PROMETHEUS_PASSWORD=
```

See [grafana-cloud-setup.md](./grafana-cloud-setup.md) for where to find these values.

## Memory footprint

Both monitoring services run with hard memory limits appropriate for a 2GB VPS:

| Service | Limit | Reservation |
|---------|-------|-------------|
| Promtail | 64 MB | 32 MB |
| Prometheus | 256 MB | 128 MB |

Prometheus retains 7 days of local TSDB data before remote-writing, acting as a buffer if Grafana Cloud is temporarily unavailable.
