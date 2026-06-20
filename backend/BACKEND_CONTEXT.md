> Needs verification / Historical context: This document contains older backend architecture and API notes. Current source of truth is `src/routes/*.ts`, `src/services/*.ts`, `prisma/schema.prisma`, and `../docs/PROJECT_DESIGN.md`.

# Smoke Station Backend - Context Documentation

## Overview

The Smoke Station Backend is a TypeScript-based REST API for an e-commerce platform specializing in smoke shop products. It provides authentication, authorization, product management, order processing, and review functionality with a sophisticated multi-role access control system.

**Purpose**: Handle all backend operations for the Smoke Station e-commerce platform including user management, product catalog, order processing, and customer reviews.

## Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.3+ (strict mode enabled)
- **Framework**: Express.js 4.21+
- **Database**: PostgreSQL 14+
- **ORM**: Prisma 6.19+ (type-safe database client)
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcrypt (10 salt rounds)
- **Validation**: express-validator
- **Security**: Helmet (HTTP headers), CORS, rate limiting
- **Development**: ts-node-dev (hot reload)

## Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma          # Database schema definition
│   ├── seed.ts                # Database seeding script
│   └── migrations/            # Database migration history
├── src/
│   ├── config/
│   │   └── database.ts        # Prisma client singleton
│   ├── constants/
│   │   └── roles.ts           # Role name constants and helpers
│   ├── controllers/           # Request handlers (thin layer)
│   │   ├── auth.controller.ts
│   │   ├── order.controller.ts
│   │   └── product.controller.ts
│   ├── middleware/            # Express middleware
│   │   ├── auth.middleware.ts      # JWT authentication
│   │   ├── role.middleware.ts      # Role-based authorization
│   │   └── error.middleware.ts     # Error handling
│   ├── routes/                # Route definitions
│   │   ├── auth.routes.ts
│   │   ├── order.routes.ts
│   │   └── product.routes.ts
│   ├── services/              # Business logic layer
│   │   ├── auth.service.ts
│   │   ├── order.service.ts
│   │   └── product.service.ts
│   ├── types/
│   │   └── express.d.ts       # TypeScript type extensions
│   ├── utils/                 # Utility functions
│   │   ├── jwt.util.ts        # JWT token generation/verification
│   │   └── password.util.ts  # Password hashing/comparison
│   └── index.ts               # Application entry point
├── generated/
│   └── prisma/                # Generated Prisma client
├── dist/                      # Compiled JavaScript (production)
└── package.json
```

## Architecture Patterns

### Layered Architecture
1. **Routes Layer** (`routes/`): Define endpoints and validation rules
2. **Middleware Layer** (`middleware/`): Authentication, authorization, error handling
3. **Controllers Layer** (`controllers/`): Thin request/response handlers
4. **Services Layer** (`services/`): Business logic and database operations
5. **Utils Layer** (`utils/`): Reusable utility functions

### Service Pattern
Business logic is encapsulated in service classes. Controllers are thin and delegate to services.

### Middleware Chain
Request flow: `Route → Validation → Auth Middleware → Role Middleware → Controller → Service → Database`

## Database Schema

### Core Models

#### User
- **Purpose**: Store user account information
- **Fields**: `id`, `email` (unique), `password` (bcrypt hashed), `name`, `createdAt`, `updatedAt`
- **Relations**: 
  - Many-to-many with `Role` via `UserRole` join table
  - One-to-many with `Order`, `Review`, `CartItem`

#### Role
- **Purpose**: Define available roles in the system
- **Fields**: `id`, `name` (unique: GUEST, CUSTOMER, MANAGEMENT, ADMIN), `createdAt`, `updatedAt`
- **Relations**: Many-to-many with `User` via `UserRole`

#### UserRole (Join Table)
- **Purpose**: Link users to their roles (many-to-many relationship)
- **Fields**: `id`, `userId`, `roleId`, `createdAt`
- **Unique Constraint**: `[userId, roleId]` (prevents duplicate role assignments)
- **Cascade**: Deletes when user or role is deleted

#### Product
- **Purpose**: Store product catalog information
- **Fields**: 
  - `id`, `name`, `category`, `price`, `description` (optional)
  - `image` (primary image URL), `images` (array of image URLs)
  - `stock`, `stockEnabled` (boolean), `hidden` (boolean)
  - `createdAt`, `updatedAt`
- **Relations**: One-to-many with `OrderItem`, `Review`, `CartItem`
- **Business Rules**:
  - Hidden products are only visible to MANAGEMENT and ADMIN roles
  - Stock is decremented when orders are created (if `stockEnabled` is true)

#### Order
- **Purpose**: Store customer orders
- **Fields**: `id`, `userId`, `status` (enum), `total` (calculated), `createdAt`, `updatedAt`
- **Status Enum**: `PENDING`, `APPROVED`, `NOT_FULFILLING`, `READY_FOR_DELIVERY`, `OUT_FOR_DELIVERY`, `DELIVERED`
- **Relations**: 
  - Many-to-one with `User`
  - One-to-many with `OrderItem`
- **Business Rules**:
  - Customers can only view their own orders
  - MANAGEMENT and ADMIN can view all orders
  - Total is calculated from order items

#### OrderItem
- **Purpose**: Store individual items within an order
- **Fields**: 
  - `id`, `orderId`, `productId`, `quantity`, `price` (snapshot at order time)
  - `voided` (boolean), `addedAfterSubmission` (boolean), `createdAt`
- **Relations**: Many-to-one with `Order` and `Product`
- **Business Rules**:
  - Price is stored at order time (price changes don't affect existing orders)
  - Items can be voided (excluded from total calculation)
  - Items can be added after order submission (by MANAGEMENT/ADMIN)

#### Review
- **Purpose**: Store product reviews and ratings
- **Fields**: 
  - `id`, `userId`, `productId`, `rating` (1-5), `comment`
  - `helpful`, `notHelpful` (counts)
  - `votedByHelpful` (array of user IDs), `votedByNotHelpful` (array of user IDs)
  - `flagged` (boolean), `createdAt`, `updatedAt`
- **Relations**: Many-to-one with `User` and `Product`

#### CartItem
- **Purpose**: Store shopping cart items (per user)
- **Fields**: `id`, `userId`, `productId`, `quantity`, `createdAt`
- **Relations**: Many-to-one with `User` and `Product`
- **Unique Constraint**: `[userId, productId]` (one cart item per product per user)

## Authentication & Authorization

### Authentication System

**Method**: JWT (JSON Web Tokens)

**Flow**:
1. User registers/logs in via `/api/auth/register` or `/api/auth/login`
2. Backend validates credentials and generates JWT token
3. Token contains: `userId`, `email`, `roles` (array of role names)
4. Client includes token in `Authorization: Bearer <token>` header
5. `authenticate` middleware verifies token and attaches user to `req.user`

**Token Payload Structure**:
```typescript
{
  userId: number;
  email: string;
  roles: RoleName[];  // Array of role names: ['CUSTOMER', 'ADMIN'], etc.
}
```

**Password Security**:
- Passwords hashed with bcrypt (10 salt rounds)
- Never stored or returned in plain text
- Comparison done server-side only

### Authorization System

**Multi-Role System**: Users can have multiple roles simultaneously (many-to-many relationship)

**Available Roles**:
- `GUEST`: Unauthenticated users (no database record, implicit)
- `CUSTOMER`: Authenticated customers (can place orders, view own orders)
- `MANAGEMENT`: Staff members (can manage products, orders, view all orders)
- `ADMIN`: Administrators (full system access, can delete orders/products)

**Role Hierarchy** (for authorization checks):
- ADMIN > MANAGEMENT > CUSTOMER > GUEST

**Authorization Middleware**:
- `authorize(...roles)`: Checks if user has ANY of the specified roles
- `authorizeCustomer`: Requires CUSTOMER, MANAGEMENT, or ADMIN
- `authorizeManagement`: Requires MANAGEMENT or ADMIN
- `authorizeAdmin`: Requires ADMIN only

**Authorization Logic**:
- Uses `hasAnyRole()` helper function to check if user's roles array contains any of the required roles
- Returns 403 if user lacks required permissions
- Returns 401 if user is not authenticated

## API Endpoints

### Base URL
All endpoints are prefixed with `/api`

### Authentication Endpoints (`/api/auth`)

#### POST `/api/auth/register`
- **Access**: Public
- **Purpose**: Register a new user account
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe",
    "role": "CUSTOMER",        // Optional, single role (legacy support)
    "roles": ["CUSTOMER"]      // Optional, array of roles
  }
  ```
