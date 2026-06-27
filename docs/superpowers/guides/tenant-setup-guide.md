# Tenant Setup & Configuration Guide

**Date:** 2026-06-27
**Applies to:** Phase 1 multi-tenancy foundation
**Audience:** Engineers and operators setting up or managing tenants

---

## What is a Tenant?

A **Tenant** is an owning business on the platform. Each tenant:
- Has its own isolated data (users, products, orders, settings)
- Maps to one or more **Stores** (one default store in Phase 1)
- Is accessible via subdomain, custom domain, or request header
- Can hold multiple users with different role scopes

The hierarchy is: `Tenant → Store → Users / Orders`.

---

## Creating a Tenant

Phase 1 has no self-service UI. Tenants are provisioned via a database seed script run on the server.

### 1. Script-based provisioning (Phase 1 standard)

SSH into the server and run inside the backend container:

```bash
docker exec -it smoke-station-delivery-backend npx ts-node prisma/seed-tenant.ts \
  --slug acme \
  --name "Acme Smoke Shop" \
  --status ACTIVE
```

> Phase 1 does not ship `seed-tenant.ts` as a general CLI yet — use a one-off script modeled on `seed-demo.ts` (see below) or create the rows directly via Prisma Studio.

### 2. Prisma Studio (quick dev/staging setup)

```bash
cd backend && npx prisma studio
```

Create a `Tenant` row first, then a `Store` row with `isDefault: true` pointing at that tenant.

### 3. Direct SQL (emergency / prod bootstrap)

```sql
INSERT INTO tenants (slug, name, status, "createdAt", "updatedAt")
VALUES ('acme', 'Acme Smoke Shop', 'ACTIVE', now(), now());

INSERT INTO stores (tenant_id, name, slug, "isDefault", status, "createdAt", "updatedAt")
SELECT id, 'Main Location', 'main', true, 'ACTIVE', now(), now()
FROM tenants WHERE slug = 'acme';
```

---

## Tenant Fields Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | `String @unique` | Yes | URL-safe identifier. Used as the subdomain (`acme.yourapp.com`) and fallback resolution key. **Cannot be changed after creation** without a data migration. |
| `name` | `String` | Yes | Human-readable display name. Shown in admin console and emails. |
| `status` | `TenantStatus` | Yes | `ACTIVE` or `SUSPENDED`. Suspended tenants are blocked at the middleware (403). |
| `plan` | `String?` | No | Billing plan identifier (e.g. `'starter'`, `'pro'`). Not enforced in Phase 1; used for future feature gating. |
| `customDomain` | `String? @unique` | No | Fully-qualified custom domain (e.g. `store.acmesmoke.com`). See Custom Domains section. |

---

## Store Fields Reference

Each tenant has at least one store. Phase 1 ships one default store per tenant.

| Field | Type | Description |
|-------|------|-------------|
| `tenantId` | `Int` | FK to the owning tenant. |
| `slug` | `String` | URL-safe store identifier. Must be unique within the tenant (`@@unique([tenantId, slug])`). |
| `name` | `String` | Display name (e.g. "Downtown Location"). |
| `isDefault` | `Boolean` | Exactly one store per tenant should be `true`. This is the store resolved for all single-store requests. |
| `status` | `StoreStatus` | `ACTIVE` or `SUSPENDED`. |

---

## Tenant Resolution — How the System Finds the Right Tenant

The middleware resolves the active tenant from the incoming request using this priority chain:

### Priority 1 — Explicit Request Headers

Best for: single-domain SPAs, internal API clients, testing.

```http
X-Tenant-Slug: acme
```
or
```http
X-Tenant-ID: 3
```

No DNS changes required. The frontend or API client sends the header on every request.

### Priority 2 — JWT Token

If the user is already authenticated, their JWT carries `tenantId`. The middleware reads it (without verifying the signature — auth middleware does that). Useful when the frontend has no subdomain but the user is logged in.

