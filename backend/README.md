# Smoke Station Backend API

Complete TypeScript backend with authentication, authorization, and role-based access control for the Smoke Station e-commerce platform.

## Documentation Status

This README contains older sections that were written before the current approval flow, multi-role model, and some route behavior changed.

Use these files as the authoritative source of truth before making changes:

- `src/routes/*.ts`
- `src/services/*.ts`
- `prisma/schema.prisma`
- `MAKE_OUTBOUND_NOTIFICATION_FLOW.md`
- `../CODEBASE_WORKING_DOCUMENT.md`

Current auth behavior to keep in mind:

- Registration creates an unapproved user and does not issue a token by default
- Login requires approval
- User roles are represented as arrays in the active backend/frontend contract
- Product and category behavior should be verified against current route/service code, not older examples below

## 🚀 Features

- ✅ **TypeScript** - Full type safety
- ✅ **JWT Authentication** - Secure token-based auth
- ✅ **Role-Based Access Control** - GUEST, CUSTOMER, MANAGEMENT, ADMIN
- ✅ **Password Hashing** - bcrypt with salt rounds
- ✅ **Input Validation** - express-validator
- ✅ **Rate Limiting** - Protection against brute force
- ✅ **Security Headers** - Helmet middleware
- ✅ **Error Handling** - Centralized error management
- ✅ **Prisma ORM** - Type-safe database queries
- ✅ **PostgreSQL** - Production-ready database

## 📋 Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- npm or yarn

## 🛠️ Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment Variables

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/smoke_station?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_EXPIRES_IN="24h"
PORT=3000
NODE_ENV="development"
CORS_ORIGIN="*"
```

### 3. Setup Database

Generate Prisma Client:

```bash
npm run prisma:generate
```

Run database migrations:

```bash
npm run prisma:migrate
```

This will create all tables and relationships in your database.

### 4. (Optional) Seed Database

You can use Prisma Studio to add initial data:

```bash
npm run prisma:studio
```

Or create a seed script to add test users and products.

## 🏃 Running the Application

### Development Mode (with hot reload)

```bash
npm run dev
```

### Production Mode

Build TypeScript:

```bash
npm run build
```

Start production server:

```bash
npm start
```

### Production with Docker

```bash
npm run start:prod
```

## 📚 API Documentation

### Base URL

```
http://localhost:3000/api
```

### Health Check

**GET** `/api/health`

```bash
curl http://localhost:3000/api/health
```

---

## 🔐 Authentication Endpoints

### 1. Register User

**POST** `/api/auth/register`

**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "role": "CUSTOMER"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "role": "CUSTOMER",
    "createdAt": "2024-11-19T00:00:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 2. Login

**POST** `/api/auth/login`

**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "role": "CUSTOMER",
    "createdAt": "2024-11-19T00:00:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 3. Get Profile

**GET** `/api/auth/profile`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "John Doe",
  "role": "CUSTOMER",
  "createdAt": "2024-11-19T00:00:00.000Z",
  "updatedAt": "2024-11-19T00:00:00.000Z"
}
```

### 4. Logout

**POST** `/api/auth/logout`

---

## 🛍️ Product Endpoints

### 1. Get All Products

**GET** `/api/products`

**Access:** Public (hidden products filtered for non-admin)

**Response:**
```json
[
  {
    "id": 1,
    "name": "Product Name",
    "category": "Electronics",
    "price": 99.99,
    "description": "Product description",
    "image": "https://example.com/image.jpg",
    "images": ["url1", "url2"],
    "stock": 100,
    "stockEnabled": true,
    "hidden": false,
    "reviews": [],
    "createdAt": "2024-11-19T00:00:00.000Z"
  }
]
```

### 2. Get Product by ID

**GET** `/api/products/:id`

**Access:** Public

### 3. Create Product

**POST** `/api/products`

