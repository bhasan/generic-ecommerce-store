# Docker Commands Reference

Quick reference for common Docker and Docker Compose commands for this project.

## Development Workflows

### Start Services
```bash
# Start all services (builds if needed)
docker compose up

# Start in background
docker compose up -d

# Start with rebuilt images
docker compose up --build

# Start with latest image pull
docker compose up --pull always
```

### Stop & Clean
```bash
# Stop all services (keep volumes)
docker compose stop

# Stop and remove containers (keep volumes)
docker compose down

# Stop and remove everything including volumes (DATA LOSS!)
docker compose down -v

# Stop specific service
docker compose stop backend
```

### View Status & Logs
```bash
# List all services and their status
docker compose ps

# View all logs
docker compose logs

# Follow logs in real-time
docker compose logs -f

# Show last 100 lines
docker compose logs --tail=100

# Follow specific service
docker compose logs -f backend

# Show logs with timestamps
docker compose logs -t
```

### Build

```bash
# Build all services
docker compose build

# Build with no cache
docker compose build --no-cache

# Build specific service
docker compose build backend

# Build and pull base images
docker compose build --pull

# Build with build arguments
docker compose build --build-arg NODE_ENV=production
```

### Execute Commands

```bash
# Open shell in running container
docker compose exec backend sh

# Run command in container
docker compose exec backend npm run prisma:seed

# Run without attaching (non-interactive)
docker compose exec -T backend npm run build

# Run command in database
docker compose exec db psql -U backend_user -d generic-ecommerce-store-db

# View environment variables in container
docker compose exec backend env | grep DATABASE_URL
```

### Restart & Rebuild

```bash
# Restart service
docker compose restart backend

# Recreate containers (stop, remove, run)
docker compose up -d --force-recreate

# Recreate specific service
docker compose up -d --force-recreate backend

# Rebuild and restart
docker compose up -d --build backend
```

## Production with docker-compose.prod.yml

### Basic Commands
```bash
# Build production images
docker compose -f docker-compose.prod.yml build

# Start production stack
docker compose -f docker-compose.prod.yml up -d

# Use with env file
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Stop production
docker compose -f docker-compose.prod.yml down
```

### With Environment File
```bash
# Everything with .env.prod
docker compose -f docker-compose.prod.yml \
  --env-file .env.prod \
  build

docker compose -f docker-compose.prod.yml \
  --env-file .env.prod \
  up -d

# Check status
docker compose -f docker-compose.prod.yml ps
```

## Hot Reload Development

### Using Docker Compose Dev File
```bash
# Start with hot reload setup
docker compose -f docker-compose.dev.yml up

# Follow backend logs
docker compose -f docker-compose.dev.yml logs -f backend

# Access Vite dev server at http://localhost:5843
```

### Using Docker Compose Watch (Alternative)
```bash
# Watch for file changes and rebuild (Docker 4.19+)
docker compose watch

# With specific service
docker compose watch backend
```

## Database Operations

### Access Database
```bash
# Connect with psql
docker compose exec db psql -U backend_user -d generic-ecommerce-store-db

# List databases
docker compose exec -T db psql -U backend_user -l

# Dump database
docker compose exec -T db pg_dump -U backend_user generic-ecommerce-store-db > backup.sql

# Restore database
docker compose exec -T db psql -U backend_user generic-ecommerce-store-db < backup.sql
```

### Prisma Commands
```bash
# Run migrations
docker compose exec backend npx prisma migrate deploy

# Create new migration
docker compose exec backend npx prisma migrate dev --name add_field

# Seed database
docker compose exec backend npm run prisma:seed

# Open Prisma Studio (UI for database)
docker compose exec backend npm run prisma:studio
# Access at http://localhost:5555

# Generate Prisma client
docker compose exec backend npx prisma generate
```

## Image Management

### View Images
```bash
# List all images
docker images

# List project images
docker images | grep generic-ecommerce-store

# View image details
docker inspect generic-ecommerce-store-delivery/backend:latest

# View image size
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep generic-ecommerce-store

# View image layers
docker history generic-ecommerce-store-delivery/backend:latest
```