### Priority 3 — Custom Domain

If the incoming `Host` header matches a tenant's `customDomain` field (e.g. `store.acmesmoke.com`), that tenant is resolved.

Setup required:
1. Set `Tenant.customDomain = 'store.acmesmoke.com'` in the database.
2. Tenant points their DNS CNAME: `store.acmesmoke.com → yourapp.com` (or your server IP).
3. Provision a TLS cert for that domain (Let's Encrypt / Certbot or Caddy).

### Priority 4 — Subdomain Slug

`acme.yourapp.com` → resolves to the tenant with `slug = 'acme'`.

Setup required:
- Wildcard DNS: `*.yourapp.com → <server IP>`
- Wildcard TLS certificate for `*.yourapp.com`
- nginx `server_name *.yourapp.com`

### Priority 5 — Apex / `www` (Default Tenant)

`yourapp.com` or `www.yourapp.com` → always resolves to the default tenant (`slug: 'app'`).

**Important:** the default tenant's slug must match your production hostname. Set this before running the core migration (the backfill tags all existing rows with this tenant's ID).

### Unknown Subdomain Behavior

If a subdomain doesn't match any tenant's slug or `customDomain`, the middleware returns **404**. It does not silently fall back to the default tenant.

---

## Users, Roles, and Scope

Roles are platform-wide names assigned with a scope:

| Role | Scope | Description |
|------|-------|-------------|
| `SUPER_ADMIN` | Platform (`tenantId = null`) | Full access to all tenants. Only valid on `admin.*` context. |
| `ADMIN` | Tenant-wide (`storeId = null`) | Owner-level access to all stores in their tenant. |
| `MANAGEMENT` | Store-scoped (`storeId = X`) | Staff dashboard, order management for one store. |
| `EMPLOYEE` | Store-scoped | Operational access for one store. |
| `DELIVERY_DRIVER` | Store-scoped | Delivery workflow for one store. |
| `CUSTOMER` | Tenant-wide | Can shop any store in the tenant. |
| `VIP` | Tenant-wide | Customer with elevated access (e.g. special pricing). |
| `GUEST` | Tenant-wide | Unauthenticated or pre-registration. |

### Assigning a role to a user

```sql
-- Find role id
SELECT id FROM roles WHERE name = 'MANAGEMENT';

-- Find store id
SELECT id FROM stores WHERE tenant_id = <tenant_id> AND "isDefault" = true;

-- Assign
INSERT INTO user_roles ("userId", "roleId", "storeId")
VALUES (<user_id>, <role_id>, <store_id>);
```

For a tenant-wide role (e.g. ADMIN, CUSTOMER), set `storeId = NULL`.

### JWT shape

Every access token carries:
```json
{
  "userId": 1,
  "username": "bilal",
  "tenantId": 3,
  "roles": [
    { "name": "MANAGEMENT", "storeId": 5 },
    { "name": "CUSTOMER", "storeId": null }
  ]
}
```

`tenantId: null` means the user is a super-admin and operates above all tenants.

---

## The Demo Tenant

The demo tenant is a special tenant (`slug: 'demo'`) pre-seeded with fake catalog, staged orders, and public demo credentials.

### Initial setup

```bash
# Run once to create the demo tenant and seed all data
cd backend && npm run prisma:seed:demo
```

### Resetting demo data

Accessible via the admin dashboard (super-admin only):

```
POST /admin/demo/reset
Authorization: Bearer <super-admin-token>
```

Or from the command line:

```bash
cd backend && npm run prisma:seed:demo
```

The seed is fully idempotent — it wipes and recreates all demo products, orders, and users on every run. The tenant and store rows are upserted (not deleted).

### Demo credentials

| User | Role | Password |
|------|------|----------|
| `demo-manager` | MANAGEMENT (store-scoped) | `demo1234` |
| `demo-customer` | CUSTOMER (tenant-wide) | `demo1234` |

### Demo rate limiting

