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

### 5. Load image and start stack

From the **webapp** directory (where `docker-compose.prod.yml` and `.env.prod` are):

```bash
docker load -i ../docker_images/smoke_station_app_v1111.tar
```

If the tar is in **webapp**:

```bash
docker load -i smoke_station_app_v1111.tar
```

Then:

```bash
docker pull postgres:16-alpine
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
# Wait for DB to be ready (e.g. 15 seconds), then:
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy
```

### 6. Verify

- `docker compose -f docker-compose.prod.yml ps`
- Open `http://<target-ip>` or run `curl http://localhost/api/health`
