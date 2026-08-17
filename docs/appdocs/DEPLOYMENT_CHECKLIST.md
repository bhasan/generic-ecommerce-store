# Pre-Deployment Checklist

## Files Verified ✓

- [x] backend/Dockerfile - Multi-stage, Alpine, non-root user
- [x] nginx/Dockerfile - Multi-stage build, Nginx Alpine
- [x] docker-compose.yml - Development stack with health checks
- [x] docker-compose.dev.yml - Hot reload setup with Vite
- [x] docker-compose.prod.yml - Production deployment
- [x] .dockerignore - Root level exclusions
- [x] backend/.dockerignore - Backend specific
- [x] web/.dockerignore - Frontend specific
- [x] .env.example - Configuration template
- [x] DOCKER_SETUP.md - Comprehensive guide
- [x] docker-quickstart.sh - Linux/Mac automation
- [x] docker-quickstart.bat - Windows automation

## Development Setup

### First Time
```bash
cp .env.example .env
docker compose build --no-cache
docker compose up
```

### Verify
- [ ] Backend responds: `curl http://localhost:3000/api/health`
- [ ] Frontend loads: `open http://localhost`
- [ ] Database connected: Check backend logs for migrations
- [ ] Services healthy: `docker compose ps` shows "healthy" status

### Hot Reload (Optional)
```bash
docker compose -f docker-compose.dev.yml up
# Access Vite dev server at http://localhost:5843
```

## Production Checklist

### Pre-Deployment
- [ ] Copy `.env.example` to `.env.prod`
- [ ] Set strong `DB_PASSWORD` (32+ characters)
- [ ] Generate strong `JWT_SECRET` (32+ characters, random)
- [ ] Set `CORS_ORIGIN` to your domain
- [ ] Configure `AUTH_RATE_LIMIT_MAX` (recommend 20-50 for production)
- [ ] Set `HTTP_PORT` and `HTTPS_PORT` as needed
- [ ] Place SSL certificates in `nginx/ssl/` if using HTTPS

### Build & Deploy
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### Verification
- [ ] Database is healthy: `docker compose -f docker-compose.prod.yml logs db`
- [ ] Backend started migrations: Check logs for "Prisma migrate" output
- [ ] Frontend serves: `curl http://localhost/`
- [ ] API accessible: `curl http://localhost/api/health`
- [ ] All services healthy: `docker compose -f docker-compose.prod.yml ps`

### Post-Deployment
- [ ] Backup existing data before updates
- [ ] Monitor logs for errors: `docker compose logs -f`
- [ ] Test health endpoints
- [ ] Configure log rotation if needed
- [ ] Set up monitoring/alerting for containers
- [ ] Document any custom configurations

## Image Management

### Build Images
```bash
# Development
docker compose build

# Production with versioning
docker compose -f docker-compose.prod.yml build
docker tag generic-ecommerce-store-delivery/backend:latest generic-ecommerce-store-delivery/backend:v1.0.0
docker tag generic-ecommerce-store-delivery/web:latest generic-ecommerce-store-delivery/web:v1.0.0
```

### Push to Registry (Optional)
```bash
docker login your-registry
docker tag generic-ecommerce-store-delivery/backend:latest your-registry/backend:latest
docker push your-registry/backend:latest
docker tag generic-ecommerce-store-delivery/web:latest your-registry/web:latest
docker push your-registry/web:latest
```

### Cleanup
```bash
# Remove unused images
docker image prune -a --filter "until=168h"

# Clean volumes (data loss!)
docker compose down -v

# Full cleanup
docker system prune -a --volumes
```

## Common Issues & Solutions

### Build Timeout
- Increase timeout in CI/CD pipeline to 10+ minutes
- For local builds, run with `--no-cache` less frequently
- Check network connectivity

### Port Already in Use
```bash
# Change port in docker-compose.yml or use -p flag:
docker compose up -d -p "8000:3000"
```

### Database Connection Failed
- Verify DATABASE_URL in .env file
- Check db service is healthy: `docker compose logs db`
- Ensure password matches between DB_PASSWORD and DATABASE_URL
- Wait longer for database to initialize (cold start can take 30s)

### Out of Disk Space
```bash
docker system df
docker system prune -a
docker volume prune
```

### Logs Not Showing
```bash
docker compose logs -f backend
docker compose logs -f --tail=100
```

## Monitoring

### Health Checks
All services include health checks that can be used with orchestrators:

```bash
docker inspect --format='{{json .State.Health}}' generic-ecommerce-store-delivery-backend
docker inspect --format='{{json .State.Health}}' generic-ecommerce-store-delivery-web
docker inspect --format='{{json .State.Health}}' generic-ecommerce-store-delivery-db
```

### Resource Monitoring
```bash
docker stats --no-stream
docker stats  # Live updates
```

## Documentation References

- **DOCKER_SETUP.md** - Full setup guide with examples
- **DOCKER_SUMMARY.md** - Quick overview of created files
- **docker-compose.yml** - Development configuration
- **docker-compose.prod.yml** - Production configuration
- **.env.example** - All available environment variables

## Support Commands

```bash
# View everything
docker compose ps
docker compose logs
docker compose config

# Stop all
docker compose down

# Rebuild specific service
docker compose build backend --no-cache

# Execute command in container
docker compose exec backend npm run prisma:seed

# Access container shell
docker compose exec backend sh

# View image details
docker inspect generic-ecommerce-store-delivery/backend:latest

# Check image size
docker images | grep generic-ecommerce-store
```

---

**Status**: Ready for development and production deployment

**Last Updated**: Generated with Docker best practices

**Next**: Follow DOCKER_SETUP.md for detailed instructions
