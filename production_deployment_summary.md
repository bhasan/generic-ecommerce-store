# Step-by-Step Production Deployment

## Quick Reference

| Phase | Where | Command / Action |
|-------|--------|------------------|
| Build frontend | Dev | `cd web && npm install && npm run build && cd ..` |
| Build images | Dev | `docker compose -f docker-compose.prod.yml --env-file .env.prod build` |
| Export images | Dev | `docker save -o smoke_station_app_vVERSION.tar <backend-image> <web-image>` |
| Copy to target | — | Copy tarball, `docker-compose.prod.yml`, root `.env.prod`, `backend/.env`, `nginx/`, `cloudflare-ddns/` (optional) |
| Load and run | Target | `docker load -i smoke_station_app_vVERSION.tar` then `docker compose ... up -d` |
| Migrate | Target | `docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy` |
| Seed (first time) | Target | `docker exec smoke-station-delivery-backend-prod npm run prisma:seed:prod` |

---

## 1. Build on Dev Machine

**1.1** From the **project root** (e.g. `smoke-station-delivery`):

```bash
cd web && npm install && npm run build && cd ..
```

**1.2** Build backend and web images (use env file so variables resolve):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build
```

Optional: build a single service and/or no cache:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build backend --no-cache
docker compose -f docker-compose.prod.yml --env-file .env.prod build web --no-cache
```

**1.3** Get the exact image names (Compose may add a project prefix):

```bash
docker images
```

**1.4** Save both app images to one tarball (use the names from step 1.3):

```bash
docker save -o smoke_station_app_v1111.tar smoke-station-delivery-backend-prod smoke-station-delivery-web-prod
```

(Replace `v1111` with your version; replace image names if yours differ, e.g. `smoke-station-delivery_backend`.)

---

## 2. Env and DB Credentials

- **Root** `.env.prod`: used by Compose (`--env-file .env.prod`). Must include `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `CORS_ORIGIN`, `HTTP_PORT`, `HTTPS_PORT`, `AUTH_RATE_LIMIT_MAX`.
- **Backend** `backend/.env`: used by the backend container via `env_file` in compose. Must match DB and app vars; include `ADMIN_PASSWORD` (and optional `ADMIN_EMAIL`, `ADMIN_NAME`) for the prod seed.

Keep root `.env.prod` and `backend/.env` in sync (same DB credentials and secrets). On the target you need both files in the right places (see "What the Target Must Have" below).

---

## 3. Copy to Target

Copy these to the target (e.g. into a single app directory such as `C:\webhosting\webapp` or `/home/webuser/smoke-station-delivery`):

| Item | Purpose |
|------|---------|
| `smoke_station_app_v1111.tar` | Backend + web images |
| `docker-compose.prod.yml` | Stack definition |
| `.env.prod` | Root env for Compose (use as `--env-file .env.prod`) |
| `backend/.env` | Backend env (path must be `backend/.env` for compose) |
| `nginx/` | Entire directory (config and optional `ssl/`) |
| `cloudflare-ddns/` | Entire directory with `config.json` (required if using cloudflare-ddns service; copy `config-example.json` as `config.json` and edit) |
| `web/dist/` | Only if the web image was built without it baked in (usually not needed) |

Note: Postgres is not in the tarball; the target will pull `postgres:16-alpine` on first `up`.

---

## 4. Target Machine: Software Requirements

- **Docker** and **Docker Compose** (Docker Desktop on Windows, or Docker Engine + Compose on Linux/WSL).
- **WSL (Windows):** e.g. Ubuntu from the Microsoft Store; create a user (e.g. `webuser`) and install Docker there if you run everything in WSL.
- Suggested layout:
  - One folder for the app (e.g. `webapp`) containing `docker-compose.prod.yml`, `.env.prod`, `backend/.env`, `nginx/`, and the tarball.
  - Optionally a separate folder for other Docker images if you keep multiple tarballs.

---

## 5. Target: Load Images and Start Stack

**5.1** Go to the application root (the directory that contains `docker-compose.prod.yml`):

```bash
cd /path/to/webapp
```

**5.2** Load the app images:

```bash
docker load -i smoke_station_app_v1111.tar
```

**5.3** (First-time only) Pull Postgres if you don't use a pre-pulled image:

```bash
docker pull postgres:16-alpine
```

**5.4** Start the stack:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

**5.5** Run migrations (first time and after schema changes):

```bash
docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy
```

**5.6** (First time) Create admin user and roles:

```bash
docker exec smoke-station-delivery-backend-prod npm run prisma:seed:prod
```

Ensure `ADMIN_PASSWORD` (and optionally `ADMIN_EMAIL`, `ADMIN_NAME`) are set in `backend/.env` or in the backend container env.

---

## 6. What the Target Must Have

Before `docker compose ... up -d`, the target app directory must contain:

| Path | Description |
|------|-------------|
| `./docker-compose.prod.yml` | Production compose file |
| `./.env.prod` | Root env (Compose `--env-file`); keep name as `.env.prod` |
| `./backend/.env` | Backend env; **exact path** (compose points to `./backend/.env`) |
| `./nginx/` | Full nginx directory (config and optional `ssl/`) |
| `./cloudflare-ddns/config.json` | DDNS config (required if using cloudflare-ddns; copy from `config-example.json` and edit) |
| (Optional) `./web/dist/` | Only if you serve frontend from host-mounted build instead of the web image |

The web image normally already contains the built frontend; you do **not** need to copy `web/dist` unless you changed the setup to mount it from the host.

---

## 7. Common Issues

**Postgres schema / migrations not applied**

- Migrations run inside the backend container:  
  `docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy`
- If the DB volume was recreated or is empty, run migrations again after `up -d`.
- If you need a clean DB: remove the Postgres volume, then bring the stack up again and run migrations and seed:

  ```bash
  docker compose -f docker-compose.prod.yml --env-file .env.prod down
  docker volume ls   # find postgres volume, e.g. smoke-station-delivery_postgres_data_prod
  docker volume rm <volume_name>
  docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
  docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy
  docker exec smoke-station-delivery-backend-prod npm run prisma:seed:prod
  ```

**Backend can't connect to DB**

- Confirm root `.env.prod` and `backend/.env` use the same `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
- Confirm `DATABASE_URL` in the backend container uses host `db` (e.g. `postgresql://USER:PASS@db:5432/DBNAME`). Compose sets this from the root env.
