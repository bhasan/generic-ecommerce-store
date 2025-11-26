# 🚀 Quick Start Guide

Get your Smoke Station backend up and running in 5 minutes!

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and update your database connection:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/smoke_station?schema=public"
JWT_SECRET="change-this-to-a-random-secure-string"
```

## Step 3: Setup Database

Generate Prisma Client:

```bash
npm run prisma:generate
```

Run migrations to create tables:

```bash
npm run prisma:migrate
```

When prompted for a migration name, enter: `init`

## Step 4: Seed Database (Optional but Recommended)

Add test users and products:

```bash
npm run prisma:seed
```

This creates:
- **Admin**: admin@test.com / admin123
- **Manager**: manager@test.com / manager123
- **Customer**: customer@test.com / customer123
- 5 sample products
- 2 sample orders

## Step 5: Start the Server

```bash
npm run dev
```

Server will start on http://localhost:3000

## 🧪 Test It!

### Health Check

```bash
curl http://localhost:3000/api/health
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "admin123"
  }'
```

Copy the `token` from the response and use it to access protected routes!

### Get Products

```bash
curl http://localhost:3000/api/products
```

### Get Orders (requires token)

```bash
curl http://localhost:3000/api/orders \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## 🎉 You're Ready!

Your backend is now running with:
- ✅ Authentication & Authorization
- ✅ Role-based access control
- ✅ Complete CRUD operations
- ✅ Type-safe TypeScript code
- ✅ Production-ready security

## 📚 Next Steps

1. Read the full [README.md](./README.md) for detailed API documentation
2. Open [Prisma Studio](http://localhost:5555) to view/edit data: `npm run prisma:studio`
3. Connect your frontend application
4. Customize the seed data in `prisma/seed.ts`

## 🆘 Need Help?

Common issues and solutions are in the main README.md file.

---

**Happy Coding! 🚀**