- **Response**: `{ user: {...}, token: "..." }`
- **Validation**: Email format, password min 6 chars, name required

#### POST `/api/auth/login`
- **Access**: Public
- **Purpose**: Authenticate user and receive JWT token
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```
- **Response**: `{ user: {...}, token: "..." }`
- **Rate Limited**: 5 requests per 15 minutes per IP

#### GET `/api/auth/profile`
- **Access**: Private (authenticated)
- **Purpose**: Get current user's profile information
- **Headers**: `Authorization: Bearer <token>`
- **Response**: `{ id, email, name, roles: [...], createdAt, updatedAt }`

#### POST `/api/auth/logout`
- **Access**: Public
- **Purpose**: Logout (client-side token removal, no server-side session)
- **Response**: `{ message: "Logout successful" }`

### Product Endpoints (`/api/products`)

#### GET `/api/products`
- **Access**: Public (optional authentication)
- **Purpose**: Get all products
- **Behavior**:
  - Unauthenticated users: Only non-hidden products
  - Authenticated CUSTOMER: Only non-hidden products
  - MANAGEMENT/ADMIN: All products (including hidden)
- **Response**: Array of product objects with reviews

#### GET `/api/products/:id`
- **Access**: Public (optional authentication)
- **Purpose**: Get single product by ID
- **Behavior**: Same visibility rules as GET all products
- **Response**: Product object with reviews

#### POST `/api/products`
- **Access**: Private (MANAGEMENT or ADMIN)
- **Purpose**: Create a new product
- **Request Body**:
  ```json
  {
    "name": "Product Name",
    "category": "Category",
    "price": 99.99,
    "description": "Optional description",
    "image": "https://...",
    "images": ["url1", "url2"],
    "stock": 100,
    "stockEnabled": true,
    "hidden": false
  }
  ```

#### PUT `/api/products/:id`
- **Access**: Private (MANAGEMENT or ADMIN)
- **Purpose**: Update existing product
- **Request Body**: Same as POST, all fields optional

#### DELETE `/api/products/:id`
- **Access**: Private (ADMIN only)
- **Purpose**: Delete a product
- **Response**: `{ message: "Product deleted successfully" }`

### Order Endpoints (`/api/orders`)

#### GET `/api/orders`
- **Access**: Private (authenticated)
- **Purpose**: Get all orders
- **Behavior**:
  - CUSTOMER: Only their own orders
  - MANAGEMENT/ADMIN: All orders
- **Response**: Array of order objects with user, items, and products

#### GET `/api/orders/:id`
- **Access**: Private (authenticated)
- **Purpose**: Get single order by ID
- **Behavior**: Same access rules as GET all orders
- **Response**: Order object with user, items, and products

#### POST `/api/orders`
- **Access**: Private (authenticated, CUSTOMER+)
- **Purpose**: Create new order (checkout)
- **Request Body**:
  ```json
  {
    "items": [
      {
        "productId": 1,
        "quantity": 2
      }
    ]
  }
  ```
- **Business Logic**:
  - Validates products exist
  - Checks stock availability (if stockEnabled)
  - Calculates total from current product prices
  - Decrements stock on successful order creation
  - Creates order with PENDING status

#### PATCH `/api/orders/:id/status`
- **Access**: Private (MANAGEMENT or ADMIN)
- **Purpose**: Update order status
- **Request Body**:
  ```json
  {
    "status": "APPROVED"
  }
  ```
- **Valid Statuses**: PENDING, APPROVED, NOT_FULFILLING, READY_FOR_DELIVERY, OUT_FOR_DELIVERY, DELIVERED

#### POST `/api/orders/:id/items`
- **Access**: Private (MANAGEMENT or ADMIN)
- **Purpose**: Add item to existing order
- **Request Body**:
  ```json
  {
    "productId": 3,
    "quantity": 1
  }
  ```
- **Business Logic**: Recalculates order total, marks item as `addedAfterSubmission: true`

#### PATCH `/api/orders/:id/items/:itemId/void`
- **Access**: Private (MANAGEMENT or ADMIN)
- **Purpose**: Void an order item (exclude from total)
- **Business Logic**: Marks item as voided, recalculates order total

#### DELETE `/api/orders/:id/items/:itemId`
- **Access**: Private (MANAGEMENT or ADMIN)
- **Purpose**: Delete an order item
- **Business Logic**: Removes item, recalculates order total

#### DELETE `/api/orders/:id`
- **Access**: Private (ADMIN only)
- **Purpose**: Delete entire order
- **Response**: `{ message: "Order deleted successfully" }`

## Key Business Logic

### Order Creation Flow
1. Validate request (items array, product IDs, quantities)
2. Fetch all products from database
3. Validate products exist and quantities are available
4. Check stock availability (if `stockEnabled` is true)
5. Calculate total from current product prices
6. Create order with PENDING status
7. Create order items with price snapshots
8. Decrement product stock (if enabled)
9. Return order with full details

### Product Visibility Rules
- **Hidden Products**: Only visible to users with MANAGEMENT or ADMIN roles
- **Public Products**: Visible to all users (including unauthenticated)
- **Implementation**: Filtered in `ProductService.getAllProducts()` and `getProductById()`

### Order Access Control
- **CUSTOMER Role**: Can only view/modify their own orders
- **MANAGEMENT/ADMIN Roles**: Can view all orders, modify any order
- **Implementation**: Filtered in `OrderService.getAllOrders()` and `getOrderById()`

### Stock Management
- Stock is decremented when orders are created
- Stock check happens before order creation
- Stock can be disabled per product (`stockEnabled: false`)
- Stock is not incremented when orders are cancelled/deleted (business decision)

### Role Assignment
- Users can have multiple roles simultaneously
- Registration accepts either `role` (single, legacy) or `roles` (array)
- Default role if none specified: CUSTOMER
- Roles are validated against database Role table
- Invalid roles result in 400 error

## Security Features

### Rate Limiting
- **Auth Routes**: 5 requests per 15 minutes per IP (prevents brute force)
- **General Routes**: 100 requests per 15 minutes per IP

### Security Headers
- **Helmet**: Sets various HTTP security headers automatically
- **CORS**: Configurable via `CORS_ORIGIN` environment variable

### Input Validation
- All endpoints use `express-validator` for request validation
- Email format validation
- Password length requirements
- Type checking (integers, floats, arrays)
- Custom error messages

### Error Handling
- Centralized error handling via `errorHandler` middleware
- `AppError` class for operational errors with status codes
- Stack traces only in development mode
- Sanitized error messages in production

### Password Security
- bcrypt hashing with 10 salt rounds
- Passwords never returned in API responses
- Comparison done server-side only

## Development Patterns

### Type Safety
- Full TypeScript strict mode enabled
- Prisma provides type-safe database queries
- Custom types in `types/express.d.ts` extend Express Request
- Role names are type-safe via `RoleName` type

### Error Handling Pattern
```typescript
// In services
throw new AppError('Error message', 400);

