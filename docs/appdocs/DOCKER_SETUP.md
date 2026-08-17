## Docker Setup Guide - Smoke Station Delivery

### Project Structure

```
.
├── backend/                 # Express.js API
│   ├── Dockerfile          # Multi-stage production build
│   ├── .dockerignore       # Exclude unnecessary files from Docker build context
│   ├── src/                # TypeScript source
│   ├── prisma/             # Database schema and migrations
│   └── package.json
├── web/                    # React frontend (Vite)
│   ├── package.json
│   └── src/
├── nginx/                  # Nginx configuration
│   ├── Dockerfile          # Multi-stage Nginx build
│   ├── nginx.conf          # Development config
│   ├── nginx.prod.conf     # Production config (optional)
│   └── ssl/                # SSL certificates (optional)
├── .dockerignore           # Root-level exclusions
├── docker-compose.yml      # Development compose
├── docker-compose.dev.yml  # Development with hot reload
├── docker-compose.prod.yml # Production compose
└── .env.example            # Environment variable template
```

### Images

All images use **Alpine Linux** for minimal size and **multi-stage builds** for optimized final layers:

- **backend**: node:18-alpine (builder) → node:18-alpine (runtime, ~180MB)
- **web**: node:18-alpine (builder) → nginx:1.25-alpine (runtime, ~40MB)
- **db**: postgres:16-alpine (~180MB)

### Development

#### Quick Start

```bash
# 1. Clone environment
cp .env.example .env

# 2. Start all services (database, backend, nginx)
docker compose up --pull always

# 3. Access
# - API: http://localhost:3000/api
# - Frontend: http://localhost (via Nginx proxy)
# - Database: localhost:5432
```

#### Hot Reload Setup

For faster development with automatic recompilation:

```bash
# 1. Use development compose with Vite dev server
docker compose -f docker-compose.dev.yml up

# 2. Access
# - Vite dev server: http://localhost:5843
# - API: http://localhost:3000/api
# - Nginx (compiled): http://localhost
```

**How it works:**
- Backend: `npm run dev` uses ts-node-dev with `--respawn` flag for auto-recompile
- Frontend: Vite dev server with hot module reload (HMR)
- Both bind mount source code for live updates

#### Rebuild After Dependency Changes

```bash
# Rebuild after package.json changes
docker compose build --no-cache

# Or rebuild specific service
docker compose build backend --no-cache
```

### Production Deployment

#### Environment Setup

```bash
# 1. Copy and configure production environment
cp .env.example .env.prod

# 2. Edit .env.prod with production values:
# - DB_USER, DB_PASSWORD, DB_NAME (strong passwords)
# - JWT_SECRET (long random string)
# - CORS_ORIGIN (your domain: https://yourdomain.com)
# - AUTH_RATE_LIMIT_MAX (higher for prod)
```

#### Build and Deploy

```bash
# 1. Build images on target machine (recommended)
docker compose -f docker-compose.prod.yml --env-file .env.prod build --no-cache

# 2. Start services
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 3. Verify health
docker compose -f docker-compose.prod.yml ps
docker logs generic-ecommerce-store-delivery-backend-prod
```

#### SSL/HTTPS (Optional)

```bash
# 1. Place certificates in nginx/ssl/
nginx/ssl/
  ├── cert.pem           # Full certificate chain
  └── key.pem            # Private key

# 2. Create nginx.prod.conf with SSL configuration
# docker-compose.prod.yml already mounts this volume
```

#### Database Migrations

Migrations run automatically via `npm run start:prod`:

```bash
# npm run start:prod = npx prisma migrate deploy && node dist/index.js

# To manually run migrations:
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy

# To seed database:
docker compose -f docker-compose.prod.yml exec backend npm run prisma:seed:prod
```

### Common Commands

```bash
# Start services
docker compose up -d

# View logs
docker compose logs backend        # Backend logs
docker compose logs -f backend     # Follow logs in real-time
docker logs <container_name>       # Docker CLI

# Access services
docker compose exec backend sh     # Shell into backend
docker compose exec db psql -U ${DB_USER} -d ${DB_NAME}  # Database shell

# Rebuild
docker compose build --no-cache

# Clean up
docker compose down                # Stop services, keep volumes
docker compose down -v             # Stop and remove volumes
docker system prune -a             # Remove all unused images/containers
```

### Networking

All services communicate via the `sshtx_network` bridge network:

- `backend` service is accessible at `http://backend:3000` from other containers
- `db` service is accessible at `postgresql://db:5432` from other containers
- `web` reverse proxy routes `/api/*` requests to `backend:3000`

### Volumes

**Development:**
- `postgres_data` - Database persistence
- Bind mounts for source code hot reload

**Production:**
- `postgres_data_prod` - Database persistence
- `uploads_data_prod` - User uploads storage
- Read-only mounts for SSL certificates

### Best Practices Applied

✅ **Multi-stage builds** - Reduces image size by excluding build dependencies
✅ **Alpine Linux** - Lightweight base images (~5-12MB base)
✅ **.dockerignore** - Excludes node_modules, .git, logs from build context
✅ **Layer caching** - Dependencies copied before source code
✅ **Non-root user** - Backend and Nginx run as unprivileged users
✅ **Health checks** - All services include health checks
✅ **Environment variables** - 12-factor app configuration
✅ **Security** - Minimal images, security headers, helmet middleware

### Troubleshooting

#### Backend won't start
```bash
# Check logs
docker compose logs backend

# Common issues:
# - Database not ready: wait for "db" service healthcheck
# - Missing .env file: copy .env.example to backend/.env
# - Port 3000 in use: change PORT in environment
```

#### React build fails
```bash
# Check Node version compatibility
docker exec generic-ecommerce-store-delivery-web node --version

# Rebuild with fresh dependencies
docker compose build web --no-cache
```

#### Database connection issues
```bash
# Verify database is running
docker compose ps db

# Check credentials in .env
# Connect manually
docker compose exec db psql -U ${DB_USER} -d ${DB_NAME}
```

#### Port conflicts
```bash
# Change ports in docker-compose.yml or use -p flag
docker compose up -d -p "8000:3000"  # Map port 8000 to container 3000

# Or modify docker-compose.yml:
# ports:
#   - "8000:3000"
```

### Performance Tips

- Use `docker-compose up --pull always` for latest images
- Pin image versions (avoid `latest` tag in production)
- Use `docker system prune` regularly to free disk space
- Monitor with `docker stats` during load testing
- Set resource limits in docker-compose.yml if needed:
  ```yaml
  deploy:
    resources:
      limits:
        cpus: '0.5'
        memory: 512M
  ```

### Security Checklist

- [ ] Change all default passwords in .env.prod
- [ ] Set strong JWT_SECRET (32+ characters, random)
- [ ] Configure CORS_ORIGIN to your actual domain
- [ ] Enable HTTPS with valid SSL certificates
- [ ] Run containers as non-root users (already done)
- [ ] Regularly update base images (`docker pull postgres:16-alpine`)
- [ ] Use secrets management for production credentials
- [ ] Implement rate limiting (AUTH_RATE_LIMIT_MAX)
- [ ] Enable database backups
