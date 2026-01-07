# Production Deployment Guide

This guide covers deploying the Smoke Station application to a production environment.

## Prerequisites

- **Server**: Linux server (Ubuntu 20.04+ recommended) with Docker and Docker Compose installed
- **Domain**: Domain name pointing to your server's IP address (optional but recommended)
- **SSL Certificate**: For HTTPS (Let's Encrypt recommended)
- **Firewall**: Configured to allow ports 80 (HTTP) and 443 (HTTPS)

---

## Step 1: Server Setup

### 1.1 Install Docker and Docker Compose

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

### 1.2 Clone Repository

```bash
# Clone your repository
git clone <your-repo-url> smoke-station-delivery
cd smoke-station-delivery

# Checkout production branch (if applicable)
git checkout production  # or main/master
```

---

## Step 2: Environment Configuration

### 2.1 Create Production Environment File

Create a `.env.prod` file in the project root:

```bash
# Database Configuration
DB_USER=smoke_station_user
DB_PASSWORD=<GENERATE_STRONG_PASSWORD>
DB_NAME=smoke_station_prod

# JWT Configuration
JWT_SECRET=<GENERATE_STRONG_SECRET_KEY>
JWT_EXPIRES_IN=24h

# CORS Configuration
CORS_ORIGIN=https://your-domain.com

# Port Configuration
HTTP_PORT=80
HTTPS_PORT=443

# Rate Limiting
AUTH_RATE_LIMIT_MAX=20
```

**Important**: 
- Generate strong passwords using: `openssl rand -base64 32`
- `.env.prod` can be committed to version control (not in `.gitignore`)
- Use strong, unique passwords even if file is tracked

### 2.2 Generate Secure Credentials

```bash
# Generate database password
openssl rand -base64 32

# Generate JWT secret
openssl rand -base64 64
```

---

## Step 3: Build Frontend

Build the React frontend before deploying:

```bash
cd web
npm install
npm run build
cd ..
```

**Note**: The build output (`web/dist`) will be copied into the Nginx container.

---

## Step 4: Configure Docker Compose for Production

### 4.1 Use Production Docker Compose File

The project includes `docker-compose.prod.yml` with production-optimized settings:

- No database port exposure (security)
- Health checks for all services
- Production environment variables
- SSL certificate mounting (if using HTTPS)

### 4.2 Review Production Configuration

Key differences from development:
- `NODE_ENV=production` (rate limiting enabled)
- Strong database credentials from environment variables
- Restricted CORS origin
- Health checks enabled
- No port 5432 exposure (database only accessible internally)

---

## Step 5: Database Setup

### 5.1 Start Services

```bash
# Start services using production compose file
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### 5.2 Run Database Migrations

```bash
# Run migrations
docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy

# Verify migrations
docker exec smoke-station-delivery-backend-prod npx prisma migrate status
```

### 5.3 (Optional) Seed Database

```bash
# Only if you need initial data
docker exec smoke-station-delivery-backend-prod npm run prisma:seed
```

**Warning**: Only seed in production if you need test data. Remove seed data before going live.

---

## Step 6: SSL/HTTPS Setup (Recommended)

### 6.1 Install Certbot

```bash
sudo apt install certbot python3-certbot-nginx -y
```

### 6.2 Obtain SSL Certificate

```bash
# Stop nginx temporarily
docker-compose -f docker-compose.prod.yml stop web

# Obtain certificate
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com

# Certificates will be in:
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

### 6.3 Copy Certificates to Project

```bash
# Create SSL directory
mkdir -p nginx/ssl

# Copy certificates (adjust paths as needed)
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/

# Set permissions
sudo chmod 644 nginx/ssl/fullchain.pem
sudo chmod 600 nginx/ssl/privkey.pem
```

### 6.4 Update Nginx Configuration

Edit `nginx/nginx.prod.conf`:
1. Uncomment HTTPS server block
2. Update `server_name` with your domain
3. Uncomment SSL certificate paths
4. Uncomment security headers

### 6.5 Restart Services

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 6.6 Auto-Renewal Setup

```bash
# Test renewal
sudo certbot renew --dry-run

# Add to crontab (runs twice daily)
sudo crontab -e
# Add: 0 0,12 * * * certbot renew --quiet
```

---

## Step 7: Firewall Configuration

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow SSH (if needed)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

---

## Step 8: Verify Deployment

### 8.1 Check Service Status

```bash
# Check all containers are running
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f

# Check backend health
curl http://localhost/api/health
```

### 8.2 Test Application

1. Visit `http://your-server-ip` or `https://your-domain.com`
2. Test login functionality
3. Verify API endpoints are working
4. Check that rate limiting is active (try multiple login attempts)

---

## Step 9: Database Backups

### 9.1 Manual Backup

```bash
# Create backup
docker exec smoke-station-delivery-db-prod pg_dump -U $DB_USER $DB_NAME > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
cat backup_file.sql | docker exec -i smoke-station-delivery-db-prod psql -U $DB_USER $DB_NAME
```

### 9.2 Automated Backups (Cron)

```bash
# Create backup script
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

## Step 10: Monitoring and Logging

### 10.1 View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f web
docker-compose -f docker-compose.prod.yml logs -f db
```

### 10.2 Monitor Resource Usage

```bash
# Container stats
docker stats

# Disk usage
docker system df
```

### 10.3 Set Up Log Rotation

Docker handles log rotation, but you can configure limits in `docker-compose.prod.yml`:

```yaml
services:
  backend:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

---

## Step 11: Updating the Application

### 11.1 Update Code

```bash
# Pull latest changes
git pull origin production

# Rebuild frontend
cd web
npm install
npm run build
cd ..
```

### 11.2 Update Services

```bash
# Rebuild and restart all services
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Or update specific service
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d --build backend
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d --build web
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
- [ ] Rate limiting enabled (NODE_ENV=production)
- [ ] Environment variables not committed to git
- [ ] Regular database backups configured
- [ ] Logs monitored for suspicious activity
- [ ] Docker containers running as non-root (if possible)

---

## Troubleshooting

### Services Won't Start

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs

# Check container status
docker-compose -f docker-compose.prod.yml ps

# Restart services
docker-compose -f docker-compose.prod.yml restart
```

### Database Connection Issues

```bash
# Verify database is running
docker exec smoke-station-delivery-db-prod pg_isready

# Check database logs
docker logs smoke-station-delivery-db-prod

# Verify DATABASE_URL in backend container
docker exec smoke-station-delivery-backend-prod env | grep DATABASE_URL
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

## Production vs Development Differences

| Feature | Development | Production |
|---------|------------|------------|
| NODE_ENV | development | production |
| Rate Limiting | Disabled | Enabled |
| CORS | * (all origins) | Specific domain |
| Database Port | Exposed (5432) | Internal only |
| SSL/HTTPS | Not required | Recommended |
| Health Checks | Optional | Enabled |
| Logging | Verbose | Optimized |

---

## Quick Reference Commands

```bash
# Start production services
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Stop services
docker-compose -f docker-compose.prod.yml down

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Restart specific service
docker-compose -f docker-compose.prod.yml restart backend

# Run migrations
docker exec smoke-station-delivery-backend-prod npx prisma migrate deploy

# Backup database
docker exec smoke-station-delivery-db-prod pg_dump -U $DB_USER $DB_NAME > backup.sql
```

---

## Support

For issues or questions, refer to:
- README.md for general setup
- Backend logs: `docker logs smoke-station-delivery-backend-prod`
- Frontend logs: `docker logs smoke-station-delivery-web-prod`
- Database logs: `docker logs smoke-station-delivery-db-prod`

