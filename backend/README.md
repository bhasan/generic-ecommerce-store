# Generic Ecommerce Store Backend

This package contains the Express/TypeScript API for Generic Ecommerce Store.

Current source of truth:

- Routes: `src/routes/*.ts`
- Controllers: `src/controllers/*.ts`
- Services: `src/services/*.ts`
- Schema and migrations: `prisma/schema.prisma`, `prisma/migrations/`
- Project-level design reference: `../docs/PROJECT_DESIGN.md`
- Root setup and Docker workflow: `../README.md`, `../LOCAL_DOCKER_DEV_WORKFLOW.md`

## Current Auth Notes

- Registration uses `username`, `password`, required `phoneNumber`, and optional `address` / `cashapp`.
- Newly registered users are created as unapproved customers.
- Login requires approval.
- Active user role data is represented as role arrays.

## Common Commands

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Tests and build:

```bash
npm test
npm run build
```

## Environment

Use `backend/.env.example` for current backend environment variable names. Keep live values in ignored environment files, not in tracked docs.

For full local Docker startup, use the root workflow:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build db backend web-dev
```