**Access:** Management/Admin only

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "name": "New Product",
  "category": "Electronics",
  "price": 99.99,
  "description": "Product description",
  "image": "https://example.com/image.jpg",
  "images": ["url1", "url2"],
  "stock": 100,
  "stockEnabled": true,
  "hidden": false
}
```

### 4. Update Product

**PUT** `/api/products/:id`

**Access:** Management/Admin only

### 5. Delete Product

**DELETE** `/api/products/:id`

**Access:** Admin only

---

## 📦 Order Endpoints

### 1. Get All Orders

**GET** `/api/orders`

**Access:** Private
- Customers see only their orders
- Management/Admin see all orders

**Headers:**
```
Authorization: Bearer <token>
```

### 2. Get Order by ID

**GET** `/api/orders/:id`

**Access:** Private

### 3. Create Order (Checkout)

**POST** `/api/orders`

**Access:** Private (Customer+)

**Body:**
```json
{
  "items": [
    {
      "productId": 1,
      "quantity": 2
    },
    {
      "productId": 2,
      "quantity": 1
    }
  ]
}
```

### 4. Update Order Status

**PATCH** `/api/orders/:id/status`

**Access:** Management/Admin only

**Body:**
```json
{
  "status": "APPROVED"
}
```

**Valid Statuses:**
- `PENDING`
- `APPROVED`
- `NOT_FULFILLING`
- `READY_FOR_DELIVERY`
- `OUT_FOR_DELIVERY`
- `DELIVERED`

### 5. Add Item to Order

**POST** `/api/orders/:id/items`

**Access:** Management/Admin only

**Body:**
```json
{
  "productId": 3,
  "quantity": 1
}
```

### 6. Void Order Item

**PATCH** `/api/orders/:id/items/:itemId/void`

**Access:** Management/Admin only

### 7. Delete Order Item

**DELETE** `/api/orders/:id/items/:itemId`

**Access:** Management/Admin only

### 8. Delete Order

**DELETE** `/api/orders/:id`

**Access:** Admin only

---

## 👥 User Roles & Permissions

### GUEST
- Browse products (public endpoints)
- Cannot checkout or view orders

### CUSTOMER
- All GUEST permissions
- Create orders (checkout)
- View own orders only
- Cannot modify orders

### MANAGEMENT
- All CUSTOMER permissions
- View all orders
- Change order status
- Add items to orders
- Void/delete order items
- Create/update products
- Cannot delete orders or products

### ADMIN
- All MANAGEMENT permissions
- Delete orders
- Delete products
- Full system access

---

## 🧪 Testing with cURL

### Register a new user

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User",
    "role": "CUSTOMER"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Save the token from the response and use it in subsequent requests:

```bash
TOKEN="your-token-here"
```

### Get products

```bash
curl http://localhost:3000/api/products
```

### Create an order

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "items": [
      {
        "productId": 1,
        "quantity": 2
      }
    ]
  }'
```

---

## 📁 Project Structure

```
backend/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── config/
│   │   └── database.ts        # Prisma client singleton
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── order.controller.ts
│   │   └── product.controller.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts   # JWT authentication
│   │   ├── role.middleware.ts   # Role-based authorization
│   │   └── error.middleware.ts  # Error handling
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── order.routes.ts
│   │   └── product.routes.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── order.service.ts
│   │   └── product.service.ts
│   ├── types/
│   │   └── express.d.ts       # TypeScript type extensions
│   ├── utils/
│   │   ├── jwt.util.ts        # JWT helpers
│   │   └── password.util.ts   # Password hashing
│   └── index.ts               # Application entry point
├── .env                       # Environment variables
├── .env.example              # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔒 Security Features

1. **Password Hashing** - bcrypt with 10 salt rounds
2. **JWT Tokens** - Secure authentication with expiration
3. **Rate Limiting** - Prevents brute force attacks
4. **Helmet** - Security headers
5. **CORS** - Configurable cross-origin resource sharing
6. **Input Validation** - express-validator on all endpoints
7. **Error Handling** - Sanitized error messages in production

---

## 🐳 Docker Support

The existing `Dockerfile` should work with the TypeScript setup. To build:

```bash
docker build -t smoke-station-backend .
docker run -p 3000:3000 --env-file .env smoke-station-backend
```

---

## 📝 Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | - | Yes |
| `JWT_SECRET` | Secret key for JWT signing | - | Yes |
| `JWT_EXPIRES_IN` | Token expiration time | `24h` | No |
| `PORT` | Server port | `3000` | No |
| `NODE_ENV` | Environment mode | `development` | No |
| `CORS_ORIGIN` | Allowed CORS origins | `*` | No |
| `REQUEST_TIMEOUT_MS` | Request timeout (ms) | `30000` | No |
| `GOOGLE_GEOCODING_API_KEY` | Google Geocoding API key for delivery radius checks | - | No |

If `GOOGLE_GEOCODING_API_KEY` is missing or expires, delivery eligibility intentionally falls back to the offline ZIP allowlist when that admin setting is enabled.

---

## 🚨 Common Issues

### Prisma Client Not Generated

```bash
npm run prisma:generate
```

### Database Connection Error

Check your `DATABASE_URL` in `.env` and ensure PostgreSQL is running.

### Port Already in Use

Change the `PORT` variable in `.env` or kill the process using port 3000:

```bash
# Find process
lsof -ti:3000

# Kill process
kill -9 <PID>
```

---

## 🧯 Failure Modes & Recovery

### Database unavailable
- Symptom: `/api/health` returns `status: degraded` and `checks.database = error`
- Action: Verify PostgreSQL is running, then check `DATABASE_URL` and run migrations if needed

### Request timeouts
- Symptom: API returns `REQUEST_TIMEOUT` errors
- Action: Identify slow queries/endpoints, then tune `REQUEST_TIMEOUT_MS` if appropriate

### Unexpected errors
- Symptom: 500 errors in API responses
- Action: Use the `requestId` from the response to search logs and trace the failing request

### High error rates after deploy
- Symptom: Spike in 4xx/5xx responses
- Action: Roll back the latest deploy and check recent migrations or config changes

---

## 📖 Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [JWT Documentation](https://jwt.io/)

---

## 📄 License

ISC

---

## 🤝 Contributing

This is a learning project. Feel free to fork and experiment!

---

**Built with ❤️ using TypeScript, Express, Prisma, and PostgreSQL**
