# Production Deployment Guide

This guide covers deploying the Smoke Station application to a production server (build and run on the same machine). For cross-machine deployments (build on dev, deploy on a separate server), see [OPERATIONS_PIPELINE.md](./OPERATIONS_PIPELINE.md).

## Summary

| Step | Action |
|------|--------|
| 1. Server setup | Install Docker, clone repo |
| 2. Environment | Create root `.env.prod` and `backend/.env` |
| 3. Frontend build | `cd web && npm install && npm run build && cd ..` |
| 4. Build images | `docker compose -f docker-compose.prod.yml --env-file .env.prod build` |
| 5. Start stack | `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d` |
| 6. Migrate DB | `docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy` |
| 7. Verify | Check `docker compose -f docker-compose.prod.yml ps` and `curl http://localhost/api/health` |

Optional after step 6: seed DB, configure HTTPS (Step 8), configure firewall (Step 9).

---

## Prerequisites

- **Server**: Linux server (Ubuntu 20.04+ recommended) with Docker and Docker Compose v2 installed
- **Domain**: Domain name pointing to your server's IP address (optional but recommended for HTTPS)
- **SSL Certificate**: For HTTPS (Let's Encrypt recommended)
- **Firewall**: Configured to allow ports 80 (HTTP) and 443 (HTTPS)

---

## Step 1: Server Setup

### 1.1 Install Docker and Docker Compose

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker (includes Docker Compose v2 plugin)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Verify installation
docker --version
docker compose version
```

### 1.2 Clone Repository

```bash
git clone <your-repo-url> smoke-station-delivery
cd smoke-station-delivery

# Checkout production branch (if applicable)
git checkout production  # or main/master
```

---

## Step 2: Environment Configuration

### Environment files (two locations)

Env is kept in **two places**:

- **Root `.env.prod`** — Used by Docker Compose (`--env-file .env.prod`) for service config. Compose also injects these values to build `DATABASE_URL` inside the backend container.
- **`backend/.env`** — Loaded by the backend container via `env_file` in `docker-compose.prod.yml`. Must include the same secrets plus any backend-only vars. See [`backend/.env.example`](backend/.env.example).

Keep both files in sync (same DB credentials and secrets).

### 2.1 Create root `.env.prod`

```bash
# Create in project root
cat << 'EOF' > .env.prod
# Database
DB_USER=smoke_station_user
DB_PASSWORD=CHANGE_ME_STRONG_PASSWORD
DB_NAME=smoke_station_prod

# JWT
JWT_SECRET=CHANGE_ME_STRONG_JWT_SECRET
JWT_EXPIRES_IN=24h

# CORS — restrict to your domain in production
CORS_ORIGIN=https://your-domain.com

# Ports
HTTP_PORT=80
HTTPS_PORT=443

# Rate limiting
AUTH_RATE_LIMIT_MAX=20

# Cloudflare DDNS (optional — only if using the cloudflare-ddns service)
# CF_DDNS_API_TOKEN=your_cloudflare_api_token_here
# CF_DDNS_ZONE_ID=your_cloudflare_zone_id_here
EOF
```

Replace `CHANGE_ME_*` and `your-domain.com` with real values. Use `openssl rand -base64 32` for passwords and JWT secrets.

**Note:** `.env.prod` can be committed to version control as long as you never put actual secrets in the file as shown above — always replace placeholders before deployment and ensure the committed version only contains placeholder values.

### 2.2 Create `backend/.env`

Mirror the same secrets and add any backend-only variables. Compose overrides `DATABASE_URL` at runtime using the `db` host — the value here is a placeholder.

```bash
# Required (must match root .env.prod)
DATABASE_URL=postgresql://smoke_station_user:CHANGE_ME_STRONG_PASSWORD@db:5432/smoke_station_prod
JWT_SECRET=CHANGE_ME_STRONG_JWT_SECRET
JWT_EXPIRES_IN=24h
CORS_ORIGIN=https://your-domain.com
AUTH_RATE_LIMIT_MAX=20

# Server
PORT=3000
NODE_ENV=production

# Optional
REQUEST_TIMEOUT_MS=30000

# Production seed admin account (required for prisma:seed:prod)
# ADMIN_PASSWORD=CHANGE_ME_ADMIN_PASSWORD
# ADMIN_EMAIL=admin@your-domain.com
# ADMIN_NAME=Admin

# External integrations (optional)
# MAKE_WEBHOOK_URL=https://hook.us2.make.com/...
# MAKE_API_KEY=...
# VITE_TAWK_PROPERTY_ID=your-property-id
# VITE_TAWK_WIDGET_ID=your-widget-id
```

### 2.3 Generate Secure Credentials

```bash
# Generate a database password
openssl rand -base64 32

# Generate a JWT secret
openssl rand -base64 64
```

---

## Step 3: Build Frontend

```bash
cd web
npm install
npm run build
cd ..
```

The build output (`web/dist`) is copied into the Nginx container image.

---

## Step 4: Production Docker Compose Overview

The project includes `docker-compose.prod.yml` with production-optimized settings:

- `NODE_ENV=production` (rate limiting enabled)
- No database port (5432) exposed publicly
- Health checks for all services
- SSL certificate mounting (when HTTPS is configured)
- Restricted CORS origin

---

## Step 5: Start Stack and Run Migrations

### 5.1 (Optional) Cloudflare DDNS

If your server has a dynamic public IP, the `cloudflare-ddns` service keeps your Cloudflare DNS records up to date. Skip this if you have a static IP or do not use Cloudflare.

1. Copy and edit the config:
   ```bash
   cp cloudflare-ddns/config-example.json cloudflare-ddns/config.json
   ```
   Edit `cloudflare-ddns/config.json`:
   - Set `zone_id` to your Cloudflare Zone ID (also set `CF_DDNS_ZONE_ID` in `.env.prod`)
   - Adjust `subdomains`: `{ "name": "", "proxied": false }` for root domain, `{ "name": "app", "proxied": true }` for subdomains
   - `proxied: true` enables Cloudflare CDN/SSL; `false` for direct IP (e.g. SSH access)

2. Add to root `.env.prod` (uncomment the lines from Step 2.1):
   ```
   CF_DDNS_API_TOKEN=your_cloudflare_api_token_here
   CF_DDNS_ZONE_ID=your_cloudflare_zone_id_here
   ```
   Create an API token at [Cloudflare Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) with **Edit zone DNS** permission. Find your Zone ID in Cloudflare Dashboard → your zone → Overview → right rail.

3. The `cloudflare-ddns` container starts with the stack and updates DNS periodically.

   **To skip DDNS:** Comment out or remove the `cloudflare-ddns` service from `docker-compose.prod.yml`.

### 5.2 Create required directories

```bash
mkdir -p nginx/ssl
# nginx/nginx.prod.conf must exist (it's in the repo)
```

### 5.3 Build and start the stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### 5.4 Run database migrations

Migrations run automatically on container startup, but run this manually to verify or after schema changes:

```bash
docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy

# Verify migration status
docker exec smoke-station-delivery-backend-prod npx prisma migrate status
```

### 5.5 (Optional) Seed the database

For first deployment — creates admin user and default roles:

```bash
docker exec smoke-station-delivery-backend-prod npm run prisma:seed:prod
```

`ADMIN_PASSWORD` (and optionally `ADMIN_EMAIL`, `ADMIN_NAME`) must be set in `backend/.env`.

> **Warning:** Only seed in production when needed. The seed creates real credentials — ensure `ADMIN_PASSWORD` is strong and unique.

---

## Step 6: Verify Deployment

```bash
# Check all containers are running
docker compose -f docker-compose.prod.yml ps

# Check backend health
curl -s http://localhost/api/health
# Expected: {"status":"ok","checks":{"database":"ok"}}

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

Open `http://<server-ip>` in a browser. Test login and verify API endpoints.

---

## Step 7: Monitoring and Logging

See [MONITORING.md](./MONITORING.md) for the full observability guide, including uptime monitoring, metrics, alerting rules, and local test flows.

Quick log reference:
```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f db
```

---

## Step 8: SSL/HTTPS Setup (Recommended)

### 8.1 Install Certbot

```bash
sudo apt install certbot python3-certbot-nginx -y
```

### 8.2 Obtain SSL Certificate

```bash
# Stop nginx temporarily
docker compose -f docker-compose.prod.yml stop web

# Obtain certificate
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com

# Certificates will be at:
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

### 8.3 Copy Certificates to Project

```bash
mkdir -p nginx/ssl

sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/

sudo chmod 644 nginx/ssl/fullchain.pem
sudo chmod 600 nginx/ssl/privkey.pem
```

### 8.4 Update Nginx Configuration

Edit `nginx/nginx.prod.conf`:
1. Uncomment the HTTPS server block
2. Update `server_name` with your domain
3. Uncomment SSL certificate paths
4. Uncomment security headers

### 8.5 Restart Services

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 8.6 Auto-Renewal Setup

```bash
# Test renewal
sudo certbot renew --dry-run

# Add to crontab (runs twice daily)
sudo crontab -e
# Add: 0 0,12 * * * certbot renew --quiet
```

---

## Step 9: Firewall Configuration

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp   # SSH

sudo ufw enable
sudo ufw status
```

---

## Step 10: Database Backups

### Manual Backup

```bash
# Create backup
docker exec smoke-station-delivery-db-prod pg_dump -U $DB_USER $DB_NAME > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
cat backup_file.sql | docker exec -i smoke-station-delivery-db-prod psql -U $DB_USER $DB_NAME
```

### Automated Backups (Cron)

```bash
cat > /home/user/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/user/backups"
mkdir -p $BACKUP_DIR
docker exec smoke-station-delivery-db-prod pg_dump -U smoke_station_user smoke_station_prod > $BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql
# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.sql" -mtime +7 -delete
EOF

chmod +x /home/user/backup-db.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /home/user/backup-db.sh
```

---

## Step 11: Updating the Application

### 11.1 Update Code

```bash
git pull origin production

cd web
npm install
npm run build
cd ..
```

### 11.2 Rebuild and Restart Services

```bash
# All services
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Or a specific service
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build backend
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build web
```

### 11.3 Run Migrations (if schema changed)

```bash
docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy
```

---

## Security Checklist

- [ ] Strong database password set
- [ ] Strong JWT secret set
- [ ] CORS origin restricted to your domain
- [ ] Database port (5432) not exposed publicly
- [ ] SSL/HTTPS configured
- [ ] Firewall configured
- [ ] Rate limiting enabled (`NODE_ENV=production`)
- [ ] Sensitive env values not committed to git
- [ ] Regular database backups configured
- [ ] Logs monitored for suspicious activity
- [ ] Docker containers running as non-root (if possible)

---

## Production vs Development Differences

| Feature | Development | Production |
|---------|------------|------------|
| `NODE_ENV` | `development` | `production` |
| Rate Limiting | Disabled | Enabled |
| CORS | `*` (all origins) | Specific domain |
| Database Port | Exposed (5432) | Internal only |
| SSL/HTTPS | Not required | Recommended |
| Health Checks | Optional | Enabled |

---

## Troubleshooting

### Services Won't Start

```bash
docker compose -f docker-compose.prod.yml logs
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml restart
```

### Database Connection Issues

```bash
# Verify database is running
docker exec smoke-station-delivery-db-prod pg_isready

# Check DATABASE_URL inside backend container
docker exec smoke-station-delivery-backend-prod env | grep DATABASE_URL

# Confirm DB_USER, DB_PASSWORD, DB_NAME match between .env.prod and backend/.env
```

### Frontend Not Loading

```bash
# Verify frontend build exists
ls -la web/dist

# Check nginx logs
docker logs smoke-station-delivery-web-prod

# Verify nginx config
docker exec smoke-station-delivery-web-prod nginx -t
```

---

## Quick Reference Commands

```bash
# Start production services
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Stop services
docker compose -f docker-compose.prod.yml down

# View all logs
docker compose -f docker-compose.prod.yml logs -f

# Restart a specific service
docker compose -f docker-compose.prod.yml restart backend

# Run migrations
docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy

# Backup database
docker exec smoke-station-delivery-db-prod pg_dump -U $DB_USER $DB_NAME > backup.sql
```

---

## Related Docs

- [README.md](./README.md) — Developer setup and local Docker workflow
- [OPERATIONS_PIPELINE.md](./OPERATIONS_PIPELINE.md) — Cross-machine build → export → deploy pipeline
- [MONITORING.md](./MONITORING.md) — Observability, uptime monitoring, metrics, and alerting
