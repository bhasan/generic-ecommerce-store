# Operations Pipeline: Cross-Machine Build → Deploy

This guide covers building Docker images on one machine and deploying them on another (e.g. build on a dev/CI machine, deploy on a Raspberry Pi, Windows server, or any target with no Node/npm).

**Use this guide when:** the target server cannot build images (no Node.js/npm), or you want to build images in CI and ship them as a versioned artefact.

**Use [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) instead** if you have access to git and Node/npm on the target (simpler, build directly on the server).

---

## Summary

| Phase | Where | Action |
|-------|--------|--------|
| 1. Build | Build machine | Build frontend, then `docker compose build` for backend + web |
| 2. Export | Build machine | `docker save` backend and web images to a versioned tarball |
| 3. Copy | — | Copy tarball + config files to target |
| 4. Load | Target | `docker load` the tarball |
| 5. Start | Target | `docker compose up -d` |
| 6. Migrate | Target | `npx prisma migrate deploy` inside backend container |
| 7. Seed | Target (first time) | `npm run prisma:seed:prod` inside backend container |

For new versions, repeat: rebuild → export → copy → on target: down, load, up, migrate.

---

## Prerequisites

**Build machine:**
- Docker and Docker Compose v2
- Node.js/npm (for frontend build)
- Project repo with root `.env.prod` and `backend/.env`

**Target machine:**
- Docker and Docker Compose v2
- No Node/npm required
- Project files: at minimum `docker-compose.prod.yml`, `nginx/`, root `.env.prod`, `backend/.env`
- **Windows:** Docker Desktop, or Docker Engine + Compose in WSL (e.g. Ubuntu from the Microsoft Store). Create a dedicated user (e.g. `webuser`) and run Docker from there.

---

## Step 1: Build Images on Dev/Build Machine

**1.1** From the **project root**:

```bash
cd web && npm install && npm run build && cd ..
```

**1.2** Build backend and web images (use env file so Compose variables resolve):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build
```

Optional — build a single service or skip layer cache:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build backend --no-cache
docker compose -f docker-compose.prod.yml --env-file .env.prod build web --no-cache
```

**1.3** Confirm the exact image names (Compose may add a project-name prefix):

```bash
docker images
```

Look for names like `smoke-station-delivery-backend-prod` and `smoke-station-delivery-web-prod`. If your project directory name differs the prefix will differ — use the names shown by `docker images`.

**1.4** Save both app images to a single versioned tarball:

```bash
docker save -o smoke_station_app_v1.0.0.tar \
  smoke-station-delivery-backend-prod \
  smoke-station-delivery-web-prod
```

Replace `v1.0.0` with your version or release tag. Postgres is **not** included in the tarball — the target will pull `postgres:16-alpine` on first start.

---

## Step 2: Environment Files

