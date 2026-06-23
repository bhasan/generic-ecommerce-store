# Application Logging

## Overview

Logs flow from three sources — Nginx, Express backend, and PostgreSQL — to stdout/stderr on each container. Promtail reads them from the Docker socket and ships them to Loki. All log querying happens in Grafana Cloud Explore.

## Log sources

### Express backend

**Logger:** `backend/src/utils/logger.ts` — a lightweight, zero-dependency custom logger that outputs single-line JSON to stdout/stderr.

**Output format (every line):**
```json
{
  "timestamp": "2026-06-22T10:34:56.789Z",
  "level": "info",
  "message": "API Request",
  ...context fields
}
```

**Levels:** `info`, `warn`, `error`, `debug`
- `debug` only emits when `NODE_ENV=development` or `LOG_LEVEL=debug`
- `warn` and `error` write to stderr; `info` and `debug` write to stdout

**Request/response logging** (`backend/src/middleware/logger.middleware.ts`):

Every inbound request gets a `requestId`, which is:
- The `X-Request-Id` value forwarded by Nginx (preferred), or a freshly generated `req_<uuid>` for requests that bypass Nginx
- Attached to `req.requestId` for use by error handlers and route code
- Returned to callers in the `x-request-id` response header
- Included in both the request log and the response log so the two can be correlated

```json
// Inbound request
{
  "timestamp": "...", "level": "info", "message": "API Request",
  "requestId": "req_abc123",
  "method": "POST", "path": "/api/orders",
  "query": {}, "userId": "user_456", "userRoles": ["customer"],
  "ip": "1.2.3.4", "userAgent": "Mozilla/5.0 ..."
}

// Response (after handler returns)
{
  "timestamp": "...", "level": "info", "message": "API Response",
  "requestId": "req_abc123",
  "method": "POST", "path": "/api/orders",
  "statusCode": 201, "duration": "45ms", "userId": "user_456"
}
```

For 4xx/5xx responses the `errorBody` field is included (first 500 chars of the response body).

**Sensitive field sanitization:** The request body is logged with these fields redacted before writing:
- `password`, `token`, `authToken`, `authorization` → `[REDACTED]`

**Error logging** (`backend/src/middleware/error.middleware.ts`):

All errors caught by the global error handler are logged at the `error` level with `requestId`, `method`, `path`, `statusCode`, `errorCode`, `userId`, `userRoles`, `errorMessage`, `errorStack`.

Operational errors (`AppError` instances) are logged as expected application behaviour. Unhandled errors are also caught and logged — they return `500 INTERNAL_ERROR` to the client.

**Process-level logging** (`backend/src/index.ts`):

Unhandled promise rejections and uncaught exceptions are caught at the process level and logged via `logger.error()` before the process exits.

**IP resolution debugging:**

The first N requests (default: 5, configurable via `REQUEST_IP_DEBUG_SAMPLE_SIZE`) log extended IP resolution details — raw socket address, `CF-Connecting-IP`, `X-Forwarded-For`, `trust proxy` setting — at `debug` level. Useful for diagnosing Cloudflare proxy IP issues.

### Nginx

**Format:** Structured JSON (`json_combined` log format). Every access log line is a JSON object:

```json
{
  "time": "2026-06-22T10:34:56+00:00",
  "method": "GET",
  "uri": "/api/orders",
  "status": 200,
  "bytes_sent": 1234,
  "request_time": 0.045,
  "upstream_response_time": "0.044",
  "remote_addr": "1.2.3.4",
  "request_id": "abc123",
  "referer": "",
  "user_agent": "Mozilla/5.0 ..."
}
```

All fields are directly queryable in Loki without regex extraction.

**Cloudflare IP restoration:** `real_ip_header CF-Connecting-IP` is set so `$remote_addr` reflects the actual client IP, not a Cloudflare edge node.

**Health check:** `/health` has `access_log off;` — health-check polls do not appear in the access log.

**Request ID forwarding:** Nginx sets `X-Request-Id: $request_id` on every upstream request. The backend middleware reads this header and uses it as its own `requestId`, so **the same ID appears in both the Nginx access log (`request_id` field) and all backend log lines**. Requests that bypass Nginx (direct dev calls, health checks) fall back to a freshly generated `req_<uuid>`.

### PostgreSQL

PostgreSQL container logs to stdout via Docker's default json-file driver. No custom log configuration is set — it uses Postgres defaults (errors and warnings only; DDL and query logging are off).

## Docker log driver

All containers use the `json-file` log driver with rotation configured:

| Option | Value |
|--------|-------|
| `max-size` | `10m` |
| `max-file` | `3` |

Maximum on-disk footprint per container is ~30 MB (3 × 10 MB files). Older files are deleted automatically.

## Loki labels

Promtail reads logs from the Docker socket and attaches these labels to every log stream before shipping to Loki:

| Label | Source | Example value |
|-------|--------|---------------|
| `app` | static | `smoke-station-delivery` |
| `container` | Docker metadata | `smoke-station-delivery-backend-prod` |
| `service` | Docker metadata | `backend` |
| `level` | JSON body (pipeline stage) | `info`, `warn`, `error` |

The `level` label is extracted from the `"level"` field in JSON log lines by Promtail's pipeline. Non-JSON lines (e.g. Nginx combined format) get no `level` label.

## Useful Loki queries

```logql
# All error logs across the app
{app="smoke-station-delivery"} | json | level = "error"

# Backend errors only
{app="smoke-station-delivery", service="backend"} | json | level = "error"

# Trace a specific request across Nginx + backend logs (same request_id)
{app="smoke-station-delivery"} |= "abc123"

# Slow responses (>1s)
{app="smoke-station-delivery", service="backend"} | json | message = "API Response"
  | duration > "1000ms"

# 5xx responses
{app="smoke-station-delivery", service="backend"} | json | message = "API Response"
  | statusCode >= 500

# Nginx 5xx (JSON fields, no regex needed)
{app="smoke-station-delivery", service="nginx"} | json | status >= 500

# Slow Nginx upstream responses (>500ms)
{app="smoke-station-delivery", service="nginx"} | json | request_time > 0.5
```

## Environment variables

| Variable | Default | Effect |
|----------|---------|--------|
| `LOG_LEVEL` | unset | Set to `debug` to enable debug logs in production |
| `NODE_ENV` | `development` | `debug` logs enabled in development; stack traces in error responses |
| `REQUEST_IP_DEBUG_SAMPLE_SIZE` | `5` | Number of requests that log detailed IP resolution info at startup |

## Business events

Key business actions emit structured event logs via `logger.logEvent()`. These have a top-level `event` field, making them queryable as a distinct class of logs in Loki:

```logql
{app="smoke-station-delivery", service="backend"} | json | event != ""
```

| Event | Trigger | Key fields |
|-------|---------|-----------|
| `auth.login_success` | Successful login | `userId`, `roles` |
| `order.created` | New order submitted | `orderId`, `userId`, `total`, `deliveryMethod`, `paymentMethod`, `itemCount` |
| `order.status_changed` | Order status updated | `orderId`, `toStatus`, `changedBy`, `changedByRoles` |
| `payment.succeeded` | Card payment confirmed | `orderId`, `userId`, `transId` |

Login failures (401) are captured by the global error handler and appear as `level=error` logs — they don't have a separate `event` field, but can be found via:
```logql
{app="smoke-station-delivery", service="backend"} | json | level = "error" | statusCode = 401
```

See the [monitoring README](./README.md) for the full observability architecture.
