# Smoke Station

E-commerce platform with React frontend, Express backend, PostgreSQL database, and Nginx reverse proxy.

## Current Status

This repository is a full-stack application.

- Frontend runtime code lives in `web/`
- Backend API code lives in `backend/`
- Nginx config lives in `nginx/`
- The most up-to-date inspected inventory is in `CODEBASE_WORKING_DOCUMENT.md`

Some older markdown files and examples in the repo were written before the backend and role model evolved. When in doubt, use the route files, service files, Prisma schema, and `CODEBASE_WORKING_DOCUMENT.md` as the current source of truth.

> **📘 Production Deployment**: See [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) for complete production deployment instructions.

## Prerequisites

- **Node.js** v18+ (v24.11.1 recommended)
- **Docker** v28.5.2+ (for containerized deployment)
- **npm** or **yarn**

---

## Quick Start (Docker)

Deploy all components with Docker Compose in 2 commands:

```bash
# 1. Build the frontend
cd web
npm install
npm run build
cd ..

# 2. Start all services (database, backend, nginx)
docker-compose up --build -d
```

Access the application at: **http://localhost:80**

Command to update only backend Docker container:

`docker compose up --build --force-recreate -d backend`

```bash
# 1. Build web using npm install && npm run build
# 2. Migrate if any schema changes

cd backend
npx prisma migrate dev --name add_user_rejected_field
# Apply the migration to docker
docker exec smoke-station-delivery-backend npx prisma migrate deploy
cd ..

# Build specific directories otherwise use docker-compose up --build
# Below is same as running docker-compose build web && docker-compose up -d web
docker-compose up --build -d web
```

### What Gets Started

- PostgreSQL database (port 5432)
- Express backend API (internal, port 3000)
- Nginx web server (port 80) serving React app

### Docker Services

| Service | Container Name | Port | Description |
|---------|---------------|------|-------------|
| Database | `smoke-station-delivery-db` | 5432 | PostgreSQL database |
| Backend | `smoke-station-delivery-backend` | 3000 (internal) | Express API server |
| Web | `smoke-station-delivery-web-proxy` | 80 | Nginx reverse proxy + React app |

### Docker Commands

```bash
# Start services
docker-compose up

# Start in background
docker-compose up -d

# Rebuild and start
docker-compose up --build

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Stop and remove volumes (clears database)
docker-compose down -v
```

---

## First Time Setup

After starting Docker containers, set up the database:

### 1. Run Database Migrations

```bash
# Run migrations inside the backend container
docker exec smoke-station-delivery-backend npm run prisma:migrate
```

When prompted for a migration name, enter: `init`

### 2. (Optional) Seed Database

Add test users and products:

```bash
# Seed the database
docker exec smoke-station-delivery-backend npm run prisma:seed
```

This creates:
- **Admin**: `admin@test.com` / `admin123`
- **Manager**: `manager@test.com` / `manager123`
- **Customer**: `customer@test.com` / `customer123`
- 5 sample products
- 2 sample orders

### 3. Access Database with Prisma Studio

View and edit database records through Prisma Studio:

```bash
# Navigate to backend directory (on your host machine)
cd backend

# Install dependencies if not already installed
npm install

# Set DATABASE_URL to point to Docker database
export DATABASE_URL="postgresql://backend_user:bfe4af37d97cd02d@localhost:5432/smoke-station-delivery-db?schema=public"

# Start Prisma Studio
npm run prisma:studio
```

Access Prisma Studio at: **http://localhost:5555**

**Note**: The backend container already generates Prisma client during build, so `prisma:generate` is not needed when running commands inside the container.

---

## Database Migrations

Database migrations manage schema changes (adding tables, columns, modifying structure) in a version-controlled way.

### Local Development Workflow

When you modify the Prisma schema (`backend/prisma/schema.prisma`), create a migration:

```bash
cd backend

# 1. Create and apply migration
npm run prisma:migrate
# Or: npx prisma migrate dev --name your_migration_name

# When prompted, enter a descriptive migration name:
# Example: "add_user_roles_table" or "remove_product_relations"
```

This command:
- Creates a migration file in `prisma/migrations/`
- Applies the migration to your local database
- Regenerates the Prisma client automatically

**Example:**
```bash
cd backend
npx prisma migrate dev --name remove_relations_and_rename_product
```

### Reviewing Migrations

Before committing, review the generated SQL:

