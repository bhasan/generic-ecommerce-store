# DevOps Pipeline Overview

This document describes how to build Docker images on one machine and deploy them on another (e.g. build on a dev/CI machine, run on a Raspberry Pi or production server with its own database).

---

## Summary

| Phase | Where | Action |
|-------|--------|--------|
| 1. Build | Build machine | Build frontend, then `docker compose build` for backend + web. |
| 2. Export | Build machine | `docker save` backend and web images to a tarball. |
| 3. Ship | — | Copy tarball (and optional compose/env) to target. |
| 4. Deploy | Target | `docker load`, then `docker compose up -d` (target has its own DB). |
| 5. Migrate | Target | Run Prisma migrations if schema changed. |

For new versions, repeat: rebuild → export → ship → on target: down, load, up, migrate.

---

## Environment (two files)

Env is kept in **two places**:

- **Root** `.env.prod` (or `.env`) — Used by Docker Compose for build and run (`--env-file .env.prod`). Contains `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `CORS_ORIGIN`, `HTTP_PORT`, `HTTPS_PORT`, `AUTH_RATE_LIMIT_MAX`.
- **Backend** `backend/.env` — Loaded by the backend service via Compose `env_file`. Should contain the same secrets plus optional `REQUEST_TIMEOUT_MS`, `MAKE_WEBHOOK_URL`, `MAKE_API_KEY`. Keep in sync with root or populate from it.

When copying the project to the target, copy both env files (or ensure both exist on the target). See [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) Step 2 for details.

---

## Prerequisites

- **Build machine:** Docker, Docker Compose, Node/npm (for frontend build). Project repo, root `.env.prod`, and `backend/.env` for variable substitution and backend config.
- **Target machine:** Docker, Docker Compose, project files (at least `docker-compose.prod.yml`, `nginx/`), root `.env.prod`, and `backend/.env`. Target runs its own database (via compose or external).

---

## 1. Build images (build machine)

From the project root:

```bash
# Build frontend (required; output is baked into the web image)
cd web && npm install && npm run build && cd ..

# Build backend and web images (use env file so Compose variables resolve)
docker compose -f docker-compose.prod.yml --env-file .env.prod build
```

Only the **backend** and **web** images need to be moved. The target will use its own Postgres (defined in compose or elsewhere).

---

## 2. Export images (build machine)

Check the image names Compose produced (they may include a project prefix):

```bash
docker images
```

Then save both app images to a single tarball:

```bash
docker save -o smoke-station-app.tar \
  smoke-station-delivery-backend-prod \
  smoke-station-delivery-web-prod
```

Use the exact repository names from `docker images`. If your project name differs, the image names will look like `<project>_backend` and `<project>_web`.

---

## 3. Ship to target

Copy to the target machine:

- **smoke-station-app.tar** (required)
- **Project files** needed to run compose: at minimum `docker-compose.prod.yml` and the `nginx/` directory (config and any SSL paths). Optionally the full repo.
- **Root** `.env.prod` (or the env file the target uses) with that machine’s `DB_*`, `JWT_SECRET`, `CORS_ORIGIN`, etc.
- **Backend** `backend/.env` (same secrets and any backend-only vars; keep in sync with root).

---

## 4. Deploy on target

On the target machine:

```bash
# Load the images
docker load -i smoke-station-app.tar

# Start the stack (uses target’s .env.prod and backend/.env; target has its own database)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

If the target uses the Postgres service from the same compose file, the database will start in a volume. If the target has an existing database, ensure root `.env.prod` (and `backend/.env`) point to it; you may run only the backend and web services.

Run migrations after first deploy or when schema changes:

```bash
docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy
```

---

## 5. Deploying new versions (repeatable)

For each new release:

1. **Build machine:** Update code → build frontend → build images:
   ```bash
   cd web && npm run build && cd ..
   docker compose -f docker-compose.prod.yml --env-file .env.prod build
   ```
2. **Export:** Save the updated images (same command as in step 2).
3. **Ship:** Copy the new tarball (and any compose/env changes) to the target.
4. **Target:**
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod down
   docker load -i smoke-station-app.tar
   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
   docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy
   ```

The target’s database and volume data stay in place; only the app images are replaced.

---

## Optional: Registry-based pipeline

If the target can reach a container registry (Docker Hub, GitHub Container Registry, etc.):

**Build machine:**

- Tag and push after building:
  ```bash
  docker tag smoke-station-delivery-backend-prod your-registry/smoke-station-backend:v1.0
  docker push your-registry/smoke-station-backend:v1.0
  # Same for web image
  ```

**Target:**

- Use the registry image names (and tags) in `docker-compose.prod.yml` or override with an env file so services pull the correct image.
- To deploy a new version: `docker compose pull` then `docker compose up -d`.

No manual `docker save`/copy/`docker load`; the target always pulls the desired image tag.

---

## Related docs

- [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) — Full production setup, env files (two locations), SSL, backups, and verification on a single server.
