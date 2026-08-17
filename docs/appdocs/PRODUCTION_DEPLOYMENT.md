# Production Deployment Guide

Smoke Station uses a tarball-based deploy script that builds images locally and
ships them to the server over SSH. All deploy steps are handled by
`scripts/build-and-deploy.sh` (or its two sub-scripts individually).

## Compose Architecture

The production stack layers four Compose files on the server:

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Shared base |
| `docker-compose.prod.yml` | Production overrides, SSL mounts, ports |
| `docker-compose.shared-edge.override.yml` | Server-side only — shared edge networks/mounts, not in repo |
| `monitoring/docker-compose.monitoring.yml` | Promtail + Prometheus (project: `generic-ecommerce-store-monitoring`) |

The web container (nginx) acts as a shared edge router — it handles
`generic-ecommerce-store.example.com` (Smoke Station), `buddash.tech` (Physalia), and
`nanomia.buddash.tech` (Nanomia) from one nginx process. The server-side
`nginx/nginx.prod.conf` must not be overwritten without a manual diff review
first. Use `--sync-config` carefully for nginx changes.

## Prerequisites

- Linux server with Docker and Docker Compose v2
- `docker-compose.shared-edge.override.yml` present at `$REMOTE_DIR` on the server
- SSL certs for `generic-ecommerce-store.example.com` at `$REMOTE_DIR/nginx/ssl/` on the server
- Let's Encrypt certs at `/etc/letsencrypt/` on the server (for Physalia/Nanomia blocks)
- Server firewall open on ports `80` and `443`

## First-Time Server Setup

These files must exist on the server before the first deploy. The deploy script
bootstraps most of them automatically, but the live env files must be created manually:

```bash
# On the server
mkdir -p /docker/generic-ecommerce-store/{nginx/ssl,monitoring/promtail,monitoring/prometheus,scripts,backups}

# Create live env files (fill in real values)
cp .env.example .env.prod
cp backend/.env.example backend/.env
# Edit both files with production secrets
```

The deploy script automatically uploads on first run (if missing or changed):
- `scripts/sync-env.sh`
- `monitoring/docker-compose.monitoring.yml`
- `monitoring/promtail/config.yml`
- `monitoring/prometheus/prometheus.yml`
- `monitoring/prometheus/entrypoint.sh`

## Deploying

### Full deploy (build + ship)

```bash
bash scripts/build-and-deploy.sh <server-ip>
```

This runs `build.sh` then `deploy.sh`. You will be prompted for:
1. Upload confirmation (y/N) — images are 269MB + 25MB
2. SSH password — entered once, reused for all subsequent SSH/SCP calls
3. Prisma migration status output — **stop and take a DB backup if there are pending migrations**
4. Compose up confirmation (y/N)

### Skip image upload (config/env changes only)

```bash
bash scripts/deploy.sh <server-ip> --skip-upload
```

### Run post-deploy checklist only

```bash
bash scripts/deploy.sh <server-ip> --checklist-only
```

### Sync changed config files to server

```bash
bash scripts/deploy.sh <server-ip> --sync-config
```

Compares local vs server copies of tracked config files and prompts before
uploading. Always backs up the server copy first. **Review nginx diffs carefully
before confirming** — the server's `nginx/nginx.prod.conf` contains
deployment-specific domains and cert paths not present in the local copy.

### Exclude monitoring stack

```bash
bash scripts/deploy.sh <server-ip> --no-monitoring
```

## Migrations

Migrations run automatically via `npm run start:prod` (`prisma migrate deploy &&
node dist/index.js`) when the backend container starts.

The deploy script runs `prisma migrate status` before compose up so you can
catch pending migrations. If migrations are pending:

1. **Take a DB backup first:**
   ```bash
   docker exec generic-ecommerce-store-delivery-db-prod pg_dump -U backend_user generic-ecommerce-store-delivery-db-prod \
     > /docker/generic-ecommerce-store/backups/pre-deploy-$(date +%Y%m%d_%H%M%S).sql
   ```

2. Proceed with deploy — `migrate deploy` runs on container start.

### Squashed migration history

The local migration history starts from `0_init` (a baseline squash). The
production DB may have the original incremental history. On first deploy after a
squash, mark the baseline as already applied:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.shared-edge.override.yml \
  -f monitoring/docker-compose.monitoring.yml \
  run --rm --no-deps backend npx prisma migrate resolve --applied 0_init
```

### Failed migration recovery

If a migration fails (P3009), mark it as rolled back before retrying:

```bash
docker compose [...] run --rm --no-deps backend \
  npx prisma migrate resolve --rolled-back <migration_name>
```

Then fix the migration SQL, rebuild, and redeploy. Common causes:
- Orphaned rows violating FK constraints being added by the migration
  (add `DELETE FROM "table" WHERE "fk_col" NOT IN (SELECT "id" FROM "ref_table")` before the FK)

## Environment Variables

The deploy script always uploads `.env.example` and `backend/.env.example` to
the server, then runs `scripts/sync-env.sh` to append any missing keys to the
live `.env.prod` and `backend/.env` (existing values are never modified).

Monitoring vars that must be filled in manually on the server:

| File | Keys |
|------|------|
| `.env.prod` | `LOKI_URL`, `LOKI_USERNAME`, `LOKI_PASSWORD`, `PROMETHEUS_REMOTE_WRITE_URL`, `PROMETHEUS_USERNAME`, `PROMETHEUS_PASSWORD` |

## Monitoring Stack

Promtail and Prometheus run as part of the same deploy under the
`generic-ecommerce-store-monitoring` Compose project. They join the
`generic-ecommerce-store_sshtx_network` external network.

After deploy, confirm both are running:

```bash
docker ps | grep -E "promtail|prometheus"
```

## Verify Deployment

```bash
curl -s http://localhost/api/health
# Expected: {"status":"ok","checks":{"database":"ok"}}

docker ps | grep generic-ecommerce-store
docker logs --tail 50 generic-ecommerce-store-delivery-backend-prod
```

The post-deploy hardening checklist runs automatically at the end of every
deploy (use `--skip-checklist` to bypass, `--checklist-only` to run it
standalone).

## Related Docs

- [DOCKER_SETUP.md](./DOCKER_SETUP.md)
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
- [../monitoring/README.md](../monitoring/README.md)