Env is kept in two places — see [PRODUCTION_DEPLOYMENT.md Step 2](./PRODUCTION_DEPLOYMENT.md#step-2-environment-configuration) for the full variable reference and how to generate secure credentials.

**What to ensure before copying to target:**

- Root `.env.prod` contains the target's `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `CORS_ORIGIN`, and ports.
- `backend/.env` mirrors the same secrets and includes:
  - `ADMIN_PASSWORD` (required for `prisma:seed:prod`)
  - Optionally `ADMIN_EMAIL`, `ADMIN_NAME`
  - Any other backend-only vars (`REQUEST_TIMEOUT_MS`, `MAKE_WEBHOOK_URL`, etc.)

Both files must exist at the exact paths the Compose file expects:
- Root `.env.prod` → `./` (project root on target)
- `backend/.env` → `./backend/.env` (exact path; Compose reads this via `env_file`)

---

## Step 3: Copy Files to Target

Copy these to the target's application directory (e.g. `/home/webuser/smoke-station-delivery` or `C:\webhosting\webapp`):

| Item | Purpose |
|------|---------|
| `smoke_station_app_vVERSION.tar` | Backend + web Docker images |
| `docker-compose.prod.yml` | Stack definition |
| `.env.prod` | Root env (passed as `--env-file .env.prod`) |
| `backend/` directory with `.env` | Backend env (`backend/.env` exact path required) |
| `nginx/` directory | Full directory: config + optional `ssl/` |
| `cloudflare-ddns/` directory | Required if using the DDNS service; copy `config-example.json` as `config.json` and edit |

You do **not** need Dockerfiles, source code, `node_modules`, or `web/dist` — everything is baked into the images.

---

## Step 4: Target Machine Requirements

Before running `docker compose up`:

- Docker and Docker Compose v2 must be installed and running
- **Windows/WSL:** All commands below run inside WSL (e.g. Ubuntu). Navigate to the application directory with `cd /path/to/app`.
- Suggested directory layout on target:
  ```
  /home/webuser/smoke-station-delivery/
  ├── docker-compose.prod.yml
  ├── .env.prod
  ├── backend/
  │   └── .env
  ├── nginx/
  │   ├── nginx.prod.conf
  │   └── ssl/           ← empty ok; populated when HTTPS is set up
  └── cloudflare-ddns/
      └── config.json    ← only if using DDNS
  ```

---

## Step 5: Load Images and Start Stack

**5.1** Navigate to the application directory on the target:

```bash
cd /path/to/smoke-station-delivery
```

**5.2** Load the images from the tarball:

```bash
docker load -i smoke_station_app_v1.0.0.tar
```

**5.3** (First time only) Pull Postgres if not already cached:

```bash
docker pull postgres:16-alpine
```

**5.4** Create required directories if they don't exist:

```bash
mkdir -p nginx/ssl
```

**5.5** Start the stack:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

**5.6** Run migrations (required on first deploy and after any schema changes):

```bash
docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy
```

**5.7** (First time only) Seed the database:

```bash
docker exec smoke-station-delivery-backend-prod npm run prisma:seed:prod
```

Ensure `ADMIN_PASSWORD` is set in `backend/.env` before running this.

---

## Step 6: Required Target File Layout

Confirm these exist before `docker compose up`:

| Path | Description |
|------|-------------|
| `./docker-compose.prod.yml` | Production compose file |
| `./.env.prod` | Root env (Compose `--env-file`) |
| `./backend/.env` | Backend env — **exact path**, Compose reads `./backend/.env` |
| `./nginx/nginx.prod.conf` | Nginx config (in repo) |
| `./nginx/ssl/` | SSL cert directory (can be empty until HTTPS is set up) |
| `./cloudflare-ddns/config.json` | Only required if using the cloudflare-ddns service |

---

## Step 7: Deploying New Versions

For each new release:

**On the build machine:**

```bash
# 1. Update code
git pull

# 2. Rebuild frontend
cd web && npm run build && cd ..

# 3. Rebuild images
docker compose -f docker-compose.prod.yml --env-file .env.prod build

# 4. Export updated images (use a new version tag)
docker save -o smoke_station_app_v1.1.0.tar \
  smoke-station-delivery-backend-prod \
  smoke-station-delivery-web-prod
```

**Copy the new tarball to the target**, then on the target:

```bash
# 1. Stop the stack
docker compose -f docker-compose.prod.yml --env-file .env.prod down

# 2. Load updated images
docker load -i smoke_station_app_v1.1.0.tar

# 3. Start the stack
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 4. Apply any schema changes
docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy
```

The target's database volume and data are preserved — only the app images are replaced.

---

## Optional: Registry-Based Pipeline

If the target can reach a container registry (Docker Hub, GitHub Container Registry, etc.), you can skip the tarball entirely:

**On the build machine — tag and push:**

```bash
docker tag smoke-station-delivery-backend-prod your-registry/smoke-station-backend:v1.1.0
docker push your-registry/smoke-station-backend:v1.1.0

docker tag smoke-station-delivery-web-prod your-registry/smoke-station-web:v1.1.0
docker push your-registry/smoke-station-web:v1.1.0
```

**Update `docker-compose.prod.yml`** on the target to reference the registry image names and tags.

**On the target — to deploy a new version:**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy
```

No manual save/copy/load required.

---

## Troubleshooting

### Migrations not applied after deploy

```bash
docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy
```

If the DB volume was recreated (e.g. `docker compose down -v`), run migrations and seed again after bringing the stack up:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down
docker volume ls  # find the postgres volume, e.g. smoke-station-delivery_postgres_data_prod
docker volume rm <volume_name>
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy
docker exec smoke-station-delivery-backend-prod npm run prisma:seed:prod
```

### Backend can't connect to DB

- Confirm `DB_USER`, `DB_PASSWORD`, `DB_NAME` are identical in root `.env.prod` and `backend/.env`.
- Confirm `DATABASE_URL` in the backend container uses host `db`: `postgresql://USER:PASS@db:5432/DBNAME`.

```bash
docker exec smoke-station-delivery-backend-prod env | grep DATABASE_URL
```

### Docker build fails with TLS/network errors

`TLS handshake timeout` or `failed to resolve source metadata` means Docker can't reach Docker Hub.

1. Retry — network issues are often transient.
2. Pre-pull base images when the network is stable:
   ```bash
   docker pull node:18-alpine
   docker pull nginx:1.25-alpine
   ```
3. Check firewall/VPN or try a different network connection.

---

## Related Docs

- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) — Full single-server setup: SSL, backups, firewall, security
- [MONITORING.md](./MONITORING.md) — Health checks, uptime monitoring, metrics, and alerting
