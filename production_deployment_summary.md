# Production Deployment Summary

## Step by Step Prod Deployment

### Software Prep (build machine)

1. **Web dir:** `npm install && npm run build`
   - From project root: `cd web && npm install && npm run build && cd ..`

2. **Build images:**  
   `docker compose -f docker-compose.prod.yml --env-file .env.prod build`

3. **Save images to tar:**  
   `docker save -o smoke_station_app_v1111.tar smoke-station-delivery/backend:latest smoke-station-delivery/web:latest`  
   - Use `docker images` to list image names (not containers) if needed.

4. **Copy to target:**
   - `smoke_station_app_v1111.tar`
   - `docker-compose.prod.yml`
   - `.env.prod`
   - `backend/.env` (or `backend/.env.prod` — compose uses `backend/.env`)
   - `backend/Dockerfile` (optional; only if building on target)
   - `nginx/` directory (at least `nginx.prod.conf` and `nginx/ssl` or empty `ssl` folder)

---

### Software requirements (target)

- **Docker** (Linux or WSL)
- **Docker Compose**

---

## Instructions (target machine)

### 1. Set up Windows

- Install **Ubuntu** from Microsoft Store (for terminal).
- Open terminal. Create user: `webuser` / password: `password123` (or your choice).
- Run: `sudo apt update && sudo apt upgrade`
- Install npm if you need to build on target (otherwise optional).

### 2. Install Docker Desktop / Docker Compose

- Install Docker and Docker Compose on the target machine.

### 3. Create directories

- `C:\webhosting` (or your chosen base path)
  - **webapp** — application files (compose, env, nginx, backend/.env)
  - **docker_images** — packaged Docker image tar file(s)

### 4. Place files

- Put **smoke_station_app_v1111.tar** in the **docker_images** directory (or in **webapp** if you prefer a single folder).
- In **webapp**, place:
  - `docker-compose.prod.yml`
  - `.env.prod` (root env for Compose)
  - `backend/.env` (backend app env; compose expects `./backend/.env`)
  - `nginx/` directory (include `nginx.prod.conf` and `nginx/ssl`; `ssl` can be empty)

### 5. First-time DB setup (important)

The Postgres image **only creates the user and database when it starts with an empty data directory** and when the environment variables `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` are set. Those come from your `.env.prod` as `DB_USER`, `DB_PASSWORD`, `DB_NAME` (Compose substitutes them into the `db` service).

If the db container ever started **without** `--env-file .env.prod`, or with an **existing volume** from a previous run, the user/database are never created — hence "smoke_station_user does not exist."

**On first-time setup on the target:**

1. Run all commands from the **webapp** directory (where `docker-compose.prod.yml` and `.env.prod` live).
2. Confirm `.env.prod` exists and contains:
   ```bash
   DB_USER=smoke_station_user
   DB_PASSWORD=your_secure_password
   DB_NAME=smoke_station_prod
   ```
3. If you already ran `up -d` before, remove the existing DB volume so Postgres can run its init script:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod down
   docker volume ls | grep postgres
   docker volume rm <volume_name>   # e.g. webapp_postgres_data_prod
   ```
4. Then follow step 6 (load image and start stack). Start **only** the db first so it gets the env vars and an empty volume.

### 6. Load image and start stack

From the **webapp** directory (where `docker-compose.prod.yml` and `.env.prod` are):

```bash
docker load -i ../docker_images/smoke_station_app_v1111.tar
```

If the tar is in **webapp**:

```bash
docker load -i smoke_station_app_v1111.tar
```

Then (first time: use a fresh volume and start db first):

```bash
docker pull postgres:16-alpine
# Start DB only so it creates user and database from .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
# Wait for DB to be ready (init runs only on empty volume)
sleep 15
# Start backend and web
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
# Create tables (schema)
docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy
```

### 7. Verify

- `docker compose -f docker-compose.prod.yml ps`
- Open `http://<target-ip>` or run `curl http://localhost/api/health`

---

## Troubleshooting

### "smoke_station_user does not exist" (or DB user/database not created)

**Why it happens**

- The **Postgres image** creates `POSTGRES_USER` and `POSTGRES_DB` only on **first run** when the data directory is **empty**. It reads `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` from the container environment.
- Those values come from **Compose** when you run `docker compose ... up -d`. Compose fills them from `.env.prod` (`DB_USER`, `DB_PASSWORD`, `DB_NAME`) **only if** you use `--env-file .env.prod` and the file is in the current directory.
- If you ran `up -d` without `--env-file .env.prod`, or from a different directory (so `.env.prod` was missing or not used), the db container got empty env vars and did **not** create the user or database.
- If the Postgres **volume** already had data from a previous run, Postgres skips init and does **not** create the user again.

**Fix**

1. From the **webapp** directory, confirm:
   ```bash
   ls -la .env.prod
   cat .env.prod | grep -E '^DB_USER|^DB_PASSWORD|^DB_NAME'
   ```
   You should see `DB_USER=smoke_station_user`, `DB_PASSWORD=...`, `DB_NAME=smoke_station_prod`.

2. Tear down and remove the Postgres volume so the next start uses an empty data dir:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod down
   docker volume ls
   docker volume rm webapp_postgres_data_prod
   ```
   (Use the actual volume name from `docker volume ls`; it may include the project directory name.)

3. Start **only** the db with the env file so init runs:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
   sleep 15
   ```

4. Check that the user and database exist:
   ```bash
   docker exec -it smoke-station-delivery-db-prod psql -U smoke_station_user -d smoke_station_prod -c '\l'
   ```

5. Start the rest and run migrations:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
   docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy
   ```

**Summary:** Docker/Compose do not create the DB user or schema by magic. The **database and user** are created by the Postgres image **only when** it gets `DB_USER`/`DB_PASSWORD`/`DB_NAME` from `.env.prod` (via `--env-file`) and the data volume is **empty**. The **schema (tables)** are created by **Prisma** when you run `npx prisma migrate deploy` in the backend container.