// In controllers
try {
  // ... logic
} catch (error) {
  next(error);  // Passes to errorHandler middleware
}
```

### Service Pattern
Services contain business logic and database operations:
```typescript
export class AuthService {
  async register(data: RegisterData) {
    // Business logic here
    return result;
  }
}
```

### Middleware Pattern
Middleware functions are composable:
```typescript
router.post('/endpoint', 
  authenticate,           // Verify JWT
  authorizeManagement,    // Check role
  validateInput,          // Validate request
  controller.handler      // Handle request
);
```

### Database Access Pattern
- Prisma client singleton in `config/database.ts`
- All database operations go through Prisma
- Relations are included via `include` or `select`
- Transactions used for multi-step operations

## Environment Variables

Required environment variables (`.env` file):

```env
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="24h"
PORT=3000
NODE_ENV="development"
CORS_ORIGIN="*"
```

## Database Migrations

- Migrations stored in `prisma/migrations/`
- Created via `npm run prisma:migrate`
- Applied automatically in production via `npm run start:prod`
- Prisma client regenerated after schema changes

## Seeding

- Seed script: `prisma/seed.ts`
- Run via: `npm run prisma:seed`
- Creates:
  - Default roles (GUEST, CUSTOMER, MANAGEMENT, ADMIN)
  - Test users (admin, manager, customer) with passwords
  - Sample products
  - Sample reviews
  - Sample orders

## Common Tasks

### Adding a New Endpoint
1. Define route in appropriate `routes/*.routes.ts`
2. Add validation rules
3. Create controller method in `controllers/*.controller.ts`
4. Add service method in `services/*.service.ts`
5. Apply appropriate middleware (auth, role checks)

### Adding a New Role
1. Add role name to `constants/roles.ts` `ROLE_NAMES` array
2. Create role record in database (via seed or migration)
3. Update authorization middleware if needed
4. Update business logic that checks roles

### Modifying Database Schema
1. Update `prisma/schema.prisma`
2. Run `npm run prisma:migrate` (creates migration)
3. Prisma client auto-regenerates
4. Update TypeScript code to match new schema

## Important Notes for AI Assistants

1. **Multi-Role System**: Users have an array of roles, not a single role. Always check for `roles` array, not `role` property.

2. **JWT Payload**: Contains `roles: RoleName[]`, not `role: Role`. Update any code that accesses `req.user.role` to use `req.user.roles`.

3. **Authorization Checks**: Use `hasAnyRole(userRoles, requiredRoles)` helper function, not direct array includes.

4. **Product Visibility**: Hidden products are filtered based on user roles. Check `ProductService` for visibility logic.

5. **Order Access**: Customers can only see their own orders. Check `OrderService` for access control logic.

6. **Price Snapshot**: Order items store price at order time. Product price changes don't affect existing orders.

7. **Stock Management**: Stock is decremented on order creation, not incremented on cancellation.

8. **Error Handling**: Always use `AppError` class for operational errors, not generic `Error`.

9. **Type Safety**: Use Prisma-generated types. Import from `../generated/prisma` or use Prisma client types.

10. **Validation**: All endpoints use `express-validator`. Check route files for validation rules.

