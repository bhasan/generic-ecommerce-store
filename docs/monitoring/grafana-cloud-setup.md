# Grafana Cloud Setup Guide

## 1. Create a free account

Go to [grafana.com](https://grafana.com) → **Get started for free**. Choose a stack name (e.g. `smoke-station`). The free tier includes 50 GB logs/month, 10k metric series, and 14-day retention — more than enough for a single app.

## 2. Get Loki connection details

1. In Grafana Cloud, click your username (top-left) → **My Account**
2. Under **Your Grafana Cloud Stack**, click **Details** next to **Loki**
3. Note the following — you'll need all three:
   - **URL** → `LOKI_URL` (e.g. `https://logs-prod-us-central1.grafana.net`)
   - **User** → `LOKI_USERNAME` (a numeric ID, e.g. `123456`)
   - Generate an **API token** with `logs:write` scope → `LOKI_PASSWORD`

## 3. Get Prometheus remote write details

1. Back in **My Account**, click **Details** next to **Prometheus**
2. Note:
   - **Remote Write Endpoint** → `PROMETHEUS_REMOTE_WRITE_URL`
   - **Username** → `PROMETHEUS_USERNAME`
   - Use the same API token (or generate one with `metrics:write` scope) → `PROMETHEUS_PASSWORD`

## 4. Add to `.env.prod` on the server

```bash
LOKI_URL=https://logs-prod-us-central1.grafana.net
LOKI_USERNAME=123456
LOKI_PASSWORD=glc_eyJ...

PROMETHEUS_REMOTE_WRITE_URL=https://prometheus-prod-01-us-central.grafana.net/api/prom/push
PROMETHEUS_USERNAME=789012
PROMETHEUS_PASSWORD=glc_eyJ...
```

> The `sync-env.sh` script run during deployment will scaffold these keys automatically if they are missing. Fill in the values after your first deploy.

## 5. Import pre-built dashboards

In your Grafana Cloud instance, go to **Dashboards → Import** and enter these IDs:

| Dashboard | ID | What it shows |
|-----------|----|---------------|
| Node.js Application | `11159` | Event loop lag, heap, GC, HTTP request rates |
| NGINX | `12708` | Request rates, error rates, upstream latency |
| PostgreSQL | `9628` | Connections, query duration, cache hit rate |

> After import, set the **Prometheus** data source on each dashboard and the **Loki** data source on the Node.js one for log correlation.

## 6. Set up a basic alert

Create an alert that fires when the 5xx error rate spikes:

1. In Grafana Cloud, go to **Alerting → Alert rules → New alert rule**
2. Use this PromQL query:
   ```promql
   sum(rate(http_requests_total{status_code=~"5.."}[5m])) > 0.1
   ```
3. Set evaluation: every **1m**, pending for **2m** (avoids false positives from single spikes)
4. Add a contact point (email, Slack, or webhook) under **Alerting → Contact points**

## 7. Verify logs are arriving

After deploying with the monitoring stack:

1. In Grafana Cloud, go to **Explore → Loki**
2. Run this query: `{app="smoke-station-delivery"}`
3. You should see logs from all three containers within 30 seconds of startup

## Troubleshooting

**No logs in Loki:**
- Check Promtail is running: `docker logs smoke-station-promtail`
- Verify `LOKI_URL` includes the scheme (`https://`) but no trailing slash
- Confirm the API token has `logs:write` scope

**No metrics in Prometheus:**
- Check Prometheus is running: `docker logs smoke-station-prometheus`
- Verify the backend `/metrics` endpoint responds: `docker exec smoke-station-delivery-backend-prod curl -s http://localhost:3000/metrics | head -5`
- Confirm `PROMETHEUS_REMOTE_WRITE_URL` is the full push URL (ends in `/api/prom/push`)
