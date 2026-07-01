# Smoke Station Delivery — Multi-Tenancy Architecture Rules

This file outlines the critical constraints, gotchas, and guidelines for developing within the multi-tenant architecture of Smoke Station Delivery.

---

## 1. AsyncLocalStorage Context Scope Gotcha

> [!IMPORTANT]
> **Rule**: When executing asynchronous database queries inside `runWithTenant`, you **must** use `async/await` inside the callback scope. Returning a lazy promise synchronously will cause the execution to exit the `AsyncLocalStorage` run context before the database driver executes the query, throwing a `MissingTenantContextError` or leaking data.

### ❌ Incorrect Pattern
```ts
// Context is lost during async resolution!
const categories = await runWithTenant(ctx, () => {
  return prisma.category.findMany(); // returns PrismaPromise synchronously
});
```

###  Correct Pattern
```ts
// Awaiting inside the callback preserves the context boundary
const categories = await runWithTenant(ctx, async () => {
  return await prisma.category.findMany();
});
```

---

## 2. Optional Fields in schema.prisma vs. Database NOT NULL Constraints

> [!NOTE]
> **Rule**: The scoping columns `tenantId` and `storeId` are marked as optional (`Int?`) in `schema.prisma` to allow `create` and `createMany` operations to compile without requiring manual scoping payloads (the query extension automatically injects the active tenant context).
>
> However, these fields are strictly **`NOT NULL`** in the PostgreSQL database.

When writing code that bypasses the tenant-scoped client (e.g., seeding, CLI scripts, migrations), you **must** pass `tenantId` and `storeId` explicitly, or the database will reject the insert with a null constraint violation.

---

## 3. Selecting the Correct Prisma Client Instance

- **`getTenantPrisma()`**:
  - Always use for HTTP controllers, request-scoped business logic, and scoped CRUD services.
  - Automatically isolates all reads, writes, and updates by the current tenant/store context.
- **`getUnscopedPrisma()` (or default `prisma` export)**:
  - Use for global background tasks (like the outbox worker claiming process), migrations, initial seeds, and super-admin operations.
  - Does **not** apply any automated scoping filters.

---

## 4. Compound Unique Constraint Lookup Optimization

> [!TIP]
> Always lookup unique fields by their compound unique key (`tenantId_username`, `tenantId_slug`) rather than single-field lookups on `username` or `slug`. This allows Postgres to use the unique compound indexes directly and prevents the query extension from falling back to a `findFirst` query.

### ❌ Sub-optimal Lookup
```ts
const user = await prisma.user.findUnique({ where: { username } }); // triggers findFirst fallback
```

###  Optimal Lookup
```ts
const user = await prisma.user.findUnique({
  where: {
    tenantId_username: { tenantId, username }
  }
});
```

---

## 5. Reserved Subdomains & Tenant Slugs

The following slugs are reserved for global architecture routing and must never be permitted to register as a tenant slug:
- `admin`
- `www`
- `app`
- `api`
- `portal`
- `status`
- `health`
- `metrics`
- `dev`
- `staging`
- `prod`
