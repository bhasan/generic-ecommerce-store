# Multi-Tenancy Phase 2a — Store Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the backward-compatible plumbing to resolve an *active store* per request (from an `X-Store-Id` header, else the tenant's default store), relax `UserRole` uniqueness so staff can hold a role at multiple stores, and expose `GET /api/stores` — with **zero behavior change** for today's single-store tenants.

**Architecture:** Extends the Phase-1 `resolveTenant` middleware to also resolve the active store and put its `storeId` in the AsyncLocalStorage context (the scoped Prisma client already auto-filters store-scoped tables on `storeId`). No frontend, no catalog/settings changes yet — this is the foundation sub-plan (2a of 2a–2e in `docs/superpowers/specs/2026-06-30-multi-tenancy-phase-2-design.md`).

**Tech Stack:** Express + TypeScript, Prisma (generated client at `../../generated/prisma`, imported via `getUnscopedPrisma()` / default scoped export from `src/config/database.ts`), Vitest. Tests run in the container: `docker exec smoke-station-delivery-backend sh -c 'cd /app && npx vitest run <path>'`.

## Global Constraints

- **Backward-compat is the acceptance bar:** no `X-Store-Id` → default store; every existing backend + E2E test must stay green unchanged.
- **`stores` is an UNSCOPED table** (`src/config/tenantScope.ts`) — the scoped client does NOT inject `tenantId`. Query stores via `getUnscopedPrisma()` and filter `tenantId` explicitly (from `getTenantContext()`), exactly as `tenant.middleware.ts` already does.
- **Migrations are hand-authored SQL** applied with `npx prisma migrate deploy` (never `prisma migrate dev` — it would drop the raw-SQL `products.search_vector`). New migration timestamps must sort after `20260630010000_tenant_machine_tokens`.
- Fail-safe: an invalid/foreign/inactive `X-Store-Id` silently falls back to the default store — never error, never cross-tenant.
- Commit messages end with the repo's standard trailers (Co-Authored-By + Claude-Session).

---

### Task 1: Relax `UserRole` uniqueness to `(userId, roleId, storeId)`

**Files:**
- Modify: `backend/prisma/schema.prisma` (the `UserRole` model `@@unique`)
- Create: `backend/prisma/migrations/20260701000000_userrole_store_unique/migration.sql`
- Test: `backend/src/integration/userRoleMultiStore.test.ts`

**Interfaces:**
- Produces: nothing importable; enables multiple `UserRole` rows with the same `(userId, roleId)` and different `storeId` (one row per store; `storeId = null` = all stores).

- [ ] **Step 1: Write the failing test**

Create `backend/src/integration/userRoleMultiStore.test.ts` (mirrors `src/integration/tenantIsolation.test.ts` — real DB via `getUnscopedPrisma()`, cleanup in `afterAll`):

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { getUnscopedPrisma } from '../config/database';

const prisma = getUnscopedPrisma();
const SLUG = 'p2a-userrole-test';
const created = { tenantId: 0, storeIds: [] as number[], userId: 0, roleId: 0 };