### Tag & Push Images
```bash
# Tag for registry
docker tag generic-ecommerce-store-delivery/backend:latest myregistry.com/backend:1.0.0

# Push to registry
docker push myregistry.com/backend:1.0.0

# Login to registry
docker login myregistry.com

# View login credentials location
cat ~/.docker/config.json
```

## System & Cleanup

### Disk Space & Monitoring
```bash
# Show disk usage
docker system df

# Monitor running containers (live)
docker stats

# Monitor containers (snapshot)
docker stats --no-stream

# View container resource limits
docker inspect generic-ecommerce-store-delivery-backend | grep -A 10 "Memory"
```

### Cleanup (Careful!)
```bash
# Remove unused images
docker image prune

# Remove unused containers
docker container prune

# Remove unused volumes
docker volume prune

# Remove unused networks
docker network prune

# Full cleanup (remove all unused)
docker system prune -a

# Full cleanup with volumes (DATA LOSS!)
docker system prune -a --volumes

# Remove specific image
docker rmi generic-ecommerce-store-delivery/backend:old-version

# Remove dangling images
docker image prune -a --filter "dangling=true"

# Remove images older than 7 days
docker image prune -a --filter "until=168h"
```

## Debugging

### Container Inspection
```bash
# View container details
docker inspect generic-ecommerce-store-delivery-backend

# View container events
docker events --filter container=generic-ecommerce-store-delivery-backend

# View container resource usage
docker stats generic-ecommerce-store-delivery-backend

# View network connections
docker network inspect sshtx_network
```

### Troubleshooting
```bash
# Check health status
docker compose ps

# Detailed health check
docker inspect --format='{{json .State.Health}}' generic-ecommerce-store-delivery-backend

# View startup logs (from container start)
docker logs generic-ecommerce-store-delivery-backend

# Follow logs with timestamps
docker logs -t --tail=50 generic-ecommerce-store-delivery-backend

# View logs since specific time
docker logs --since 2024-01-15T10:00:00 generic-ecommerce-store-delivery-backend

# Exec into container for debugging
docker compose exec backend sh
# Then run: env, ps, curl, ping, etc.
```

### Network Debugging
```bash
# List networks
docker network ls

# Inspect network
docker network inspect sshtx_network

# Test connectivity between containers
docker compose exec backend ping db

# Test DNS resolution
docker compose exec backend nslookup db

# Check open ports
docker compose exec backend netstat -tlnp
# or
docker compose exec backend lsof -i -P -n
```

## Multi-Compose Files

### Run Multiple Files
```bash
# Combine multiple compose files
docker compose -f docker-compose.yml -f docker-compose.override.yml up

# Production with overrides
docker compose -f docker-compose.prod.yml -f overrides.yml up

# Check final config
docker compose -f docker-compose.yml -f docker-compose.prod.yml config
```

## Useful Shortcuts

```bash
# Alias for faster development
alias dc="docker compose"
alias dcl="docker compose logs -f"
alias dce="docker compose exec"
alias dcps="docker compose ps"

# Then use:
dc up -d
dcl backend
dce backend sh
dcps
```

## Environment Variables

### Set Variables
```bash
# From file
docker compose --env-file .env up

# From environment
DB_USER=myuser docker compose up

# Multiple env files
docker compose --env-file .env --env-file .env.local up
```

### View Variables in Container
```bash
# View all
docker compose exec backend env

# View specific
docker compose exec backend env | grep DATABASE_URL

# Check in running container
docker exec generic-ecommerce-store-delivery-backend env
```

## Advanced

### Scale Services
```bash
# Note: Not recommended for stateful services like db
docker compose up --scale backend=3
```

### Compose Override
```bash
# Create docker-compose.override.yml for local changes
# It's automatically merged with docker-compose.yml
cat > docker-compose.override.yml <<EOF
services:
  backend:
    environment:
      DEBUG: "true"
EOF
```

### View Final Configuration
```bash
# See merged configuration
docker compose config

# Save to file
docker compose config > docker-compose.resolved.yml
```

---

For more details, see:
- DOCKER_SETUP.md - Complete setup guide
- DEPLOYMENT_CHECKLIST.md - Pre-deployment checklist
- docker-compose.yml - Development configuration
- docker-compose.prod.yml - Production configuration