```bash
# View the latest migration SQL
cat backend/prisma/migrations/*/migration.sql

# Or list all migrations
ls -la backend/prisma/migrations/
```

### Production Migration Workflow

Migrations are **automatically applied** when the Docker container starts:

1. **During Docker Build**: `npx prisma generate` runs (generates Prisma client)
2. **At Container Startup**: `npx prisma migrate deploy` runs (applies pending migrations)

#### Production Deployment Steps

```bash
# 1. Create migration locally (as shown above)
cd backend
npx prisma migrate dev --name your_migration_name

# 2. Commit migration files to Git
git add backend/prisma/migrations/
git commit -m "Add migration: your_migration_name"
git push

# 3. Deploy to production (rebuild Docker)
docker-compose up --build
```

The container will automatically:
- Generate Prisma client with updated schema
- Apply any pending migrations on startup
- Start the application

#### Manual Production Migration (if needed)

If you need to run migrations manually in production:

```bash
# Run migrations inside the backend container
docker exec smoke-station-delivery-backend npx prisma migrate deploy

# Check migration status
docker exec smoke-station-delivery-backend npx prisma migrate status
```

### Migration Best Practices

1. **Always test migrations locally first**
   - Create and test migrations in development
   - Verify the migration SQL is correct
   - Test with sample data

2. **Use descriptive migration names**
   ```bash
   # Good
   npx prisma migrate dev --name add_user_roles_table
   npx prisma migrate dev --name remove_product_relations
   
   # Avoid
   npx prisma migrate dev --name migration1
   ```

3. **Review migration SQL before deploying**
   - Check `prisma/migrations/XXXXX_name/migration.sql`
   - Ensure it's safe for production data
   - Verify no data loss will occur

4. **Backup production database before major migrations**
   ```bash
   # If you have direct database access
   pg_dump -h your-db-host -U user -d database > backup.sql
   ```

5. **Commit migration files to version control**
   - Migration files in `prisma/migrations/` should be committed
   - Never edit migration files after they've been applied
   - Create new migrations for schema changes

### Migration Commands Reference