All API routes under the demo tenant are rate-limited to **30 requests/minute per IP** to prevent abuse. This is enforced automatically by the middleware — no configuration needed.

---

## Suspending a Tenant

Suspension blocks all requests to the tenant immediately (403 response). Data is preserved.

```sql
UPDATE tenants SET status = 'SUSPENDED' WHERE slug = 'acme';
```

To reactivate:

```sql
UPDATE tenants SET status = 'ACTIVE' WHERE slug = 'acme';
```

> Phase 3 will add suspension controls to the super-admin console UI.

---

## Deleting a Tenant (GDPR / Data Erasure)

Hard-deletes the tenant and all associated data in FK-safe order. **Irreversible.**

```
DELETE /admin/tenants/:id
Authorization: Bearer <super-admin-token>
```

Guards:
- The default tenant (`slug: 'app'`) cannot be deleted via this endpoint.
- The operation runs synchronously; for large tenants with many orders, expect a few seconds of latency.

To confirm the tenant is gone:

```sql
SELECT * FROM tenants WHERE id = <id>;  -- should return 0 rows
SELECT count(*) FROM orders WHERE tenant_id = <id>;  -- should be 0
```

---

## Backing Up a Single Tenant's Data

For data portability or per-tenant restore capability:

```bash
# Export all rows for tenant ID 3 to a SQL file
PGPASSWORD=$DB_PASSWORD pg_dump \
  -U $DB_USER -h localhost -p 15432 -d $DB_NAME \
  --no-acl --no-owner \
  -t users -t user_roles \
  -t products -t categories -t product_variants -t product_images \
  -t orders -t order_items -t order_status_events -t payments \
  -t cart_items -t print_jobs -t pos_outbox -t order_pos_mappings \
  -t announcements -t contact_messages -t ui_settings \
  -t store_credit_transactions -t reviews -t review_votes \
  --where "tenant_id = 3" \
  -f tenant_3_backup.sql
```

Store rows need a separate pass (they don't carry `tenant_id` — they reference it via FK):

```bash
# Add stores for this tenant
psql -U $DB_USER -d $DB_NAME -c \
  "\COPY (SELECT * FROM stores WHERE tenant_id = 3) TO 'tenant_3_stores.csv' CSV HEADER"
```

Full-database backups (the `backup-db.sh` script) already run automatically before every deployment. Per-tenant exports are supplemental for GDPR erasure evidence or tenant data hand-off.

---

## Scaling a Tenant to Its Own Database (Future)

The architecture supports this without app-level changes when the time comes:

1. Add `dbUrl String?` to the `Tenant` model (migration required).
2. Export the tenant's data using the single-tenant backup method above.
3. Restore into a new Postgres instance.
4. Set `Tenant.dbUrl = 'postgresql://...'` for that tenant row.
5. `getTenantPrisma()` will detect the `dbUrl` and instantiate a dedicated client for that tenant; all other tenants continue using the shared pool.

No application code in controllers or services changes — the isolation is handled entirely in `config/database.ts`.

---

## Configuration Checklist — New Tenant Onboarding

- [ ] Create `Tenant` row with correct `slug`, `name`, `status: ACTIVE`.
- [ ] Create `Store` row with `isDefault: true`.
- [ ] Decide resolution mode: subdomain, custom domain, or header-based.
  - Subdomain: wildcard DNS + TLS must cover `*.yourapp.com`.
  - Custom domain: set `Tenant.customDomain`, tenant CNAMEs, provision TLS cert.
  - Header-based: no infra changes; frontend/client sends `X-Tenant-Slug`.
- [ ] Create the admin/owner user and assign `ADMIN` role (`storeId: null`).
- [ ] Seed any initial catalog, UI settings, or branding via seed script or Prisma Studio.
- [ ] Verify isolation: confirm the new tenant cannot see rows from other tenants by running the cross-tenant integration test suite.
- [ ] Confirm monitoring dashboards show the new `tenantId` in logs.