describe('UserRole multi-store uniqueness', () => {
  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { userId: created.userId } });
    if (created.userId) await prisma.user.delete({ where: { id: created.userId } }).catch(() => {});
    if (created.storeIds.length) await prisma.store.deleteMany({ where: { id: { in: created.storeIds } } });
    if (created.tenantId) await prisma.tenant.delete({ where: { id: created.tenantId } }).catch(() => {});
  });

  it('allows the same (user, role) at two different stores, and rejects a duplicate at the same store', async () => {
    const tenant = await prisma.tenant.create({ data: { slug: SLUG, name: 'P2A', status: 'ACTIVE' } });
    created.tenantId = tenant.id;
    const s1 = await prisma.store.create({ data: { tenantId: tenant.id, name: 'S1', slug: 's1', status: 'ACTIVE' } });
    const s2 = await prisma.store.create({ data: { tenantId: tenant.id, name: 'S2', slug: 's2', status: 'ACTIVE' } });
    created.storeIds = [s1.id, s2.id];
    const user = await prisma.user.create({ data: { username: `${SLUG}-u`, password: 'x', approved: true, tenantId: tenant.id } });
    created.userId = user.id;
    const role = await prisma.role.findFirstOrThrow({ where: { name: 'EMPLOYEE' } });
    created.roleId = role.id;

    // Same (user, role) at two stores — both must succeed under the new constraint.
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, tenantId: tenant.id, storeId: s1.id } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, tenantId: tenant.id, storeId: s2.id } });
    const rows = await prisma.userRole.findMany({ where: { userId: user.id, roleId: role.id } });
    expect(rows.map((r) => r.storeId).sort()).toEqual([s1.id, s2.id].sort());

    // Duplicate at the SAME store must still be rejected.
    await expect(
      prisma.userRole.create({ data: { userId: user.id, roleId: role.id, tenantId: tenant.id, storeId: s1.id } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker exec smoke-station-delivery-backend sh -c 'cd /app && npx vitest run src/integration/userRoleMultiStore.test.ts'`
Expected: FAIL — the second `create` for `(user, role, s2)` throws a unique-constraint error (old `@@unique([userId, roleId])` still active).

- [ ] **Step 3: Update the schema**

In `backend/prisma/schema.prisma`, in the `UserRole` model, change:
```prisma
  @@unique([userId, roleId])
```
to:
```prisma
  @@unique([userId, roleId, storeId])
```

- [ ] **Step 4: Hand-author the migration**

Create `backend/prisma/migrations/20260701000000_userrole_store_unique/migration.sql`:
```sql
-- Relax UserRole uniqueness so a user can hold the same role at multiple stores
-- (one row per store); storeId = null still means "all stores".
DROP INDEX "user_roles_userId_roleId_key";
CREATE UNIQUE INDEX "user_roles_userId_roleId_storeId_key" ON "user_roles"("userId", "roleId", "storeId");
```

- [ ] **Step 5: Apply the migration + regenerate the client**

Run: `docker exec smoke-station-delivery-backend sh -c 'cd /app && npx prisma migrate deploy && npx prisma generate'`
Expected: `1 migration applied` (`20260701000000_userrole_store_unique`); client regenerated.

- [ ] **Step 6: Run the test to verify it passes**

Run: `docker exec smoke-station-delivery-backend sh -c 'cd /app && npx vitest run src/integration/userRoleMultiStore.test.ts'`
Expected: PASS.

- [ ] **Step 7: Run the full backend suite (backward-compat gate)**

Run: `docker exec smoke-station-delivery-backend sh -c 'cd /app && npx vitest run 2>&1 | tail -3'`
Expected: all pass, 0 failed. If a seed/user test asserted the old constraint, it should still pass (the new constraint is a relaxation).

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260701000000_userrole_store_unique/migration.sql backend/src/integration/userRoleMultiStore.test.ts
git commit -m "feat(phase2a): allow multi-store UserRole (unique on userId,roleId,storeId)"
```

---

### Task 2: Resolve the active store in `resolveTenant`

**Files:**
- Modify: `backend/src/middleware/tenant.middleware.ts` (the store-lookup tail of `resolveTenant`)
- Test: `backend/src/middleware/tenant.middleware.test.ts` (extend the existing suite)

**Interfaces:**
- Consumes: `getUnscopedPrisma()` (its `store.findFirst`), `runWithTenant({ tenantId, storeId, scope }, fn)`, `req.headers['x-store-id']`.
- Produces: sets `req.store = { id }` and puts `storeId` in the ALS context to the **active** store — the `X-Store-Id` store when it belongs to the resolved tenant and is `ACTIVE`, else the tenant's default store.

**Design note (staff constraint — refines spec Section 1):** `resolveTenant` runs *before* `authenticate` (which is applied per-route), so `req.user` is not available here. The active store is therefore validated against the **tenant only** (belongs + ACTIVE). The spec's "staff can only use assigned stores" rule is enforced **downstream by the existing `role.middleware`** — `authorize*` already checks the active store (`req.store.id`) against the caller's role `storeId`s and returns 403 on mismatch. So a staff member who sets `X-Store-Id` to a non-assigned store is blocked on any role-gated (store-scoped) route. Sub-plan **2e** ensures store-scoped operator routes are role-gated. This keeps enforcement on the *verified* user (never the unverified JWT decode the resolver uses).

- [ ] **Step 1: Write the failing tests**

The existing `backend/src/middleware/tenant.middleware.test.ts` already mocks `getUnscopedPrisma` as `{ tenant: { findUnique, findFirst }, store: { findFirst } }` and has an `mk(hostname, headers)` helper. Add this `describe` block at the end of the top-level `describe('resolveTenant', ...)`:

```ts
  describe('active store selection (X-Store-Id)', () => {
    // store.findFirst is called for BOTH the selected-store lookup and the default-store
    // lookup; disambiguate by the where clause.
    const wireStores = (opts: { selected?: any; def?: any }) => {
      findStore.mockImplementation(async (args: any) => {
        if (args.where?.isDefault) return opts.def ?? null;
        return opts.selected ?? null; // selected-store lookup (by id + tenantId + status)
      });
    };

    it('uses the X-Store-Id store when it belongs to the tenant and is active', async () => {
      tenantFindFirst.mockResolvedValue(ACTIVE(1, 'acme'));
      wireStores({ selected: { id: 9 }, def: { id: 5 } });
      const { req, res, next } = mk('acme.yourapp.com', { 'x-store-id': '9' });
      await resolveTenant(req, res, next);
      expect(req.store.id).toBe(9);
      expect(next).toHaveBeenCalled();
    });

    it('falls back to the default store when X-Store-Id is foreign/inactive (findFirst returns null)', async () => {
      tenantFindFirst.mockResolvedValue(ACTIVE(1, 'acme'));
      wireStores({ selected: null, def: { id: 5 } });
      const { req, res, next } = mk('acme.yourapp.com', { 'x-store-id': '999' });
      await resolveTenant(req, res, next);
      expect(req.store.id).toBe(5);
    });

    it('uses the default store when no X-Store-Id header is present', async () => {
      tenantFindFirst.mockResolvedValue(ACTIVE(1, 'acme'));
      wireStores({ def: { id: 5 } });
      const { req, res, next } = mk('acme.yourapp.com');
      await resolveTenant(req, res, next);
      expect(req.store.id).toBe(5);
    });

    it('ignores a non-numeric X-Store-Id and uses the default store', async () => {
      tenantFindFirst.mockResolvedValue(ACTIVE(1, 'acme'));
      wireStores({ selected: { id: 9 }, def: { id: 5 } });
      const { req, res, next } = mk('acme.yourapp.com', { 'x-store-id': 'abc' });
      await resolveTenant(req, res, next);
      expect(req.store.id).toBe(5); // non-numeric never hits the selected lookup
    });
  });
```

Note: the existing `mk` sets `findStore.mockResolvedValue({ id: 5 })` in `beforeEach`; `wireStores` overrides it with `mockImplementation`. Confirm `mk`/`beforeEach` names match the file (`findStore`, `tenantFindFirst`, `ACTIVE`) — they are defined there already.

- [ ] **Step 2: Run to verify failure**

Run: `docker exec smoke-station-delivery-backend sh -c 'cd /app && npx vitest run src/middleware/tenant.middleware.test.ts'`
Expected: the new tests FAIL — the current code always looks up `isDefault` and never reads `x-store-id`, so the first test gets `req.store.id === 5`, not 9.

- [ ] **Step 3: Implement `resolveActiveStore` and use it**

In `backend/src/middleware/tenant.middleware.ts`, add this helper above `resolveTenant`:

```ts
/**
 * Resolve the ACTIVE store for a request: the X-Store-Id store when it belongs to
 * `tenantId` and is ACTIVE, otherwise the tenant's default store. Fail-safe: an
 * invalid/foreign/inactive id silently falls back to the default (never errors,
 * never crosses tenants). `stores` is UNSCOPED, so tenantId is filtered explicitly.
 */
async function resolveActiveStore(
  prisma: ReturnType<typeof getUnscopedPrisma>,
  tenantId: number,
  headerStoreId: string | undefined,
): Promise<{ id: number } | null> {
  if (headerStoreId) {
    const id = Number(headerStoreId);
    if (Number.isInteger(id) && id > 0) {
      const selected = await prisma.store.findFirst({
        where: { id, tenantId, status: 'ACTIVE' },
      });
      if (selected) return { id: selected.id };
    }
  }
  const def = await prisma.store.findFirst({
    where: { tenantId, isDefault: true, status: 'ACTIVE' },
  });
  return def ? { id: def.id } : null;
}
```

Then replace the existing store-lookup tail of `resolveTenant`:

```ts
  const store = await prisma.store.findFirst({
    where: { tenantId: tenant.id, isDefault: true, status: 'ACTIVE' },
  });

  req.tenantId = tenant.id;
  req.tenant = { id: tenant.id, slug: tenant.slug, status: tenant.status };
  req.store = store ? { id: store.id } : null;

  runWithTenant(
    { tenantId: tenant.id, storeId: store?.id ?? null, scope: 'tenant' },
    () => next(),
  );
```

with:

```ts
  const headerStoreId = req.headers['x-store-id'];
  const store = await resolveActiveStore(
    prisma,
    tenant.id,
    typeof headerStoreId === 'string' ? headerStoreId : undefined,
  );

  req.tenantId = tenant.id;
  req.tenant = { id: tenant.id, slug: tenant.slug, status: tenant.status };
  req.store = store;

  runWithTenant(
    { tenantId: tenant.id, storeId: store?.id ?? null, scope: 'tenant' },
    () => next(),
  );
```

(`prisma` is already `const prisma = getUnscopedPrisma()` at the top of `resolveTenant`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker exec smoke-station-delivery-backend sh -c 'cd /app && npx vitest run src/middleware/tenant.middleware.test.ts'`
Expected: PASS (all prior tests + the 4 new ones).

- [ ] **Step 5: Typecheck + full suite (backward-compat gate)**

Run: `docker exec smoke-station-delivery-backend sh -c 'cd /app && npm run typecheck && npx vitest run 2>&1 | tail -3'`
Expected: tsc clean; all tests pass, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add backend/src/middleware/tenant.middleware.ts backend/src/middleware/tenant.middleware.test.ts
git commit -m "feat(phase2a): resolve active store from X-Store-Id with default-store fallback"
```

---

### Task 3: `GET /api/stores` (list the tenant's active stores)

**Files:**
- Create: `backend/src/services/store.service.ts`
- Create: `backend/src/controllers/store.controller.ts`
- Create: `backend/src/routes/store.routes.ts`
- Modify: `backend/src/index.ts` (import + mount)
- Test: `backend/src/services/store.service.test.ts`

**Interfaces:**
- Consumes: `getUnscopedPrisma()` (`store.findMany`), `getTenantContextOrThrow()` (`{ tenantId }`), `successResponse`, `authenticate`, `generalLimiter`, `asyncHandler`.
- Produces: `class StoreService { listStores(): Promise<Array<{ id: number; name: string; slug: string; isDefault: boolean }>> }`; route `GET /api/stores` → `{ data: Store[] }`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/store.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
vi.mock('../config/database', () => ({ getUnscopedPrisma: () => ({ store: { findMany } }) }));
vi.mock('../config/tenantContext', () => ({ getTenantContextOrThrow: () => ({ tenantId: 7, storeId: 1, scope: 'tenant' }) }));

import { StoreService } from './store.service';

describe('StoreService.listStores', () => {
  beforeEach(() => findMany.mockReset());

  it('returns the active stores for the context tenant, default first', async () => {
    findMany.mockResolvedValue([{ id: 5, name: 'Main', slug: 'main', isDefault: true }]);
    const result = await new StoreService().listStores();
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 7, status: 'ACTIVE' },
      select: { id: true, name: true, slug: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    expect(result).toEqual([{ id: 5, name: 'Main', slug: 'main', isDefault: true }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `docker exec smoke-station-delivery-backend sh -c 'cd /app && npx vitest run src/services/store.service.test.ts'`
Expected: FAIL — `./store.service` does not exist.

- [ ] **Step 3: Implement the service**

Create `backend/src/services/store.service.ts`:

```ts
import { getUnscopedPrisma } from '../config/database';
import { getTenantContextOrThrow } from '../config/tenantContext';

// `stores` is UNSCOPED (tenantScope.ts), so filter tenantId explicitly from context.
export class StoreService {
  async listStores() {
    const { tenantId } = getTenantContextOrThrow();
    return getUnscopedPrisma().store.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: { id: true, name: true, slug: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker exec smoke-station-delivery-backend sh -c 'cd /app && npx vitest run src/services/store.service.test.ts'`
Expected: PASS.

- [ ] **Step 5: Implement the controller + route**

Create `backend/src/controllers/store.controller.ts`:

```ts
import { Request, Response } from 'express';
import { StoreService } from '../services/store.service';
import { successResponse } from '../utils/responseEnvelope';

const storeService = new StoreService();

export class StoreController {
  async list(_req: Request, res: Response): Promise<void> {
    const stores = await storeService.listStores();
    res.status(200).json(successResponse(stores));
  }
}
```

Create `backend/src/routes/store.routes.ts`:

```ts
import { Router } from 'express';
import { StoreController } from '../controllers/store.controller';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();
const storeController = new StoreController();

// Authenticated: the store list is used by the in-app picker/switcher.
router.get('/', authenticate, asyncHandler(storeController.list));

export default router;
```

- [ ] **Step 6: Mount the route in `index.ts`**

In `backend/src/index.ts`, add the import next to the other route imports (near `import storeSettingsRoutes from './routes/storeSettings.routes';`):
```ts
import storeRoutes from './routes/store.routes';
```
And mount it next to the other `/api/store*` mounts (near `app.use('/api/store-settings', ...)`):
```ts
app.use('/api/stores', generalLimiter, storeRoutes);
```

- [ ] **Step 7: Typecheck + full suite**

Run: `docker exec smoke-station-delivery-backend sh -c 'cd /app && npm run typecheck && npx vitest run 2>&1 | tail -3'`
Expected: tsc clean; all tests pass, 0 failed.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/store.service.ts backend/src/services/store.service.test.ts backend/src/controllers/store.controller.ts backend/src/routes/store.routes.ts backend/src/index.ts
git commit -m "feat(phase2a): GET /api/stores lists the tenant's active stores"
```

---

## After 2a

Once all three tasks are green and committed, run the full E2E once as the backward-compat gate (nothing should have changed for customers):
`npm run test:e2e` (or the container-based Playwright run) — expect the current pass count unchanged.

Then proceed to **sub-plan 2b (per-store settings + delivery)** — its own plan via the writing-plans skill.