| Command | Use Case | Description |
|---------|----------|-------------|
| `prisma migrate dev` | Development | Creates migration + applies it + regenerates client |
| `prisma migrate deploy` | Production | Only applies existing migrations (doesn't create new ones) |
| `prisma migrate status` | Any | Shows which migrations are applied/pending |
| `prisma generate` | After schema changes | Regenerates Prisma client (auto-run in Docker build) |

### Troubleshooting Migrations

**Migration fails in production:**
```bash
# Check migration status
docker exec smoke-station-delivery-backend npx prisma migrate status

# View backend logs
docker-compose logs backend

# If needed, manually resolve and re-run
docker exec smoke-station-delivery-backend npx prisma migrate deploy
```

**Prisma client out of sync:**
```bash
# Regenerate Prisma client
cd backend
npm run prisma:generate

# Or in Docker
docker exec smoke-station-delivery-backend npx prisma generate
```

**Reset database (development only):**
```bash
# WARNING: This deletes all data!
cd backend
npx prisma migrate reset
```

---

## Deploying Changes to Docker

After making code changes, rebuild and redeploy the Docker containers:

### Deploy All Changes

```bash
# Stop running containers
docker-compose down

# Rebuild and start all services
docker-compose up --build
```

### Deploy Backend Changes Only

From project root directory

```bash
# Rebuild only the backend service
docker-compose build backend

# Restart the backend container
docker-compose up -d backend
```

### Deploy Frontend Changes Only

```bash
# 1. Rebuild the frontend
cd web
npm install
npm run build
cd ..

# 2. Rebuild the web container
docker-compose build web

# 3. Restart the web container
docker-compose up -d web
```

### Deploy Database Changes (Migrations)

**Note**: Migrations run automatically on container startup via `prisma migrate deploy`. If you've created new migrations locally:

```bash
# 1. Commit migration files to Git
git add backend/prisma/migrations/
git commit -m "Add migration: migration_name"

# 2. Rebuild and restart backend (migrations apply automatically)
docker-compose up --build backend

# Or manually apply migrations if needed
docker exec smoke-station-delivery-backend npx prisma migrate deploy
```

See the [Database Migrations](#database-migrations) section for detailed workflow.

### Quick Restart (No Rebuild)

If you only changed environment variables or config files:

```bash
# Restart specific service
docker-compose restart backend

# Or restart all services
docker-compose restart
```

### View Deployment Logs

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend
docker-compose logs -f web
```

---

## Local Development Setup

For local development without Docker, set up each component separately.

### Prerequisites

- **PostgreSQL** 14+ (running locally or via Docker)
- **Node.js** v18+

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
DATABASE_URL="postgresql://backend_user:bfe4af37d97cd02d@localhost:5432/smoke-station-delivery-db?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_EXPIRES_IN="24h"
PORT=3000
NODE_ENV="development"
CORS_ORIGIN="*"
EOF

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# (Optional) Seed database with test data
npm run prisma:seed

# Start development server
npm run dev
```

Backend runs on: **http://localhost:3000**

### 2. Frontend Setup

```bash
cd web

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend runs on: **http://localhost:5173** (Vite default)

The frontend is configured to proxy `/api` requests to `http://localhost:3000` (see `vite.config.js`).

### 3. Database Setup (Local PostgreSQL)

If running PostgreSQL locally instead of Docker:

```bash
# Create database
createdb smoke-station-delivery-db

# Or using psql
psql -U postgres -c "CREATE DATABASE \"smoke-station-delivery-db\";"
```

Update `DATABASE_URL` in `backend/.env` accordingly.

### 4. Standalone Nginx Setup

To run Nginx separately (without Docker):

```bash
# 1. Build the frontend
cd web
npm install
npm run build
cd ..

# 2. Configure Nginx
# Copy nginx/nginx.conf to your Nginx config directory and update paths:
# - /usr/share/nginx/html → /path/to/web/dist
# - backend:3000 → localhost:3000 (if backend runs locally)

# 3. Start Nginx
nginx -t        # Test configuration
nginx           # Start Nginx
# Or: nginx -s reload  # If already running
```

---

## Environment Variables

### Backend (.env)

```env
DATABASE_URL="postgresql://user:password@host:5432/database"
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="24h"
PORT=3000
NODE_ENV="development"
CORS_ORIGIN="*"
# Rate limiting (optional)
AUTH_RATE_LIMIT_MAX=20  # Max auth requests per 15 minutes (default: 20)
DISABLE_RATE_LIMIT=false  # Set to "true" to disable rate limiting in development
REQUEST_TIMEOUT_MS=30000  # Request timeout in ms
```

### Frontend (optional)

Create `web/.env` for custom API URL:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_API_TIMEOUT_MS=15000
VITE_API_RETRY_MAX=2
VITE_API_RETRY_BASE_DELAY_MS=300
```

---

## Test Accounts

After seeding the database (`npm run prisma:seed` in backend):

- **Admin**: `admin@test.com` / `admin123`
- **Manager**: `manager@test.com` / `manager123`
- **Customer**: `customer@test.com` / `customer123`

---

## Development Workflow

1. **Start database** (Docker or local PostgreSQL)
2. **Start backend**: `cd backend && npm run dev`
3. **Start frontend**: `cd web && npm run dev`
4. **Access**: http://localhost:5173

For production deployment, use Docker Compose as shown in Quick Start.

---

## Troubleshooting

### Backend won't start
- Check PostgreSQL is running
- Verify `DATABASE_URL` in `.env`
- Run `npm run prisma:generate`

### Frontend can't connect to backend
- Ensure backend is running on port 3000
- Check Vite proxy configuration in `vite.config.js`
- Verify CORS settings in backend

### Docker issues
- Ensure Docker is running
- Check ports 80 and 5432 are not in use
- Try `docker-compose down -v` to reset volumes

---

## Failure Modes & Recovery

### Database unavailable
- Symptom: `/api/health` reports `status: degraded`
- Action: Ensure PostgreSQL is healthy, verify `DATABASE_URL`, and re-run migrations if needed

### API timeouts
- Symptom: Clients see `REQUEST_TIMEOUT` errors
- Action: Check backend logs for slow endpoints and tune `REQUEST_TIMEOUT_MS`

### Frontend network errors
- Symptom: Users see “Network error” or repeated retries
- Action: Verify API availability and confirm `VITE_API_BASE_URL` is correct

### Post-deploy instability
- Symptom: Spike in 4xx/5xx after deploy
- Action: Roll back the deploy and review recent migrations/config changes

---

## Project Structure

```
smoke-station-delivery/
├── backend/          # Express API (TypeScript)
├── web/              # React frontend (Vite)
├── nginx/            # Nginx configuration
└── docker-compose.yml # Docker services configuration
```
