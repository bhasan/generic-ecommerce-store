# Smoke Station Delivery

E-commerce platform with React frontend, Express backend, PostgreSQL database, and Nginx reverse proxy.

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
docker-compose up --build
```

Access the application at: **http://localhost:80**

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

```bash
# Run new migrations inside the backend container
docker exec smoke-station-delivery-backend npm run prisma:migrate

# Or if migrations should run automatically on startup
docker-compose restart backend
```

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
```

### Frontend (optional)

Create `web/.env` for custom API URL:

```env
VITE_API_BASE_URL=http://localhost:3000
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

## Project Structure

```
smoke-station-delivery/
├── backend/          # Express API (TypeScript)
├── web/              # React frontend (Vite)
├── nginx/            # Nginx configuration
└── docker-compose.yml # Docker services configuration
```
