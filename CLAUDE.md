# CLAUDE.md - AI Assistant Guide for Smoke Station Delivery

This document provides AI assistants with comprehensive guidance on the codebase structure, development workflows, and conventions for the Smoke Station Delivery e-commerce application.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture & Tech Stack](#architecture--tech-stack)
3. [Directory Structure](#directory-structure)
4. [Development Workflows](#development-workflows)
5. [Code Conventions](#code-conventions)
6. [Database Schema](#database-schema)
7. [API Endpoints](#api-endpoints)
8. [Frontend Patterns](#frontend-patterns)
9. [Deployment](#deployment)
10. [Common Tasks](#common-tasks)
11. [Known Issues & TODOs](#known-issues--todos)

---

## Project Overview

**Smoke Station Delivery** is a full-stack e-commerce web application for managing product catalogs, shopping carts, orders, and customer interactions. It features role-based access control (Guest, Customer, Management, Admin) and includes a comprehensive product review system.

**Key Features:**
- Product catalog with categories and multi-image support
- Shopping cart with quantity management
- Order tracking with status updates
- User authentication with role-based access
- Product review system with ratings, replies, and moderation
- Admin dashboard for managing flagged reviews
- Stock tracking with visibility controls

---

## Architecture & Tech Stack

### Backend
- **Runtime:** Node.js v24.11.1
- **Framework:** Express.js v4.21.2
- **ORM:** Prisma v6.19.0
- **Database:** PostgreSQL 16 (Alpine)
- **Module System:** CommonJS (require/module.exports)
- **Key Dependencies:** CORS, dotenv

### Frontend
- **Framework:** React v19.2.0
- **Build Tool:** Vite v7.2.2
- **Routing:** React Router DOM v7.9.6
- **Icons:** Lucide React v0.553.0
- **Styling:** Custom CSS with CSS Variables (NO Tailwind/Bootstrap)
- **Module System:** ESM (import/export)
- **State Management:** React Context API (no Redux)

### DevOps
- **Containerization:** Docker v28.5.2
- **Orchestration:** Docker Compose v3
- **Reverse Proxy:** Nginx 1.25-alpine
- **Development:** Nodemon v3.1.11

---

## Directory Structure

```
/home/user/smoke-station-delivery/
├── backend/                    # Express.js backend
│   ├── prisma/
│   │   └── schema.prisma      # Database schema
│   ├── generated/             # Prisma client (auto-generated)
│   ├── index.js               # Main server entry point
│   ├── package.json
│   ├── Dockerfile
│   └── prisma.config.ts
│
├── web/                       # React frontend
│   ├── public/               # Static assets
│   ├── src/
│   │   ├── assets/          # Images and static files
│   │   ├── components/
│   │   │   ├── common/     # Shared UI components
│   │   │   ├── layout/     # Layout components (Navbar, etc.)
│   │   │   └── product/    # Product-specific components
│   │   ├── context/
│   │   │   └── AppContext.jsx  # Global state management
│   │   ├── data/
│   │   │   └── mockData.js     # Initial data (products, users, orders)
│   │   ├── features/           # Feature-based components
│   │   │   ├── auth/          # LoginPage
│   │   │   ├── cart/          # CartPage
│   │   │   ├── dashboard/     # DashboardPage (admin)
│   │   │   ├── orders/        # OrdersPage
│   │   │   ├── products/      # ProductsPage, ManageProductsPage
│   │   │   └── profile/       # ProfilePage
│   │   ├── styles/            # Global CSS
│   │   ├── App.jsx            # Main app with routing
│   │   └── main.jsx           # Entry point
│   ├── index.html
│   ├── vite.config.js
│   ├── eslint.config.js
│   └── package.json
│
├── nginx/
│   ├── nginx.conf            # Reverse proxy configuration
│   └── Dockerfile            # Serves built React app
│
├── docker-compose.yml        # Container orchestration
├── README.md                 # Setup instructions
└── CLAUDE.md                 # This file
```

---

## Development Workflows

### Local Development (Recommended)

**Frontend Development:**
```bash
cd web
npm install
npm run dev    # Runs on http://localhost:5173
```

**Backend Development:**
```bash
cd backend
npm install
npx prisma generate
npm run dev    # Runs on http://localhost:3000
```

### Production Build & Deployment

```bash
# Build frontend
cd web
npm run build

# Start all services with Docker
cd ..
docker-compose up --build
```

Access at: `http://localhost:80`

### Docker Services

The application runs 3 Docker services:

1. **db** - PostgreSQL database on internal network
2. **backend** - Express API on port 3000 (internal)
3. **web** - Nginx serving React + proxying API (port 80, external)

---

## Code Conventions

### Backend Conventions

**File Location:** `/home/user/smoke-station-delivery/backend/index.js`

1. **Module System:** Use CommonJS (require/module.exports)
2. **Database Access:** Always use Prisma Client from `../generated/prisma`
3. **Error Handling:** Wrap async operations in try-catch, return 500 on errors
4. **Port Configuration:** Use `process.env.PORT || 3000`
5. **Middleware Order:** CORS → JSON parser → Routes
6. **API Routes:** Prefix all routes with `/api/`

**Example Route:**
```javascript
app.get('/api/products', async (req, res) => {
  try {
    const products = await prisma.product.findMany();
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});
```

### Frontend Conventions

**File Location:** `/home/user/smoke-station-delivery/web/src/`

1. **Module System:** Use ESM (import/export)
2. **Component Structure:** One component per file, named export
3. **Styling:** Each component has its own CSS file (e.g., `ProductsPage.css`)
4. **State Management:** Use `useContext(AppContext)` for global state
5. **Routing:** Define routes in `App.jsx`, use `<ProtectedRoute>` for auth
6. **API Calls:** Use `fetch('/api/endpoint')` (Vite proxy handles dev mode)
7. **CSS Variables:** Use defined color scheme from `base.css`

**Color Palette (CSS Variables):**
```css
--primary: #7c3aed;      /* Purple */
--secondary: #10b981;    /* Green */
--background: #0f1419;   /* Dark */
--text-primary: rgba(255, 255, 255, 0.9);
```

**Component Example:**
```jsx
import { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import './ComponentName.css';

export default function ComponentName() {
  const { globalState, globalAction } = useContext(AppContext);

  return (
    <div className="component-name">
      {/* Component content */}
    </div>
  );
}
```

### Styling Guidelines

**IMPORTANT:** This project uses **custom CSS with CSS Variables**. Do NOT:
- Add Tailwind CSS
- Add Bootstrap
- Add styled-components
- Add CSS-in-JS libraries

**DO:**
- Create component-scoped CSS files
- Use existing CSS variables from `base.css`
- Follow the existing dark theme color scheme
- Maintain responsive design patterns from `responsive.css`

---

## Database Schema

**File Location:** `/home/user/smoke-station-delivery/backend/prisma/schema.prisma`

### Current Models

```prisma
model Product {
  id          Int      @id @default(autoincrement())
  name        String
  description String?
  price       Float
  createdAt   DateTime @default(now())
}
```

### Database Configuration

- **Host:** `db` (Docker service)
- **Port:** 5432
- **Database:** `smoke-station-delivery-db`
- **User:** `backend_user`
- **Password:** `bfe4af37d97cd02d` (⚠️ hardcoded in docker-compose)

### Working with Prisma

**Generate Client:**
```bash
cd backend
npx prisma generate
```

**Create Migration:**
```bash
npx prisma migrate dev --name migration_name
```

**Apply Migrations (Production):**
```bash
npx prisma migrate deploy
```

**Note:** The backend Dockerfile runs `prisma migrate deploy` on startup.

---

## API Endpoints

**Base URL:** `http://localhost:80/api` (production) or `http://localhost:3000/api` (dev)

### Available Endpoints

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| GET | `/api/health` | Health check | None | `{ status: 'ok', message: '...' }` |
| GET | `/api/products` | Fetch all products | None | `Product[]` |
| POST | `/api/products` | Create product | `{ name, price, description? }` | `Product` |

### Adding New Endpoints

1. Add route in `/home/user/smoke-station-delivery/backend/index.js`
2. Use Prisma Client for database operations
3. Wrap in try-catch with proper error responses
4. Return appropriate HTTP status codes

**Example:**
```javascript
app.post('/api/products', async (req, res) => {
  try {
    const { name, price, description } = req.body;
    const product = await prisma.product.create({
      data: { name, price, description }
    });
    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});
```

---

## Frontend Patterns

### State Management

**File Location:** `/home/user/smoke-station-delivery/web/src/context/AppContext.jsx`

The application uses React Context API for global state. The context provides:

**State:**
- `currentUser` - Logged-in user object
- `products` - Product catalog array
- `cart` - Shopping cart items
- `orders` - User/all orders
- `notifications` - Toast notifications array
- `reviews` - Product reviews

**Actions:**
- `login(email, password)` - Authenticate user
- `logout()` - Clear session
- `addToCart(product, quantity)` - Add item to cart
- `updateCartItem(productId, quantity)` - Update cart
- `removeFromCart(productId)` - Remove from cart
- `placeOrder(orderDetails)` - Create order
- `addNotification(message, type)` - Show toast
- And more...

### Routing Structure

**File Location:** `/home/user/smoke-station-delivery/web/src/App.jsx`

```jsx
/ → /products (redirect)
/login → LoginPage (public)
/products → ProductsPage (public)
/cart → CartPage (public)
/profile → ProfilePage (protected: CUSTOMER+)
/orders → OrdersPage (protected: CUSTOMER+)
/manage-products → ManageProductsPage (protected: MANAGEMENT+)
/dashboard → DashboardPage (protected: MANAGEMENT+)
```

### Role-Based Access Control

**Roles Hierarchy:** `GUEST < CUSTOMER < MANAGEMENT < ADMIN`

**Access Levels:**
- **Guest:** Can browse products and cart (no login)
- **Customer:** Browse, cart, own orders, profile
- **Management:** All customer features + manage products, view all orders
- **Admin:** Full access including delete operations

**Protected Route Example:**
```jsx
<Route
  path="/orders"
  element={
    <ProtectedRoute allowedRoles={['CUSTOMER', 'MANAGEMENT', 'ADMIN']}>
      <OrdersPage />
    </ProtectedRoute>
  }
/>
```

### Mock Users

**File Location:** `/home/user/smoke-station-delivery/web/src/data/mockData.js`

```javascript
{ email: 'customer@test.com', password: 'password', role: 'CUSTOMER' }
{ email: 'manager@test.com', password: 'password', role: 'MANAGEMENT' }
{ email: 'admin@test.com', password: 'password', role: 'ADMIN' }
```

⚠️ **Note:** Authentication is currently mock-based. No backend validation.

---

## Deployment

### Docker Compose Architecture

**File Location:** `/home/user/smoke-station-delivery/docker-compose.yml`

**Network:** `sshtx_network` (internal bridge)

**Services:**

1. **db (PostgreSQL)**
   - Image: `postgres:16-alpine`
   - Volume: `postgres_data` (persistent)
   - No exposed ports (internal only)

2. **backend (Express)**
   - Build: `./backend`
   - Depends on: `db`
   - Runs migrations on startup
   - Internal port: 3000

3. **web (Nginx)**
   - Build: `./nginx/Dockerfile`
   - Depends on: `backend`
   - Exposed port: `80:80`
   - Serves: Pre-built React app from `./web/dist`
   - Proxies: `/api/*` → `backend:3000`

### Nginx Configuration

**File Location:** `/home/user/smoke-station-delivery/nginx/nginx.conf`

**Key Rules:**
- Serves static files from `/usr/share/nginx/html`
- Proxies `/api/` to `http://backend:3000/api/`
- Fallback to `index.html` for SPA routing

### Deployment Checklist

Before deploying:

1. ✅ Build frontend: `cd web && npm run build`
2. ✅ Ensure `.env` files are configured (if added)
3. ✅ Run `docker-compose up --build`
4. ✅ Verify health: `curl http://localhost:80/api/health`
5. ✅ Check database connection in logs

---

## Common Tasks

### Adding a New Feature

1. **Backend:**
   - Update Prisma schema if database changes needed
   - Run `npx prisma migrate dev --name feature_name`
   - Add API routes in `backend/index.js`
   - Test with curl or Postman

2. **Frontend:**
   - Create component in appropriate `features/` subdirectory
   - Add corresponding CSS file
   - Update `AppContext.jsx` if global state needed
   - Add route in `App.jsx` if new page
   - Update `Navbar.jsx` if navigation item needed

### Adding a Database Model

1. Edit `/home/user/smoke-station-delivery/backend/prisma/schema.prisma`
2. Run migration:
   ```bash
   cd backend
   npx prisma migrate dev --name add_model_name
   npx prisma generate
   ```
3. Restart backend server
4. Update TypeScript types if needed

### Styling a Component

1. Create `ComponentName.css` next to component file
2. Import in component: `import './ComponentName.css'`
3. Use existing CSS variables from `base.css`:
   ```css
   .component-name {
     background-color: var(--card-bg);
     color: var(--text-primary);
   }
   ```
4. Follow dark theme palette (purple primary, green secondary)

### Adding an API Endpoint

**Location:** `/home/user/smoke-station-delivery/backend/index.js`

```javascript
app.METHOD('/api/resource', async (req, res) => {
  try {
    // Use Prisma: const result = await prisma.model.operation();
    res.json(result);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to ...' });
  }
});
```

### Running Tests

⚠️ **Tests are not currently configured.**

To add testing:
1. Install testing library (Jest, Vitest)
2. Create `__tests__/` directories
3. Add test scripts to `package.json`

---

## Known Issues & TODOs

### Security Concerns

⚠️ **HIGH PRIORITY:**
- [ ] Database credentials hardcoded in `docker-compose.yml`
- [ ] Mock authentication - no real backend validation
- [ ] No JWT or session management
- [ ] CORS enabled for all origins
- [ ] No input validation or sanitization
- [ ] No rate limiting

**Recommendations:**
- Move credentials to `.env` files
- Implement JWT-based authentication
- Add input validation (Joi, Zod)
- Configure CORS for specific origins
- Add rate limiting middleware

### Missing Infrastructure

- [ ] No test suite (Jest/Vitest)
- [ ] No CI/CD pipelines
- [ ] No logging system (consider Winston/Pino)
- [ ] No environment variables for frontend
- [ ] No database migrations committed
- [ ] No API documentation (consider Swagger)
- [ ] No error tracking (consider Sentry)

### Enhancements

- [ ] Add TypeScript for type safety
- [ ] Implement real authentication backend
- [ ] Add image upload to cloud storage (S3, Cloudinary)
- [ ] Implement email notifications
- [ ] Add payment gateway integration
- [ ] Implement search functionality
- [ ] Add pagination for large datasets
- [ ] Optimize bundle size (code splitting)

### Code Quality

- [ ] Add ESLint to backend
- [ ] Add Prettier for consistent formatting
- [ ] Add pre-commit hooks (Husky)
- [ ] Document API with JSDoc comments
- [ ] Add PropTypes or TypeScript for components

---

## Development Guidelines for AI Assistants

### When Making Changes

1. **Always read existing code first** before making modifications
2. **Follow existing patterns** - Don't introduce new libraries without discussion
3. **Maintain consistency** - Use CommonJS in backend, ESM in frontend
4. **Update both frontend and backend** if adding features that require API changes
5. **Test locally** before committing (run dev servers or Docker)
6. **Do NOT add Tailwind/Bootstrap** - use existing CSS variable system

### File References Format

When referencing code locations, use: `file_path:line_number`

Example: "The product creation endpoint is in `/home/user/smoke-station-delivery/backend/index.js:45`"

### Testing Changes

**Quick Local Test:**
```bash
# Frontend only
cd web && npm run dev

# Backend only
cd backend && npm run dev

# Full stack
cd web && npm run build && cd .. && docker-compose up --build
```

### Git Workflow

**Current Branch:** `claude/claude-md-mi3refvrqbg1s695-011MrgtiRmN72s2HTeHNDhP2`

**When committing:**
1. Stage relevant files only
2. Write descriptive commit messages
3. Push to the designated branch
4. Use `git push -u origin <branch-name>` for first push

---

## Quick Reference

### Important Files

| File | Purpose |
|------|---------|
| `backend/index.js` | Express server and API routes |
| `backend/prisma/schema.prisma` | Database schema |
| `web/src/App.jsx` | React router and route definitions |
| `web/src/context/AppContext.jsx` | Global state management |
| `web/src/data/mockData.js` | Initial data (users, products, orders) |
| `docker-compose.yml` | Container orchestration |
| `nginx/nginx.conf` | Reverse proxy configuration |

### Port Reference

| Service | Port | Access |
|---------|------|--------|
| PostgreSQL | 5432 | Internal only |
| Backend API | 3000 | Internal (proxied via Nginx) |
| Frontend (dev) | 5173 | `http://localhost:5173` |
| Nginx (prod) | 80 | `http://localhost:80` |

### Useful Commands

```bash
# Development
npm run dev              # Start dev server (frontend or backend)
npm run build           # Build production frontend
npm run lint            # Run ESLint (frontend)

# Prisma
npx prisma generate     # Generate Prisma client
npx prisma migrate dev  # Create and apply migration
npx prisma studio       # Open database GUI

# Docker
docker-compose up --build        # Build and start all services
docker-compose down              # Stop all services
docker-compose logs backend      # View backend logs
docker-compose restart backend   # Restart backend only
```

---

## Support

For questions or issues:
- Check existing code patterns first
- Review this document
- Examine similar implemented features
- Test changes locally before deployment

**Last Updated:** 2025-11-17
**Document Version:** 1.0.0
