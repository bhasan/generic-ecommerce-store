# Super-Admin Console + Soft-Delete Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relocate tenant management into a dedicated `SUPER_ADMIN`-gated `/admin` console and complete the soft-delete lifecycle (a reversible `DELETED` status that resolves as 404) with a persistent, surfaced audit trail.

**Architecture:** Backend adds a `DELETED` value to `TenantStatus` (enforced at the single tenant-middleware choke point), a new unscoped `tenant_audit_log` table written in-transaction with every lifecycle mutation, and new service/controller/routes for update, soft-delete, list-filtering, and audit read. Frontend adds a `web/src/features/admin/` console (Tenants + Activity pages), relocates the existing tenant UI there, and gates the whole route group on `SUPER_ADMIN`.

**Tech Stack:** Express + TypeScript + Prisma (generated client at `../../generated/prisma`), Postgres, React 19 + Vite + react-router, vitest + @testing-library/react.

## Global Constraints

- Generated Prisma client is imported from `../../generated/prisma`, **never** `@prisma/client`.
- Business code must never pass `tenantId` manually. Super-admin / cross-tenant ops use `getUnscopedPrisma()` and pass ids explicitly.
- New cross-tenant tables must be registered in `backend/src/config/tenantScope.ts` `UNSCOPED_TABLES` (by their `@@map` name) or the scoping layer treats them as tenant-scoped.
- Tenant status is enforced at ONE choke point (`backend/src/middleware/tenant.middleware.ts:172`). Do not scatter status checks into routes/controllers.
- 404 body is exactly `{ error: 'Tenant not found' }`; suspended 403 body is exactly `{ error: 'This store is suspended' }`. Controller validation errors use `{ error: { message, code } }`; success uses `successResponse(...)` (`{ success, data }`).
- Postgres forbids using a freshly-added enum value in the same transaction that adds it → the `ADD VALUE 'DELETED'` migration is its own file and references `DELETED` nowhere.
- Migration folders are dated `YYYYMMDDHHMMSS_<name>/migration.sql` and must sort AFTER the latest existing migration (`20260701030000_userrole_admin_allstores_backfill`). Use `20260701040000_` and `20260701050000_`.
- Audit rows are written by direct DB insert **inside the mutation's `$transaction`**, never via the in-process event bus. `targetTenantId` is a plain `Int` column (no cascade FK) so audit history survives tenant deletion. On the `admin` subdomain `req.tenant` is null — take the target tenant id from the route param, not `req.tenant`.
- Backend routes stay behind `authenticate + requireSuperAdmin` (no authz change). All frontend API calls go through the shared `services/api.js` client (`get/post/patch/del`).
- Tests: backend `backend/src/**/*.test.ts` (vitest), frontend `web/src/**/*.test.{js,jsx}`. Run backend via `npm --prefix backend test -- <file>`, web via `npm --prefix web test -- <file>`.

**Commands used throughout:**
- Typecheck backend: `npm --prefix backend run build`
- Regenerate Prisma client (no DB required): `npm --prefix backend run prisma:generate`
- Apply migrations (needs the dev DB up): `docker exec smoke-station-delivery-backend npm run prisma:migrate` — or `npm --prefix backend run prisma:migrate` if the backend runs locally against the DB on host port `15432`.
- Lint frontend: `npm --prefix web run lint`

---

## Task 1: `DELETED` tenant status + middleware 404 enforcement

**Files:**
- Modify: `backend/prisma/schema.prisma:729-732` (enum `TenantStatus`)
- Create: `backend/prisma/migrations/20260701040000_tenant_status_deleted/migration.sql`
- Modify: `backend/src/middleware/tenant.middleware.ts:172-175`
- Test: `backend/src/middleware/tenant.middleware.test.ts`

**Interfaces:**
- Produces: the string status value `'DELETED'` usable in `tenant.update({ data: { status: 'DELETED' } })` after client regen; middleware behavior "DELETED → 404, next not called".

- [ ] **Step 1: Write the failing middleware test**

Add after the existing `403s a suspended tenant` test (`backend/src/middleware/tenant.middleware.test.ts:76`):

```ts
  it('404s a DELETED tenant (indistinguishable from unknown)', async () => {
    tenantFindFirst.mockResolvedValue({ id: 1, slug: 'acme', status: 'DELETED' });
    const { req, res, next } = mk('acme.yourapp.com');
    await resolveTenant(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found' });
    expect(next).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix backend test -- tenant.middleware.test.ts -t "DELETED"`
Expected: FAIL — a DELETED tenant currently falls into the `!== 'ACTIVE'` branch, so `res.status` is called with `403`, not `404`.

- [ ] **Step 3: Add the `DELETED` branch at the choke point**

In `backend/src/middleware/tenant.middleware.ts`, replace lines 172-175:

```ts
  if (tenant.status !== 'ACTIVE') {
    res.status(403).json({ error: 'This store is suspended' });
    return;
  }
```

with:

```ts
  // A soft-deleted tenant is hidden: it resolves exactly like an unknown tenant
  // (404), never a suspend notice. This runs BEFORE the suspend check so DELETED
  // is not collapsed into 403.
  if (tenant.status === 'DELETED') {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }
  if (tenant.status !== 'ACTIVE') {
    res.status(403).json({ error: 'This store is suspended' });
    return;
  }
```

- [ ] **Step 4: Run the middleware tests to verify they pass**

Run: `npm --prefix backend test -- tenant.middleware.test.ts`
Expected: PASS — the new DELETED→404 test passes and the existing `403s a suspended tenant` test still passes (the two states stay distinct).

- [ ] **Step 5: Add `DELETED` to the enum and author the migration**

In `backend/prisma/schema.prisma`, change the enum (currently lines 729-732):

```prisma
enum TenantStatus {
  ACTIVE
  SUSPENDED
  DELETED
}
```

Create `backend/prisma/migrations/20260701040000_tenant_status_deleted/migration.sql`:

```sql
-- AlterEnum
-- Standalone: Postgres cannot use a freshly-added enum value in the same
-- transaction that adds it, so this migration only adds the value and
-- references it nowhere.
ALTER TYPE "TenantStatus" ADD VALUE 'DELETED';
```

- [ ] **Step 6: Regenerate the client and typecheck**

Run: `npm --prefix backend run prisma:generate && npm --prefix backend run build`
Expected: client regenerates and `tsc` passes (the generated `TenantStatus` now includes `DELETED`, so later `status: 'DELETED'` writes typecheck).

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260701040000_tenant_status_deleted backend/src/middleware/tenant.middleware.ts backend/src/middleware/tenant.middleware.test.ts
git commit -m "feat(phase3): add DELETED tenant status, enforced as 404 at tenant middleware"
```

---

## Task 2: `tenant_audit_log` table + audit writer helper

**Files:**
- Modify: `backend/prisma/schema.prisma` (add `TenantAuditLog` model; add back-relation on `User`)
- Create: `backend/prisma/migrations/20260701050000_add_tenant_audit_log/migration.sql`
- Modify: `backend/src/config/tenantScope.ts:5-11` (register unscoped table)
- Modify: `backend/src/services/tenantManagement.service.ts` (add `AuditActor` type + `recordTenantAudit` helper)
- Test: `backend/src/services/tenantManagement.service.test.ts` (new file)

**Interfaces:**
- Produces:
  - `export interface AuditActor { userId?: number; username?: string; requestId?: string }`
  - Private method `recordTenantAudit(tx, entry: { action: string; targetTenantId: number; actor: AuditActor; detail?: Prisma.InputJsonValue }): Promise<void>` on `TenantManagementService`.
  - Prisma model `TenantAuditLog` with fields `id, action, targetTenantId, actorUserId, actorUsername, requestId, detail, createdAt`.

- [ ] **Step 1: Add the `TenantAuditLog` model and `User` back-relation**

In `backend/prisma/schema.prisma`, add the model (place it near `Tenant`, before the `enum TenantStatus`):

```prisma
model TenantAuditLog {
  id             Int      @id @default(autoincrement())
  action         String
  targetTenantId Int
  actorUserId    Int?
  actorUsername  String
  requestId      String?
  detail         Json?
  createdAt      DateTime @default(now())

  actor User? @relation("TenantAuditActor", fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([targetTenantId, createdAt])
  @@index([createdAt])
  @@map("tenant_audit_log")
}
```

In the `User` model, add the back-relation field (alongside the existing `statusEventChanges` relation at `schema.prisma:41`):

```prisma
  tenantAuditActions        TenantAuditLog[]           @relation("TenantAuditActor")
```

- [ ] **Step 2: Author the migration**

Create `backend/prisma/migrations/20260701050000_add_tenant_audit_log/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "tenant_audit_log" (
    "id" SERIAL NOT NULL,
    "action" TEXT NOT NULL,
    "targetTenantId" INTEGER NOT NULL,
    "actorUserId" INTEGER,
    "actorUsername" TEXT NOT NULL,
    "requestId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_audit_log_targetTenantId_createdAt_idx" ON "tenant_audit_log"("targetTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "tenant_audit_log_createdAt_idx" ON "tenant_audit_log"("createdAt");

-- AddForeignKey
ALTER TABLE "tenant_audit_log" ADD CONSTRAINT "tenant_audit_log_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Register the table as unscoped**

In `backend/src/config/tenantScope.ts`, add `'tenant_audit_log'` to `UNSCOPED_TABLES` (lines 5-11):

```ts
export const UNSCOPED_TABLES: ReadonlySet<string> = new Set([
  'roles',
  'address_geocode_cache',
  'tenants',
  'stores',
  'refresh_tokens',
  'tenant_audit_log',
]);
```

- [ ] **Step 4: Regenerate the client and typecheck**

Run: `npm --prefix backend run prisma:generate && npm --prefix backend run build`
Expected: passes; `prisma.tenantAuditLog` is now available on the client.

- [ ] **Step 5: Add the `AuditActor` type and `recordTenantAudit` helper**

In `backend/src/services/tenantManagement.service.ts`, add the `Prisma` import at the top (after the existing imports):

```ts
import { Prisma } from '../../generated/prisma';
```

Add the exported type near the other interfaces (after `RegenerateTokensResult`):

```ts
export interface AuditActor {
  userId?: number;
  username?: string;
  requestId?: string;
}
```

Add this private method inside the `TenantManagementService` class (after the `prisma` getter):

```ts
  /**
   * Write a platform audit row. MUST be called with a transaction client so the
   * audit record commits atomically with the mutation it describes.
   */
  private async recordTenantAudit(
    tx: Prisma.TransactionClient,
    entry: {
      action: string;
      targetTenantId: number;
      actor: AuditActor;
      detail?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.tenantAuditLog.create({
      data: {
        action: entry.action,
        targetTenantId: entry.targetTenantId,
        actorUserId: entry.actor.userId ?? null,
        actorUsername: entry.actor.username ?? 'unknown',
        requestId: entry.actor.requestId ?? null,
        detail: entry.detail,
      },
    });
  }
```

- [ ] **Step 6: Write a failing test for the helper (via a transaction)**

Create `backend/src/services/tenantManagement.service.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// A transaction-client stub whose tables are vi.fns we can assert on.
function makeTx() {
  return {
    tenant: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    tenantAuditLog: { create: vi.fn(), findMany: vi.fn() },
  };
}

let tx = makeTx();
const prismaStub = {
  tenant: { findUnique: vi.fn(), findMany: vi.fn() },
  tenantAuditLog: { findMany: vi.fn() },
  // $transaction(cb) runs the callback against the tx stub, mirroring Prisma.
  $transaction: vi.fn(async (cb: any) => cb(tx)),
};

vi.mock('../config/database', () => ({
  getUnscopedPrisma: () => prismaStub,
}));
vi.mock('../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { tenantManagementService } from './tenantManagement.service';

beforeEach(() => {
  tx = makeTx();
  prismaStub.$transaction.mockImplementation(async (cb: any) => cb(tx));
  prismaStub.tenant.findMany.mockReset();
  prismaStub.tenantAuditLog.findMany.mockReset();
});

describe('setTenantStatus audit', () => {
  it('records TENANT_SUSPENDED with a from/to detail when suspending', async () => {
    tx.tenant.findUnique.mockResolvedValue({ id: 7, slug: 'acme', status: 'ACTIVE' });
    tx.tenant.update.mockResolvedValue({ id: 7, slug: 'acme', status: 'SUSPENDED' });

    await tenantManagementService.setTenantStatus(7, 'SUSPENDED', { userId: 1, username: 'root', requestId: 'r1' });

    expect(tx.tenant.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { status: 'SUSPENDED' } });
    expect(tx.tenantAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'TENANT_SUSPENDED',
        targetTenantId: 7,
        actorUserId: 1,
        actorUsername: 'root',
        requestId: 'r1',
        detail: { from: 'ACTIVE', to: 'SUSPENDED' },
      },
    });
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm --prefix backend test -- tenantManagement.service.test.ts`
Expected: FAIL — `setTenantStatus` does not yet take an actor, is not transactional, and writes no audit row. (This drives Task 3.)

- [ ] **Step 8: Commit the schema + helper (test stays red until Task 3)**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260701050000_add_tenant_audit_log backend/src/config/tenantScope.ts backend/src/services/tenantManagement.service.ts backend/src/services/tenantManagement.service.test.ts
git commit -m "feat(phase3): add tenant_audit_log table + recordTenantAudit helper"
```

---

## Task 3: Thread actor + audit into create / setStatus / regenerate

**Files:**
- Modify: `backend/src/services/tenantManagement.service.ts` (`createTenant`, `setTenantStatus`, `regenerateTokens`)
- Modify: `backend/src/controllers/tenantManagement.controller.ts` (source the actor, pass it down)
- Test: `backend/src/services/tenantManagement.service.test.ts` (extend)

**Interfaces:**
- Consumes: `AuditActor`, `recordTenantAudit` (Task 2).
- Produces (new signatures):
  - `createTenant(input: CreateTenantInput, actor: AuditActor): Promise<CreateTenantResult>`
  - `setTenantStatus(id: number, status: 'ACTIVE' | 'SUSPENDED', actor: AuditActor)`
  - `regenerateTokens(id: number, actor: AuditActor): Promise<RegenerateTokensResult>`
  - Controller helper `getActor(req: Request): AuditActor`.

- [ ] **Step 1: Rewrite `setTenantStatus` to be transactional + audited**

In `backend/src/services/tenantManagement.service.ts`, replace the whole `setTenantStatus` method (currently lines 165-174):

```ts
  /**
   * Activate or suspend a tenant. Writes an audit row atomically with the change.
   * The action is derived from the target status: SUSPENDED → TENANT_SUSPENDED,
   * ACTIVE → TENANT_RESTORED (covers both un-suspend and restore-from-deleted).
   */
  async setTenantStatus(id: number, status: 'ACTIVE' | 'SUSPENDED', actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id } });
      if (!tenant) {
        throw new AppError('Tenant not found', 404);
      }
      const updated = await tx.tenant.update({ where: { id }, data: { status } });
      await this.recordTenantAudit(tx, {
        action: status === 'SUSPENDED' ? 'TENANT_SUSPENDED' : 'TENANT_RESTORED',
        targetTenantId: id,
        actor,
        detail: { from: tenant.status, to: status },
      });
      return updated;
    });
  }
```

- [ ] **Step 2: Add a `TENANT_CREATED` audit inside `createTenant`'s transaction**

In `createTenant`, change the signature to accept `actor` and add the audit write inside the existing `$transaction`. Change the method declaration (line 76):

```ts
  async createTenant(input: CreateTenantInput, actor: AuditActor): Promise<CreateTenantResult> {
```

Inside the transaction, immediately before `return { tenant, store };` (currently line 142), add:

```ts
      await this.recordTenantAudit(tx, {
        action: 'TENANT_CREATED',
        targetTenantId: tenant.id,
        actor,
        detail: { slug: tenant.slug, name: tenant.name, plan: tenant.plan },
      });

```

- [ ] **Step 3: Make `regenerateTokens` transactional + audited**

Replace the body of `regenerateTokens` (currently lines 180-203) so the token update and audit row commit together, and the signature takes an actor:

```ts
  async regenerateTokens(id: number, actor: AuditActor): Promise<RegenerateTokensResult> {
    const reportingMachineToken = generateMachineToken();
    const printMachineToken = generateMachineToken();

    await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id } });
      if (!tenant) {
        throw new AppError('Tenant not found', 404);
      }
      await tx.tenant.update({
        where: { id },
        data: {
          reportingTokenHash: reportingMachineToken.hash,
          printAgentKeyHash: printMachineToken.hash,
        },
      });
      await this.recordTenantAudit(tx, {
        action: 'TENANT_TOKENS_REGENERATED',
        targetTenantId: id,
        actor,
      });
    });

    logger.info('Tenant machine tokens regenerated', { tenantId: id });

    return {
      reportingToken: reportingMachineToken.token,
      printAgentKey: printMachineToken.token,
    };
  }
```

- [ ] **Step 4: Source the actor in the controller and pass it to every mutation**

In `backend/src/controllers/tenantManagement.controller.ts`, add the import and a helper at the top (after the existing imports):

```ts
import { tenantManagementService, AuditActor } from '../services/tenantManagement.service';

function getActor(req: Request): AuditActor {
  return {
    userId: req.user?.userId,
    username: req.user?.username,
    requestId: req.requestId,
  };
}
```

(Remove the now-duplicate `import { tenantManagementService } from '../services/tenantManagement.service';` line — the combined import above replaces it.)

Update the three call sites:
- `create` (line 31): `const result = await tenantManagementService.createTenant({ slug, name, plan: plan ?? undefined, adminUsername, adminPassword }, getActor(req));`
- `setStatus` (line 51): `const tenant = await tenantManagementService.setTenantStatus(id, status, getActor(req));`
- `regenerateTokens` (line 57): `const tokens = await tenantManagementService.regenerateTokens(id, getActor(req));`

- [ ] **Step 5: Extend the service test with create + regenerate + restore assertions**

Append to `backend/src/services/tenantManagement.service.test.ts`:

```ts
describe('setTenantStatus restore', () => {
  it('records TENANT_RESTORED when reactivating (from DELETED)', async () => {
    tx.tenant.findUnique.mockResolvedValue({ id: 7, slug: 'acme', status: 'DELETED' });
    tx.tenant.update.mockResolvedValue({ id: 7, slug: 'acme', status: 'ACTIVE' });

    await tenantManagementService.setTenantStatus(7, 'ACTIVE', { userId: 2, username: 'ops' });

    expect(tx.tenantAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'TENANT_RESTORED',
        targetTenantId: 7,
        actorUserId: 2,
        actorUsername: 'ops',
        requestId: null,
        detail: { from: 'DELETED', to: 'ACTIVE' },
      },
    });
  });

  it('throws 404 when the tenant does not exist', async () => {
    tx.tenant.findUnique.mockResolvedValue(null);
    await expect(
      tenantManagementService.setTenantStatus(999, 'ACTIVE', { username: 'ops' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('regenerateTokens audit', () => {
  it('records TENANT_TOKENS_REGENERATED inside the transaction', async () => {
    tx.tenant.findUnique.mockResolvedValue({ id: 3, slug: 'x', status: 'ACTIVE' });
    tx.tenant.update.mockResolvedValue({ id: 3 });

    const result = await tenantManagementService.regenerateTokens(3, { userId: 1, username: 'root' });

    expect(result.reportingToken).toBeTypeOf('string');
    expect(result.printAgentKey).toBeTypeOf('string');
    expect(tx.tenantAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'TENANT_TOKENS_REGENERATED', targetTenantId: 3 }) }),
    );
  });
});
```

> Note: `AppError` sets `statusCode` (see `backend/src/middleware/error.middleware.ts`); the 404 assertion matches on it.

- [ ] **Step 6: Run the service tests and typecheck**

Run: `npm --prefix backend test -- tenantManagement.service.test.ts && npm --prefix backend run build`
Expected: PASS (the Task 2 red test now passes) and `tsc` clean.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/tenantManagement.service.ts backend/src/controllers/tenantManagement.controller.ts backend/src/services/tenantManagement.service.test.ts
git commit -m "feat(phase3): audit create/suspend/restore/regenerate with acting super-admin"
```

---

## Task 4: Soft-delete endpoint + list status filter

**Files:**
- Modify: `backend/src/services/tenantManagement.service.ts` (`deleteTenant`, `listTenants` filter)
- Modify: `backend/src/controllers/tenantManagement.controller.ts` (`remove`, `list` reads query)
- Modify: `backend/src/routes/tenantManagement.routes.ts` (add `DELETE /:id`)
- Test: `backend/src/services/tenantManagement.service.test.ts` (extend)

**Interfaces:**
- Consumes: `AuditActor`, `recordTenantAudit`, `getActor`.
- Produces:
  - `deleteTenant(id: number, actor: AuditActor)` → sets status `DELETED`, audits `TENANT_DELETED`.
  - `listTenants(statusFilter?: string)` → default excludes `DELETED`; `'all'` includes everything; `'ACTIVE'|'SUSPENDED'|'DELETED'` filters exactly.
  - Route `DELETE /admin/tenants/:id`, controller `remove`.

- [ ] **Step 1: Write failing tests for delete + list filter**

Append to `backend/src/services/tenantManagement.service.test.ts`:

```ts
describe('deleteTenant', () => {
  it('soft-deletes (status DELETED) and records TENANT_DELETED', async () => {
    tx.tenant.findUnique.mockResolvedValue({ id: 5, slug: 'gone', status: 'ACTIVE' });
    tx.tenant.update.mockResolvedValue({ id: 5, slug: 'gone', status: 'DELETED' });

    await tenantManagementService.deleteTenant(5, { userId: 1, username: 'root', requestId: 'r9' });

    expect(tx.tenant.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { status: 'DELETED' } });
    expect(tx.tenantAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'TENANT_DELETED',
        targetTenantId: 5,
        actorUserId: 1,
        actorUsername: 'root',
        requestId: 'r9',
        detail: { from: 'ACTIVE', to: 'DELETED' },
      },
    });
  });
});

describe('listTenants status filter', () => {
  beforeEach(() => prismaStub.tenant.findMany.mockResolvedValue([]));

  it('excludes DELETED by default', async () => {
    await tenantManagementService.listTenants();
    expect(prismaStub.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { not: 'DELETED' } } }),
    );
  });

  it('shows everything for "all"', async () => {
    await tenantManagementService.listTenants('all');
    expect(prismaStub.tenant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('filters to an exact status', async () => {
    await tenantManagementService.listTenants('DELETED');
    expect(prismaStub.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'DELETED' } }),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix backend test -- tenantManagement.service.test.ts -t "deleteTenant"`
Expected: FAIL — `deleteTenant` is not defined.

- [ ] **Step 3: Add `deleteTenant` and the `listTenants` filter**

In `backend/src/services/tenantManagement.service.ts`, add the `deleteTenant` method (after `setTenantStatus`):

```ts
  /**
   * Soft-delete a tenant: flips status to DELETED (no hard delete). The tenant
   * then resolves as 404 at the middleware and its child data is untouched, so a
   * later restore (setTenantStatus ACTIVE) brings everything back intact.
   */
  async deleteTenant(id: number, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id } });
      if (!tenant) {
        throw new AppError('Tenant not found', 404);
      }
      const updated = await tx.tenant.update({ where: { id }, data: { status: 'DELETED' } });
      await this.recordTenantAudit(tx, {
        action: 'TENANT_DELETED',
        targetTenantId: id,
        actor,
        detail: { from: tenant.status, to: 'DELETED' },
      });
      return updated;
    });
  }
```

Change the `listTenants` signature + `where` (currently line 45 `async listTenants(): Promise<TenantListItem[]> {` and the `findMany` at line 46):

```ts
  async listTenants(statusFilter?: string): Promise<TenantListItem[]> {
    let where: Prisma.TenantWhereInput = { status: { not: 'DELETED' } };
    if (statusFilter === 'all') {
      where = {};
    } else if (statusFilter === 'ACTIVE' || statusFilter === 'SUSPENDED' || statusFilter === 'DELETED') {
      where = { status: statusFilter };
    }

    const tenants = await this.prisma.tenant.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
```

(The `select { ... }` block and the `return tenants.map(...)` below it are unchanged — `status` is already selected and mapped.)

- [ ] **Step 4: Wire the controller + route**

In `backend/src/controllers/tenantManagement.controller.ts`, update `list` to read the query and add `remove`:

```ts
  async list(req: Request, res: Response): Promise<void> {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const tenants = await tenantManagementService.listTenants(status);
    res.json(successResponse(tenants));
  }
```

```ts
  async remove(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const tenant = await tenantManagementService.deleteTenant(id, getActor(req));
    res.json(successResponse({ tenant }));
  }
```

In `backend/src/routes/tenantManagement.routes.ts`, add after the status route (line 33):

```ts
router.delete(
  '/:id',
  authenticate,
  requireSuperAdmin,
  asyncHandler(tenantManagementController.remove.bind(tenantManagementController)),
);
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm --prefix backend test -- tenantManagement.service.test.ts && npm --prefix backend run build`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/tenantManagement.service.ts backend/src/controllers/tenantManagement.controller.ts backend/src/routes/tenantManagement.routes.ts backend/src/services/tenantManagement.service.test.ts
git commit -m "feat(phase3): soft-delete tenant endpoint + status-filtered list (hides DELETED by default)"
```

---

## Task 5: Update tenant name & plan

**Files:**
- Modify: `backend/src/services/tenantManagement.service.ts` (`updateTenant`)
- Modify: `backend/src/controllers/tenantManagement.controller.ts` (`update`)
- Modify: `backend/src/routes/tenantManagement.routes.ts` (add `PATCH /:id`)
- Test: `backend/src/services/tenantManagement.service.test.ts` (extend)

**Interfaces:**
- Produces:
  - `updateTenant(id: number, input: { name?: string; plan?: string | null }, actor: AuditActor)` → `{ id, slug, name, plan, status }`, audits `TENANT_UPDATED`.
  - Route `PATCH /admin/tenants/:id`, controller `update`.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/services/tenantManagement.service.test.ts`:

```ts
describe('updateTenant', () => {
  it('updates name and plan and records TENANT_UPDATED', async () => {
    tx.tenant.findUnique.mockResolvedValue({ id: 8, slug: 'acme', name: 'Old', plan: 'Free', status: 'ACTIVE' });
    tx.tenant.update.mockResolvedValue({ id: 8, slug: 'acme', name: 'New', plan: 'Pro', status: 'ACTIVE' });

    const result = await tenantManagementService.updateTenant(8, { name: 'New', plan: 'Pro' }, { username: 'root' });

    expect(tx.tenant.update).toHaveBeenCalledWith({ where: { id: 8 }, data: { name: 'New', plan: 'Pro' } });
    expect(result).toEqual({ id: 8, slug: 'acme', name: 'New', plan: 'Pro', status: 'ACTIVE' });
    expect(tx.tenantAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'TENANT_UPDATED', targetTenantId: 8, detail: { name: 'New', plan: 'Pro' } }) }),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix backend test -- tenantManagement.service.test.ts -t "updateTenant"`
Expected: FAIL — `updateTenant` is not defined.

- [ ] **Step 3: Implement `updateTenant`**

In `backend/src/services/tenantManagement.service.ts`, add (after `deleteTenant`):

```ts
  /**
   * Update mutable tenant profile fields (name, free-text plan). Only provided
   * fields change. Audits TENANT_UPDATED with the new values.
   */
  async updateTenant(
    id: number,
    input: { name?: string; plan?: string | null },
    actor: AuditActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id } });
      if (!tenant) {
        throw new AppError('Tenant not found', 404);
      }
      const data: { name?: string; plan?: string | null } = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.plan !== undefined) data.plan = input.plan;

      const updated = await tx.tenant.update({ where: { id }, data });
      await this.recordTenantAudit(tx, {
        action: 'TENANT_UPDATED',
        targetTenantId: id,
        actor,
        detail: { name: updated.name, plan: updated.plan },
      });
      return {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        plan: updated.plan,
        status: updated.status,
      };
    });
  }
```

- [ ] **Step 4: Wire the controller + route**

In `backend/src/controllers/tenantManagement.controller.ts`, add `update`:

```ts
  async update(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const { name, plan } = req.body;

    if (name === undefined && plan === undefined) {
      res.status(400).json({ error: { message: 'name or plan is required', code: 'BAD_REQUEST' } });
      return;
    }
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      res.status(400).json({ error: { message: 'name must be a non-empty string', code: 'BAD_REQUEST' } });
      return;
    }
    if (plan !== undefined && plan !== null && typeof plan !== 'string') {
      res.status(400).json({ error: { message: 'plan must be a string or null', code: 'BAD_REQUEST' } });
      return;
    }

    const tenant = await tenantManagementService.updateTenant(
      id,
      {
        name: typeof name === 'string' ? name.trim() : undefined,
        plan: typeof plan === 'string' ? plan.trim() : plan,
      },
      getActor(req),
    );
    res.json(successResponse({ tenant }));
  }
```

In `backend/src/routes/tenantManagement.routes.ts`, add after the `DELETE /:id` route:

```ts
router.patch(
  '/:id',
  authenticate,
  requireSuperAdmin,
  asyncHandler(tenantManagementController.update.bind(tenantManagementController)),
);
```

> Route order note: `PATCH /:id/status` (more specific) is registered before `PATCH /:id`, so Express matches the status route correctly; keep that ordering.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm --prefix backend test -- tenantManagement.service.test.ts && npm --prefix backend run build`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/tenantManagement.service.ts backend/src/controllers/tenantManagement.controller.ts backend/src/routes/tenantManagement.routes.ts backend/src/services/tenantManagement.service.test.ts
git commit -m "feat(phase3): edit tenant name/plan endpoint with TENANT_UPDATED audit"
```

---

## Task 6: Audit read endpoint

**Files:**
- Modify: `backend/src/services/tenantManagement.service.ts` (`getAuditLog` + `TenantAuditItem`)
- Modify: `backend/src/controllers/tenantManagement.controller.ts` (`audit`)
- Modify: `backend/src/routes/tenantManagement.routes.ts` (add `GET /audit`)
- Test: `backend/src/services/tenantManagement.service.test.ts` (extend)

**Interfaces:**
- Produces:
  - `getAuditLog(filter: { tenantId?: number; action?: string; limit?: number }): Promise<TenantAuditItem[]>` — newest-first, capped at 200.
  - Route `GET /admin/tenants/audit` (mounted under the tenants router; keeps one router/controller/test rather than a new `/api/admin/audit` mount).

> **Deviation from spec:** the spec named this `GET /admin/audit`. It is implemented as `GET /admin/tenants/audit` to avoid a second mount in `index.ts` and keep all tenant-management endpoints in one router. It is still a global, all-tenants feed (optional `tenantId` filter). The frontend calls this path.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/services/tenantManagement.service.test.ts`:

```ts
describe('getAuditLog', () => {
  it('queries newest-first with optional tenant + action filters and a capped limit', async () => {
    prismaStub.tenantAuditLog.findMany.mockResolvedValue([
      { id: 2, action: 'TENANT_DELETED', targetTenantId: 5, actorUserId: 1, actorUsername: 'root', requestId: 'r9', detail: { from: 'ACTIVE', to: 'DELETED' }, createdAt: new Date('2026-07-01') },
    ]);

    const rows = await tenantManagementService.getAuditLog({ tenantId: 5, action: 'TENANT_DELETED', limit: 500 });

    expect(prismaStub.tenantAuditLog.findMany).toHaveBeenCalledWith({
      where: { targetTenantId: 5, action: 'TENANT_DELETED' },
      orderBy: { createdAt: 'desc' },
      take: 200, // 500 clamped to the 200 cap
    });
    expect(rows[0]).toMatchObject({ id: 2, action: 'TENANT_DELETED', targetTenantId: 5, actorUsername: 'root' });
  });

  it('defaults to no filters and a 100 limit', async () => {
    prismaStub.tenantAuditLog.findMany.mockResolvedValue([]);
    await tenantManagementService.getAuditLog({});
    expect(prismaStub.tenantAuditLog.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix backend test -- tenantManagement.service.test.ts -t "getAuditLog"`
Expected: FAIL — `getAuditLog` is not defined.

- [ ] **Step 3: Implement `getAuditLog`**

In `backend/src/services/tenantManagement.service.ts`, add the interface near the others:

```ts
export interface TenantAuditItem {
  id: number;
  action: string;
  targetTenantId: number;
  actorUserId: number | null;
  actorUsername: string;
  requestId: string | null;
  detail: unknown;
  createdAt: Date;
}
```

Add the method (after `updateTenant`):

```ts
  /**
   * Read the platform audit log, newest first. Optional filters by target tenant
   * and action. Limit is clamped to 200 to keep the console feed bounded.
   */
  async getAuditLog(filter: { tenantId?: number; action?: string; limit?: number }): Promise<TenantAuditItem[]> {
    const where: Prisma.TenantAuditLogWhereInput = {};
    if (filter.tenantId !== undefined && !Number.isNaN(filter.tenantId)) {
      where.targetTenantId = filter.tenantId;
    }
    if (filter.action) {
      where.action = filter.action;
    }
    const rows = await this.prisma.tenantAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 100, 200),
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetTenantId: r.targetTenantId,
      actorUserId: r.actorUserId,
      actorUsername: r.actorUsername,
      requestId: r.requestId,
      detail: r.detail,
      createdAt: r.createdAt,
    }));
  }
```

- [ ] **Step 4: Wire the controller + route (register GET /audit before dynamic routes)**

In `backend/src/controllers/tenantManagement.controller.ts`, add `audit`:

```ts
  async audit(req: Request, res: Response): Promise<void> {
    const tenantId = req.query.tenantId !== undefined ? parseInt(String(req.query.tenantId), 10) : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const limit = req.query.limit !== undefined ? parseInt(String(req.query.limit), 10) : undefined;
    const items = await tenantManagementService.getAuditLog({ tenantId, action, limit });
    res.json(successResponse(items));
  }
```

In `backend/src/routes/tenantManagement.routes.ts`, add the audit route immediately after the `GET /` list route (line 19), so the static `/audit` path is registered before any `/:id`-style routes:

```ts
router.get(
  '/audit',
  authenticate,
  requireSuperAdmin,
  asyncHandler(tenantManagementController.audit.bind(tenantManagementController)),
);
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm --prefix backend test -- tenantManagement.service.test.ts && npm --prefix backend run build`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/tenantManagement.service.ts backend/src/controllers/tenantManagement.controller.ts backend/src/routes/tenantManagement.routes.ts backend/src/services/tenantManagement.service.test.ts
git commit -m "feat(phase3): tenant audit read endpoint (GET /admin/tenants/audit)"
```

---

## Task 7: Extend the SUPER_ADMIN route-gate integration test

**Files:**
- Modify: `backend/src/integration/tenantManagement.routes.test.ts` (add stubs + gate cases for the new routes)

**Interfaces:**
- Consumes: routes `GET /audit`, `PATCH /:id`, `DELETE /:id` (Tasks 4-6).

- [ ] **Step 1: Add controller stubs for the new handlers**

In `backend/src/integration/tenantManagement.routes.test.ts`, extend the `controllerStub` (lines 27-32) to include the new handlers:

```ts
const controllerStub = vi.hoisted(() => ({
  list: vi.fn((_req: any, res: any) => res.status(200).json({ data: [] })),
  create: vi.fn((_req: any, res: any) => res.status(201).json({ data: {} })),
  setStatus: vi.fn((_req: any, res: any) => res.status(200).json({ data: {} })),
  regenerateTokens: vi.fn((_req: any, res: any) => res.status(200).json({ data: {} })),
  update: vi.fn((_req: any, res: any) => res.status(200).json({ data: {} })),
  remove: vi.fn((_req: any, res: any) => res.status(200).json({ data: {} })),
  audit: vi.fn((_req: any, res: any) => res.status(200).json({ data: [] })),
}));
```

- [ ] **Step 2: Add gate cases for the new routes**

Add these `it` blocks. In the `unauthenticated requests` describe (after line 126):

```ts
    it('PATCH /:id → 401', async () => {
      const res = await call(server, 'PATCH', '/api/admin/tenants/1', { body: { name: 'X' } });
      expect(res.status).toBe(401);
      expect(controllerStub.update).not.toHaveBeenCalled();
    });

    it('DELETE /:id → 401', async () => {
      const res = await call(server, 'DELETE', '/api/admin/tenants/1');
      expect(res.status).toBe(401);
      expect(controllerStub.remove).not.toHaveBeenCalled();
    });

    it('GET /audit → 401', async () => {
      const res = await call(server, 'GET', '/api/admin/tenants/audit');
      expect(res.status).toBe(401);
      expect(controllerStub.audit).not.toHaveBeenCalled();
    });
```

In the `ADMIN (per-tenant) rejected with 403` describe (after line 164):

```ts
    it('PATCH /:id → 403, controller NOT reached', async () => {
      const res = await call(server, 'PATCH', '/api/admin/tenants/1', { roles: ['ADMIN'], body: { name: 'X' } });
      expect(res.status).toBe(403);
      expect(controllerStub.update).not.toHaveBeenCalled();
    });

    it('DELETE /:id → 403, controller NOT reached', async () => {
      const res = await call(server, 'DELETE', '/api/admin/tenants/1', { roles: ['ADMIN'] });
      expect(res.status).toBe(403);
      expect(controllerStub.remove).not.toHaveBeenCalled();
    });

    it('GET /audit → 403, controller NOT reached', async () => {
      const res = await call(server, 'GET', '/api/admin/tenants/audit', { roles: ['ADMIN'] });
      expect(res.status).toBe(403);
      expect(controllerStub.audit).not.toHaveBeenCalled();
    });
```

In the `SUPER_ADMIN passes all gates and reaches controller` describe (after line 200):

```ts
    it('PATCH /:id → 200, controller.update called', async () => {
      const res = await call(server, 'PATCH', '/api/admin/tenants/1', { roles: ['SUPER_ADMIN'], body: { name: 'X' } });
      expect(res.status).toBe(200);
      expect(controllerStub.update).toHaveBeenCalledOnce();
    });

    it('DELETE /:id → 200, controller.remove called', async () => {
      const res = await call(server, 'DELETE', '/api/admin/tenants/1', { roles: ['SUPER_ADMIN'] });
      expect(res.status).toBe(200);
      expect(controllerStub.remove).toHaveBeenCalledOnce();
    });

    it('GET /audit → 200, controller.audit called', async () => {
      const res = await call(server, 'GET', '/api/admin/tenants/audit', { roles: ['SUPER_ADMIN'] });
      expect(res.status).toBe(200);
      expect(controllerStub.audit).toHaveBeenCalledOnce();
    });
```

- [ ] **Step 3: Run the integration test**

Run: `npm --prefix backend test -- tenantManagement.routes.test.ts`
Expected: PASS — all new routes reject unauth (401), reject per-tenant ADMIN (403), and reach the controller for SUPER_ADMIN.

- [ ] **Step 4: Commit**

```bash
git add backend/src/integration/tenantManagement.routes.test.ts
git commit -m "test(phase3): gate-test new update/delete/audit tenant routes for SUPER_ADMIN"
```

---

## Task 8: Frontend `isSuperAdmin` helper + tenant API client

**Files:**
- Modify: `web/src/utils/roles.js` (add `isSuperAdmin`)
- Modify: `web/src/services/tenantApi.js` (status-filtered list, update, delete, audit; fix comment)
- Test: `web/src/utils/roles.test.js` (create or extend)

**Interfaces:**
- Produces:
  - `isSuperAdmin(user) => boolean`
  - `listTenants(status?)`, `updateTenant(id, body)`, `deleteTenant(id)`, `getTenantAudit({ tenantId, action })`, plus existing `createTenant`, `setTenantStatus`, `regenerateTokens`.

- [ ] **Step 1: Write the failing helper test**

Create `web/src/utils/roles.test.js` (or append if it exists):

```js
import { describe, it, expect } from 'vitest';
import { isSuperAdmin, ROLES } from './roles';

describe('isSuperAdmin', () => {
  it('is true when the user has the SUPER_ADMIN role', () => {
    expect(isSuperAdmin({ roles: [ROLES.ADMIN, ROLES.SUPER_ADMIN] })).toBe(true);
  });
  it('is false for a plain admin', () => {
    expect(isSuperAdmin({ roles: [ROLES.ADMIN] })).toBe(false);
  });
  it('is false for null/undefined', () => {
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web test -- roles.test.js`
Expected: FAIL — `isSuperAdmin` is not exported.

- [ ] **Step 3: Add the helper**

In `web/src/utils/roles.js`, add after `hasAnyRole` (line 32):

```js
export const isSuperAdmin = (user) => getUserRoles(user).includes(ROLES.SUPER_ADMIN);
```

- [ ] **Step 4: Expand the tenant API client**

Replace the contents of `web/src/services/tenantApi.js` with:

```js
import { get, post, patch, del } from './api';

// Platform (super-admin) tenant management API. Mounted at /api/admin/tenants on
// the backend (requires authenticate + SUPER_ADMIN). The reportingToken /
// printAgentKey returned by createTenant and regenerateTokens are PLAINTEXT and
// shown ONCE.

export const listTenants = (status) =>
  get(`/admin/tenants${status ? `?status=${encodeURIComponent(status)}` : ''}`);

export const createTenant = (body) => post('/admin/tenants', body);

export const updateTenant = (id, body) => patch(`/admin/tenants/${id}`, body);

export const setTenantStatus = (id, status) =>
  patch(`/admin/tenants/${id}/status`, { status });

export const deleteTenant = (id) => del(`/admin/tenants/${id}`);

export const regenerateTokens = (id) =>
  post(`/admin/tenants/${id}/regenerate-tokens`);

export const getTenantAudit = ({ tenantId, action } = {}) => {
  const qs = new URLSearchParams();
  if (tenantId != null) qs.set('tenantId', String(tenantId));
  if (action) qs.set('action', action);
  const q = qs.toString();
  return get(`/admin/tenants/audit${q ? `?${q}` : ''}`);
};
```

- [ ] **Step 5: Run the helper test**

Run: `npm --prefix web test -- roles.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/utils/roles.js web/src/utils/roles.test.js web/src/services/tenantApi.js
git commit -m "feat(phase3): isSuperAdmin helper + expanded tenant API client (update/delete/audit)"
```

---

## Task 9: Scaffold the `/admin` console + relocate the tenant section

**Files:**
- Create: `web/src/features/admin/AdminConsolePage.jsx`
- Create: `web/src/features/admin/AdminConsolePage.css`
- Create: `web/src/features/admin/components/AdminConsoleSidebar.jsx`
- Create: `web/src/features/admin/components/AdminTenantsSection.jsx` (moved from website)
- Create: `web/src/features/admin/pages/AdminTenantsPage.jsx`
- Create: `web/src/features/admin/pages/AdminTenantsPage.test.jsx` (moved)
- Modify: `web/src/features/website/WebsiteManagementPage.css` (remove relocated `tenant-*` rules)
- Delete: `web/src/features/website/pages/TenantsPage.jsx`, `web/src/features/website/components/WebsiteTenantsSection.jsx`, `web/src/features/website/pages/TenantsPage.test.jsx` (removed in Task 10 once routes are repointed)

**Interfaces:**
- Consumes: `web/src/services/tenantApi.js` (Task 8), shared `dashboard-grid-*` / `sidebar-*` classes, `PageHeader`.
- Produces: `AdminConsolePage` (layout with `<Outlet/>`), `AdminConsoleSidebar`, `AdminTenantsSection`, `AdminTenantsPage`.

- [ ] **Step 1: Create the console layout page**

Create `web/src/features/admin/AdminConsolePage.jsx`:

```jsx
import { Outlet } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import AdminConsoleSidebar from './components/AdminConsoleSidebar';
import './AdminConsolePage.css';

export default function AdminConsolePage() {
  return (
    <div className="dashboard-grid-container">
      <PageHeader
        title="Admin Console"
        subtitle="Platform operations — manage every tenant"
        icon={ShieldCheck}
      />
      <div className="dashboard-grid-layout">
        <AdminConsoleSidebar />
        <main className="dashboard-grid-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the console sidebar**

Create `web/src/features/admin/components/AdminConsoleSidebar.jsx`:

```jsx
import { NavLink } from 'react-router-dom';
import { Building2, Activity } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/admin/tenants', icon: Building2, label: 'Tenants' },
  { to: '/admin/activity', icon: Activity, label: 'Activity' },
];

export default function AdminConsoleSidebar() {
  return (
    <nav className="sidebar-container" aria-label="Admin console">
      <div className="sidebar-nav">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Create the console CSS (base rules + relocated `tenant-*` block)**

Create `web/src/features/admin/AdminConsolePage.css`:

```css
/* Base card/form styling for admin console sections (mirrors the website-mgmt
   section base so the relocated tenant UI keeps its look). */
.admin-console-section { background: var(--bg-card); border-radius: var(--radius-md); padding: 1.5rem; margin-bottom: 1.5rem; }
.admin-console-section h2 { font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem; color: var(--text-primary); }
.admin-console-section h3 { font-size: 0.95rem; font-weight: 600; margin-bottom: 0.75rem; color: var(--text-primary); }
.admin-console-section .form-group { margin-bottom: 1rem; }
.admin-console-section label { display: block; font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.375rem; }
.admin-console-section input[type="text"],
.admin-console-section input[type="password"] { width: 100%; padding: 0.5rem 0.75rem; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); color: var(--text-primary); font-size: 0.9rem; }
.admin-console-section input[type="text"]:focus,
.admin-console-section input[type="password"]:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 2px var(--color-primary-bg-strong); }
.admin-console-section .save-btn { padding: 0.5rem 1.25rem; background: var(--color-primary); color: #fff; border: none; border-radius: var(--radius-md); cursor: pointer; font-size: 0.9rem; }
.admin-console-section .save-btn:hover { background: var(--color-primary-hover); }
.admin-console-section .save-btn-ghost { background: transparent; color: var(--color-primary); border: 1px solid var(--color-primary); }
.admin-console-section .save-btn-ghost:hover { background: var(--color-primary-bg); }
.admin-console-loading { padding: 2rem; text-align: center; color: var(--text-secondary); }

/* Tenant management (relocated from website-management) */
.tenant-error { padding: 0.75rem 1rem; margin-bottom: 1rem; border-radius: var(--radius-md); background: var(--color-danger-bg, rgba(220,38,38,0.12)); color: var(--color-danger, #dc2626); border-left: 3px solid var(--color-danger, #dc2626); font-size: 0.9rem; }
.tenant-create-form { margin-bottom: 1.5rem; }
.tenant-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
.tenant-toolbar { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }
.tenant-toolbar select { padding: 0.4rem 0.6rem; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); color: var(--text-primary); font-size: 0.85rem; }
.tenant-table-wrap { overflow-x: auto; }
.tenant-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.tenant-table th, .tenant-table td { text-align: left; padding: 0.625rem 0.75rem; border-bottom: 1px solid var(--border-color); color: var(--text-primary); vertical-align: middle; }
.tenant-table th { color: var(--text-secondary); font-weight: 600; }
.tenant-empty { padding: 1rem; color: var(--text-secondary); }
.tenant-badge { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
.tenant-badge-active { background: var(--color-success-bg, rgba(16,185,129,0.15)); color: var(--color-success, #10b981); }
.tenant-badge-suspended { background: var(--color-danger-bg, rgba(220,38,38,0.12)); color: var(--color-danger, #dc2626); }
.tenant-badge-deleted { background: var(--bg-secondary); color: var(--text-secondary); }
.tenant-token-presence { color: var(--text-secondary); font-size: 0.8rem; }
.tenant-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.tenant-token-panel { position: relative; padding: 1rem 1.25rem; margin-bottom: 1.5rem; border-radius: var(--radius-md); background: var(--bg-secondary); border: 2px solid var(--color-primary); }
.tenant-token-warning { display: flex; align-items: center; gap: 0.5rem; color: var(--color-danger, #dc2626); margin-bottom: 0.5rem; }
.tenant-token-title { font-weight: 600; color: var(--text-primary); margin-bottom: 0.75rem; }
.tenant-token-dismiss { position: absolute; top: 0.5rem; right: 0.5rem; background: transparent; border: none; color: var(--text-secondary); cursor: pointer; }
.tenant-token-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
.tenant-token-row label { min-width: 120px; color: var(--text-secondary); font-size: 0.8rem; margin: 0; }
.tenant-token-value { flex: 1; min-width: 200px; padding: 0.4rem 0.6rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); color: var(--text-primary); font-family: monospace; font-size: 0.85rem; word-break: break-all; }
.tenant-copy-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.7rem; background: var(--color-primary); color: #fff; border: none; border-radius: var(--radius-md); cursor: pointer; font-size: 0.8rem; }

/* Activity feed */
.activity-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.activity-table th, .activity-table td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-color); color: var(--text-primary); }
.activity-table th { color: var(--text-secondary); font-weight: 600; }
.activity-action { font-weight: 600; }
.activity-detail { color: var(--text-secondary); font-size: 0.8rem; }
```

- [ ] **Step 4: Create the relocated tenant section (verbatim move + two edits)**

Create `web/src/features/admin/components/AdminTenantsSection.jsx` with the **exact contents** of `web/src/features/website/components/WebsiteTenantsSection.jsx`, with these two changes:
1. Replace the top comment (lines 10-11) with: `// Platform tenant management — SUPER_ADMIN only. Lives in the /admin console.`
2. Rename the default export function `WebsiteTenantsSection` → `AdminTenantsSection`, and change the root wrapper `className="website-mgmt-section tenants-section"` → `className="admin-console-section tenants-section"`, and the loading `className="website-mgmt-loading"` → `className="admin-console-loading"`.

The import path `../../../services/tenantApi` is unchanged (same directory depth). (Task 11 replaces this file with the enhanced version — for now it is a straight move so the relocation is independently testable.)

- [ ] **Step 5: Create the page wrapper**

Create `web/src/features/admin/pages/AdminTenantsPage.jsx`:

```jsx
import AdminTenantsSection from '../components/AdminTenantsSection';

export default function AdminTenantsPage() {
  return <AdminTenantsSection />;
}
```

- [ ] **Step 6: Move the test (future-proofed for the router + new API fns)**

Create `web/src/features/admin/pages/AdminTenantsPage.test.jsx` with the contents of `web/src/features/website/pages/TenantsPage.test.jsx`, with these changes (the extra mocked fns and the router wrapper are harmless now and let Task 11 be purely additive):

1. Change the component import to `import AdminTenantsPage from './AdminTenantsPage';` and add `import { MemoryRouter } from 'react-router-dom';` at the top.
2. Extend the mock factory (lines 7-12 of the source) to include the new API functions:

```js
vi.mock('../../../services/tenantApi', () => ({
  listTenants: vi.fn(),
  createTenant: vi.fn(),
  updateTenant: vi.fn(),
  setTenantStatus: vi.fn(),
  deleteTenant: vi.fn(),
  regenerateTokens: vi.fn(),
  getTenantAudit: vi.fn(),
}));
```

3. Add a render helper just below `SAMPLE` and replace every `render(<TenantsPage />)` call with `renderPage()`:

```js
const renderPage = () => render(<MemoryRouter><AdminTenantsPage /></MemoryRouter>);
```

4. Rename the top-level `describe('TenantsPage', ...)` → `describe('AdminTenantsPage', ...)`. The mock path stays `../../../services/tenantApi` (same directory depth).

- [ ] **Step 7: Remove the relocated `tenant-*` rules from the website CSS**

In `web/src/features/website/WebsiteManagementPage.css`, delete lines 20-43 (the `/* Tenant management ... */` comment through `.tenant-copy-btn`). Leave lines 1-19 (including `.section-moved-notice`, used in Task 10) intact.

- [ ] **Step 8: Run the moved page test**

Run: `npm --prefix web test -- AdminTenantsPage.test.jsx`
Expected: PASS — the relocated section renders and drives the same list/create/token/status flows the original test covered.

- [ ] **Step 9: Commit**

```bash
git add web/src/features/admin web/src/features/website/WebsiteManagementPage.css
git commit -m "feat(phase3): scaffold /admin console feature + relocate tenant section"
```

---

## Task 10: Wire `/admin` routing, redirect, sidebar + nav entry point

**Files:**
- Modify: `web/src/App.jsx` (import console pages; add `/admin` route group; add backward-compat redirect; drop the tenants leaf from `/website-management`)
- Modify: `web/src/features/website/components/WebsiteManagementSidebar.jsx` (remove the Tenants item)
- Modify: `web/src/components/layout/AdminDropdown.jsx` (add a SUPER_ADMIN "Admin Console" entry + `/admin` in `ACTIVE_PATHS`)
- Modify: `web/src/components/layout/Navbar.jsx` (compute `isSuperAdmin`, pass to the dropdown)
- Delete: `web/src/features/website/pages/TenantsPage.jsx`, `web/src/features/website/components/WebsiteTenantsSection.jsx`, `web/src/features/website/pages/TenantsPage.test.jsx`

**Interfaces:**
- Consumes: `AdminConsolePage`, `AdminTenantsPage` (Task 9); `isSuperAdmin` (Task 8).

- [ ] **Step 1: Import the console pages and lazy Activity page in App.jsx**

In `web/src/App.jsx`, replace the TEMPORARY tenant import block (lines 45-49):

```jsx
import StoresPage from './features/website/pages/StoresPage';
import AdminConsolePage from './features/admin/AdminConsolePage';
import AdminTenantsPage from './features/admin/pages/AdminTenantsPage';
import AdminActivityPage from './features/admin/pages/AdminActivityPage';
```

> `AdminActivityPage` is created in Task 12. If executing strictly in order and Task 12 is not yet done, create a one-line placeholder `web/src/features/admin/pages/AdminActivityPage.jsx` exporting `export default function AdminActivityPage() { return null; }` and replace it in Task 12. (Recommended: do Task 12 before running the app.)

- [ ] **Step 2: Add the `/admin` route group + backward-compat redirect**

In `web/src/App.jsx`, replace the `tenants` leaf inside `/website-management` (lines 206-211) with just a redirect note removed — i.e. delete those 6 lines so the block becomes:

```jsx
            <Route path="delivery" element={<DeliveryPage />} />
            {/* Store management — per-tenant-admin (ADMIN role, not SUPER_ADMIN). */}
            <Route path="stores" element={<StoresPage />} />
          </Route>
```

Then, immediately after the closing `</Route>` of the `/website-management` group (after line 214), add:

```jsx
          {/* Platform super-admin console — cross-tenant, SUPER_ADMIN only. */}
          <Route path="/admin" element={
            <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
              <AdminConsolePage />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="tenants" replace />} />
            <Route path="tenants" element={<AdminTenantsPage />} />
            <Route path="activity" element={<AdminActivityPage />} />
          </Route>

          {/* Backward-compat: tenant management moved out of website-management. */}
          <Route path="/website-management/tenants" element={<Navigate to="/admin/tenants" replace />} />
```

- [ ] **Step 3: Remove the Tenants item from the website sidebar**

In `web/src/features/website/components/WebsiteManagementSidebar.jsx`, delete the `Tenants` nav item (lines 15-17, the two-line comment + the `superAdminOnly` entry). Since no `superAdminOnly` items remain, also simplify the component: remove the now-unused `useApp`, `getUserRoles`, `ROLES` imports and the `isSuperAdmin`/`items` filtering, mapping directly over `NAV_ITEMS`:

```jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { Globe, Palette, Image, Heart, Info, CreditCard, Truck, Store } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/website-management/identity', icon: Globe, label: 'Store Identity' },
  { to: '/website-management/colors', icon: Palette, label: 'Brand Colors' },
  { to: '/website-management/hero', icon: Image, label: 'Hero Image' },
  { to: '/website-management/favicon', icon: Heart, label: 'Favicon & Assets' },
  { to: '/website-management/info', icon: Info, label: 'Store Info' },
  { to: '/website-management/payment', icon: CreditCard, label: 'Payment Settings' },
  { to: '/website-management/delivery', icon: Truck, label: 'Delivery Settings' },
  { to: '/website-management/stores', icon: Store, label: 'Stores' },
];

function WebsiteManagementSidebar() {
  return (
    <nav className="sidebar-container" aria-label="Website management">
      <div className="sidebar-nav">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default WebsiteManagementSidebar;
```

- [ ] **Step 4: Add the "Admin Console" entry to the management dropdown**

In `web/src/components/layout/AdminDropdown.jsx`:
- Add `/admin` to `ACTIVE_PATHS` (line 6): `const ACTIVE_PATHS = ['/dashboard', '/users', '/rejected-users', '/order-history', '/store-credit', '/website-management', '/admin'];`
- Add `ShieldCheck` to the lucide import (line 3).
- Accept an `isSuperAdmin` prop: change the signature (line 8) to `function AdminDropdown({ isAdmin, isSuperAdmin, variant = 'desktop' }) {`.
- Add a menu item after the Website Management item (after line 58), gated on `isSuperAdmin`:

```jsx
      {isSuperAdmin && (
        <button type="button" onClick={() => go('/admin/tenants')} className={`admin-menu-item ${location.pathname.startsWith('/admin') ? 'admin-menu-item-active' : ''}`}>
          <ShieldCheck size={16} /><span>Admin Console</span>
        </button>
      )}
```

- [ ] **Step 5: Compute and pass `isSuperAdmin` in the Navbar**

In `web/src/components/layout/Navbar.jsx`:
- Import the helper: add `isSuperAdmin` to the existing `../../utils/roles` import (or add `import { isSuperAdmin } from '../../utils/roles';` if roles are imported from there).
- Where role booleans are computed (around line 47-57), add: `const superAdmin = isSuperAdmin(currentUser);`
- Where `<AdminDropdown ... />` is rendered (around line 171, and its mobile mirror if present), pass the prop: `<AdminDropdown isAdmin={isAdmin} isSuperAdmin={superAdmin} variant="desktop" />` (and the mobile variant similarly). Keep the existing `isManagement` gate on whether the dropdown renders at all; a SUPER_ADMIN is also management/admin, so it will render.

> If a pure SUPER_ADMIN might lack MANAGEMENT/ADMIN and the dropdown is gated by `isManagement`, also OR-in `superAdmin` at the dropdown render guard: `{(isManagement || superAdmin) && <AdminDropdown ... />}`. Verify the exact guard at `Navbar.jsx:171` and widen it to include `superAdmin`.

- [ ] **Step 6: Delete the old website tenant files**

```bash
git rm web/src/features/website/pages/TenantsPage.jsx web/src/features/website/components/WebsiteTenantsSection.jsx web/src/features/website/pages/TenantsPage.test.jsx
```

- [ ] **Step 7: Lint + run the frontend test suite**

Run: `npm --prefix web run lint && npm --prefix web test -- AdminTenantsPage.test.jsx roles.test.js`
Expected: lint clean (no unused imports left behind in the edited files); tests PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/App.jsx web/src/features/website/components/WebsiteManagementSidebar.jsx web/src/components/layout/AdminDropdown.jsx web/src/components/layout/Navbar.jsx
git commit -m "feat(phase3): route + nav the /admin console, redirect old tenants link, drop website tenants leaf"
```

---

## Task 11: Console affordances — edit, delete, restore, status filter

**Files:**
- Modify: `web/src/features/admin/components/AdminTenantsSection.jsx` (full replacement)
- Test: `web/src/features/admin/pages/AdminTenantsPage.test.jsx` (extend)

**Interfaces:**
- Consumes: `listTenants(status)`, `updateTenant`, `deleteTenant`, `setTenantStatus`, `regenerateTokens`, `createTenant` (Task 8); `useNavigate` for the Activity deep-link.

- [ ] **Step 1: Write failing tests for the new affordances**

Append these `it` blocks inside the `describe('AdminTenantsPage', ...)` in `web/src/features/admin/pages/AdminTenantsPage.test.jsx`. They reuse the file's existing `screen`, `SAMPLE` (a single ACTIVE tenant with `id: 't1'`), `renderPage()` helper (Task 9), and the `beforeEach` that sets `listTenants` → `SAMPLE`:

```jsx
  it('soft-deletes a tenant via the Delete action (after confirm)', async () => {
    vi.mocked(tenantApi.deleteTenant).mockResolvedValue({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();
    await screen.findByText('acme');
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));

    await waitFor(() => expect(tenantApi.deleteTenant).toHaveBeenCalledWith('t1'));
  });

  it('reloads with a status filter when the filter changes', async () => {
    renderPage();
    await waitFor(() => expect(tenantApi.listTenants).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'DELETED' } });

    await waitFor(() => expect(tenantApi.listTenants).toHaveBeenCalledWith('DELETED'));
  });

  it('shows Restore for a DELETED tenant and reactivates it', async () => {
    vi.mocked(tenantApi.listTenants).mockResolvedValue([{ ...SAMPLE[0], status: 'DELETED' }]);
    vi.mocked(tenantApi.setTenantStatus).mockResolvedValue({});

    renderPage();
    await screen.findByText('DELETED');
    fireEvent.click(screen.getByRole('button', { name: /Restore/i }));

    await waitFor(() => expect(tenantApi.setTenantStatus).toHaveBeenCalledWith('t1', 'ACTIVE'));
  });

  it('edits name/plan via updateTenant', async () => {
    vi.mocked(tenantApi.updateTenant).mockResolvedValue({});
    renderPage();
    await screen.findByText('acme');

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));
    fireEvent.change(screen.getByLabelText(/Edit name/i), { target: { value: 'Acme Renamed' } });
    fireEvent.change(screen.getByLabelText(/Edit plan/i), { target: { value: 'enterprise' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(tenantApi.updateTenant).toHaveBeenCalledWith('t1', { name: 'Acme Renamed', plan: 'enterprise' }));
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web test -- AdminTenantsPage.test.jsx -t "status filter"`
Expected: FAIL — there is no status filter control, Delete, Restore, or inline Edit yet in the relocated (straight-move) section.

- [ ] **Step 3: Replace `AdminTenantsSection.jsx` with the enhanced version**

Overwrite `web/src/features/admin/components/AdminTenantsSection.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, X, AlertTriangle, Activity } from 'lucide-react';
import {
  listTenants,
  createTenant,
  updateTenant,
  setTenantStatus,
  deleteTenant,
  regenerateTokens,
} from '../../../services/tenantApi';

// Platform tenant management — SUPER_ADMIN only. Lives in the /admin console.

const EMPTY_FORM = { slug: '', name: '', plan: '', adminUsername: '', adminPassword: '' };
const STATUS_FILTERS = [
  { value: '', label: 'Active & suspended' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'DELETED', label: 'Deleted' },
  { value: 'all', label: 'All (incl. deleted)' },
];

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" className="tenant-copy-btn" onClick={onCopy} aria-label="Copy to clipboard">
      <Copy size={14} />
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

export default function AdminTenantsSection() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', plan: '' });

  const loadTenants = async (filter = statusFilter) => {
    setIsLoading(true);
    try {
      const data = await listTenants(filter || undefined);
      setTenants(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load tenants');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTenants(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const body = {
        slug: form.slug.trim(),
        name: form.name.trim(),
        adminUsername: form.adminUsername.trim(),
        adminPassword: form.adminPassword,
      };
      if (form.plan.trim()) body.plan = form.plan.trim();
      const result = await createTenant(body);
      setRevealed({
        title: `Tokens for ${result?.tenant?.slug || body.slug}`,
        reportingToken: result?.reportingToken,
        printAgentKey: result?.printAgentKey,
      });
      setForm(EMPTY_FORM);
      await loadTenants();
    } catch (err) {
      setError(err.message || 'Failed to create tenant');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (tenant) => {
    setError('');
    setBusyId(tenant.id);
    const next = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await setTenantStatus(tenant.id, next);
      await loadTenants();
    } catch (err) {
      setError(err.message || 'Failed to update status');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (tenant) => {
    if (!window.confirm(`Soft-delete "${tenant.slug}"? It will resolve as 404 but can be restored.`)) return;
    setError('');
    setBusyId(tenant.id);
    try {
      await deleteTenant(tenant.id);
      await loadTenants();
    } catch (err) {
      setError(err.message || 'Failed to delete tenant');
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (tenant) => {
    setError('');
    setBusyId(tenant.id);
    try {
      await setTenantStatus(tenant.id, 'ACTIVE');
      await loadTenants();
    } catch (err) {
      setError(err.message || 'Failed to restore tenant');
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (tenant) => {
    setEditId(tenant.id);
    setEditForm({ name: tenant.name || '', plan: tenant.plan || '' });
  };

  const saveEdit = async (tenant) => {
    setError('');
    setBusyId(tenant.id);
    try {
      await updateTenant(tenant.id, { name: editForm.name.trim(), plan: editForm.plan.trim() });
      setEditId(null);
      await loadTenants();
    } catch (err) {
      setError(err.message || 'Failed to update tenant');
    } finally {
      setBusyId(null);
    }
  };

  const handleRegenerate = async (tenant) => {
    setError('');
    setBusyId(tenant.id);
    try {
      const result = await regenerateTokens(tenant.id);
      setRevealed({
        title: `New tokens for ${tenant.slug}`,
        reportingToken: result?.reportingToken,
        printAgentKey: result?.printAgentKey,
      });
      await loadTenants();
    } catch (err) {
      setError(err.message || 'Failed to regenerate tokens');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="admin-console-section tenants-section">
      <h2>Tenants</h2>

      {error && <div className="tenant-error" role="alert">{error}</div>}

      {revealed && (
        <div className="tenant-token-panel" role="alert">
          <button type="button" className="tenant-token-dismiss" onClick={() => setRevealed(null)} aria-label="Dismiss tokens">
            <X size={16} />
          </button>
          <div className="tenant-token-warning">
            <AlertTriangle size={18} />
            <strong>Copy these now — they will not be shown again.</strong>
          </div>
          <p className="tenant-token-title">{revealed.title}</p>
          <div className="tenant-token-row">
            <label>Reporting token</label>
            <code className="tenant-token-value">{revealed.reportingToken}</code>
            <CopyButton value={revealed.reportingToken} />
          </div>
          <div className="tenant-token-row">
            <label>Print agent key</label>
            <code className="tenant-token-value">{revealed.printAgentKey}</code>
            <CopyButton value={revealed.printAgentKey} />
          </div>
        </div>
      )}

      <form className="tenant-create-form" onSubmit={handleCreate}>
        <h3>Create tenant</h3>
        <div className="tenant-form-grid">
          <div className="form-group">
            <label htmlFor="tenant-slug">Slug</label>
            <input id="tenant-slug" type="text" value={form.slug} onChange={handleField('slug')} required />
          </div>
          <div className="form-group">
            <label htmlFor="tenant-name">Name</label>
            <input id="tenant-name" type="text" value={form.name} onChange={handleField('name')} required />
          </div>
          <div className="form-group">
            <label htmlFor="tenant-plan">Plan (optional)</label>
            <input id="tenant-plan" type="text" value={form.plan} onChange={handleField('plan')} />
          </div>
          <div className="form-group">
            <label htmlFor="tenant-admin-username">Admin username</label>
            <input id="tenant-admin-username" type="text" value={form.adminUsername} onChange={handleField('adminUsername')} required />
          </div>
          <div className="form-group">
            <label htmlFor="tenant-admin-password">Admin password</label>
            <input id="tenant-admin-password" type="password" value={form.adminPassword} onChange={handleField('adminPassword')} required />
          </div>
        </div>
        <button type="submit" className="save-btn" disabled={creating}>
          {creating ? 'Creating…' : 'Create tenant'}
        </button>
      </form>

      <div className="tenant-toolbar">
        <label htmlFor="tenant-status-filter">Filter by status</label>
        <select id="tenant-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <div className="tenant-table-wrap">
        {isLoading ? (
          <p className="admin-console-loading">Loading tenants…</p>
        ) : tenants.length === 0 ? (
          <p className="tenant-empty">No tenants yet.</p>
        ) : (
          <table className="tenant-table">
            <thead>
              <tr>
                <th>Slug</th>
                <th>Name</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Tokens</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const isDeleted = t.status === 'DELETED';
                const isEditing = editId === t.id;
                return (
                  <tr key={t.id}>
                    <td>{t.slug}</td>
                    <td>
                      {isEditing ? (
                        <input type="text" aria-label="Edit name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                      ) : (
                        t.name
                      )}
                    </td>
                    <td>
                      <span className={`tenant-badge tenant-badge-${(t.status || '').toLowerCase()}`}>{t.status}</span>
                    </td>
                    <td>
                      {isEditing ? (
                        <input type="text" aria-label="Edit plan" value={editForm.plan} onChange={(e) => setEditForm((f) => ({ ...f, plan: e.target.value }))} />
                      ) : (
                        t.plan || '—'
                      )}
                    </td>
                    <td>
                      <span className="tenant-token-presence">
                        {t.hasReportingToken ? 'Reporting ✓' : 'Reporting ✗'}
                        {' · '}
                        {t.hasPrintKey ? 'Print ✓' : 'Print ✗'}
                      </span>
                    </td>
                    <td className="tenant-actions">
                      {isEditing ? (
                        <>
                          <button type="button" className="save-btn" onClick={() => saveEdit(t)} disabled={busyId === t.id}>Save</button>
                          <button type="button" className="save-btn save-btn-ghost" onClick={() => setEditId(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          {isDeleted ? (
                            <button type="button" className="save-btn save-btn-ghost" onClick={() => handleRestore(t)} disabled={busyId === t.id}>Restore</button>
                          ) : (
                            <>
                              <button type="button" className="save-btn save-btn-ghost" onClick={() => startEdit(t)} disabled={busyId === t.id}>Edit</button>
                              <button type="button" className="save-btn save-btn-ghost" onClick={() => handleToggleStatus(t)} disabled={busyId === t.id}>
                                {t.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                              </button>
                              <button type="button" className="save-btn save-btn-ghost" onClick={() => handleRegenerate(t)} disabled={busyId === t.id}>Regenerate tokens</button>
                              <button type="button" className="save-btn save-btn-ghost" onClick={() => handleDelete(t)} disabled={busyId === t.id}>Delete</button>
                            </>
                          )}
                          <button type="button" className="save-btn save-btn-ghost" onClick={() => navigate(`/admin/activity?tenant=${t.id}`)} aria-label={`Activity for ${t.slug}`}>
                            <Activity size={14} />
                            <span>Activity</span>
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the affordance tests**

Run: `npm --prefix web test -- AdminTenantsPage.test.jsx`
Expected: PASS — all four new cases pass (delete calls `deleteTenant('t1')`, filter calls `listTenants('DELETED')`, Restore calls `setTenantStatus('t1','ACTIVE')`, Save calls `updateTenant('t1', {...})`) AND the 7 original relocated tests still pass.

> `AdminTenantsSection` now uses `useNavigate`; the `renderPage()` helper added in Task 9 already wraps in `<MemoryRouter>`, so no per-test router wrapping is needed.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/admin/components/AdminTenantsSection.jsx web/src/features/admin/pages/AdminTenantsPage.test.jsx
git commit -m "feat(phase3): tenant console affordances — edit, delete, restore, status filter, activity link"
```

---

## Task 12: Activity page (global audit feed + per-tenant deep-link)

**Files:**
- Create: `web/src/features/admin/pages/AdminActivityPage.jsx`
- Create: `web/src/features/admin/components/AdminActivitySection.jsx`
- Test: `web/src/features/admin/pages/AdminActivityPage.test.jsx`

**Interfaces:**
- Consumes: `getTenantAudit({ tenantId, action })` (Task 8); `useSearchParams` for the `?tenant=` deep-link.

- [ ] **Step 1: Write the failing test**

Create `web/src/features/admin/pages/AdminActivityPage.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminActivityPage from './AdminActivityPage';

vi.mock('../../../services/tenantApi');

import { getTenantAudit } from '../../../services/tenantApi';

beforeEach(() => vi.clearAllMocks());

describe('AdminActivityPage', () => {
  it('loads the audit feed and passes the ?tenant= filter through', async () => {
    getTenantAudit.mockResolvedValue([
      { id: 1, action: 'TENANT_DELETED', targetTenantId: 5, actorUsername: 'root', detail: { from: 'ACTIVE', to: 'DELETED' }, createdAt: '2026-07-01T00:00:00Z' },
    ]);

    const { findByText } = render(
      <MemoryRouter initialEntries={['/admin/activity?tenant=5']}>
        <AdminActivityPage />
      </MemoryRouter>,
    );

    await findByText('TENANT_DELETED');
    await waitFor(() => expect(getTenantAudit).toHaveBeenCalledWith({ tenantId: '5', action: undefined }));
    await findByText('root');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web test -- AdminActivityPage.test.jsx`
Expected: FAIL — module not found (`AdminActivityPage`).

- [ ] **Step 3: Create the section component**

Create `web/src/features/admin/components/AdminActivitySection.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getTenantAudit } from '../../../services/tenantApi';

const ACTIONS = [
  '', 'TENANT_CREATED', 'TENANT_UPDATED', 'TENANT_SUSPENDED',
  'TENANT_RESTORED', 'TENANT_DELETED', 'TENANT_TOKENS_REGENERATED',
];

function describeDetail(detail) {
  if (!detail || typeof detail !== 'object') return '';
  if ('from' in detail && 'to' in detail) return `${detail.from} → ${detail.to}`;
  if ('plan' in detail || 'name' in detail) {
    return [detail.name && `name: ${detail.name}`, detail.plan && `plan: ${detail.plan}`].filter(Boolean).join(', ');
  }
  return '';
}

export default function AdminActivitySection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tenantParam = searchParams.get('tenant') || undefined;
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getTenantAudit({ tenantId: tenantParam, action: action || undefined })
      .then((data) => { if (!cancelled) { setRows(Array.isArray(data) ? data : []); setError(''); } })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load activity'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [tenantParam, action]);

  return (
    <div className="admin-console-section">
      <h2>Activity</h2>
      {error && <div className="tenant-error" role="alert">{error}</div>}

      <div className="tenant-toolbar">
        <label htmlFor="activity-action-filter">Action</label>
        <select id="activity-action-filter" value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTIONS.map((a) => <option key={a} value={a}>{a || 'All actions'}</option>)}
        </select>
        {tenantParam && (
          <button type="button" className="save-btn save-btn-ghost" onClick={() => setSearchParams({})}>
            Clear tenant filter (#{tenantParam})
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="admin-console-loading">Loading activity…</p>
      ) : rows.length === 0 ? (
        <p className="tenant-empty">No activity yet.</p>
      ) : (
        <table className="activity-table">
          <thead>
            <tr><th>When</th><th>Actor</th><th>Action</th><th>Tenant</th><th>Detail</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.actorUsername}</td>
                <td className="activity-action">{r.action}</td>
                <td>#{r.targetTenantId}</td>
                <td className="activity-detail">{describeDetail(r.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create the page wrapper**

Create (or overwrite the Task 10 placeholder) `web/src/features/admin/pages/AdminActivityPage.jsx`:

```jsx
import AdminActivitySection from '../components/AdminActivitySection';

export default function AdminActivityPage() {
  return <AdminActivitySection />;
}
```

- [ ] **Step 5: Run the Activity test**

Run: `npm --prefix web test -- AdminActivityPage.test.jsx`
Expected: PASS — the feed loads, forwards `{ tenantId: '5', action: undefined }`, and renders the row.

- [ ] **Step 6: Commit**

```bash
git add web/src/features/admin/pages/AdminActivityPage.jsx web/src/features/admin/components/AdminActivitySection.jsx web/src/features/admin/pages/AdminActivityPage.test.jsx
git commit -m "feat(phase3): admin console Activity page (global audit feed + per-tenant deep-link)"
```

---

## Task 13: Full verification + migration apply

**Files:** none (verification only)

- [ ] **Step 1: Apply the new migrations against the dev DB**

Ensure the dev stack is up, then:

Run: `docker exec smoke-station-delivery-backend npm run prisma:migrate`
Expected: both `20260701040000_tenant_status_deleted` and `20260701050000_add_tenant_audit_log` apply cleanly; `tenant_audit_log` table exists and `TenantStatus` has `DELETED`.

> If not running in Docker, run `npm --prefix backend run prisma:migrate` against the DB on host port `15432`.

- [ ] **Step 2: Backend — full suite + typecheck**

Run: `npm --prefix backend test && npm --prefix backend run build`
Expected: all backend tests PASS; `tsc` clean. Pay attention to `tenant.middleware.test.ts`, `tenantManagement.service.test.ts`, and `tenantManagement.routes.test.ts`.

- [ ] **Step 3: Frontend — full suite + lint**

Run: `npm --prefix web test && npm --prefix web run lint`
Expected: all web tests PASS (incl. `AdminTenantsPage.test.jsx`, `AdminActivityPage.test.jsx`, `roles.test.js`); ESLint clean (no unused imports left in `WebsiteManagementSidebar.jsx`, `Navbar.jsx`, `AdminDropdown.jsx`, `App.jsx`).

- [ ] **Step 4: Manual smoke (optional but recommended)**

With the dev stack up, as a `SUPER_ADMIN`:
- Visit `/admin` → redirects to `/admin/tenants`; the console renders with Tenants + Activity nav.
- Old link `/website-management/tenants` → redirects to `/admin/tenants`.
- Create a tenant → tokens revealed once; row appears.
- Edit name/plan; Suspend then Activate; Delete → row disappears from the default view; switch filter to "Deleted" → row shows with Restore; Restore → back to active.
- Open Activity → events appear newest-first; a tenant row's "Activity" link deep-links filtered to that tenant.

- [ ] **Step 5: Final commit (if any smoke fixes)**

```bash
git add -A
git commit -m "chore(phase3): verification pass for super-admin console + soft-delete lifecycle"
```

---

## Task 14: End-to-end lifecycle flow (Playwright, API-driven)

**Files:**
- Modify: `e2e/helpers/db.ts` (add `grantSuperAdmin`)
- Create: `e2e/flows/admin-tenant-console.spec.ts`

**Interfaces:**
- Consumes: real backend routes `POST/PATCH/DELETE /api/admin/tenants*`, `GET /api/admin/tenants/audit`, and the tenant middleware status gate (via `X-Tenant-Slug` header probes).
- Produces: `grantSuperAdmin(username: string): void` in `e2e/helpers/db.ts`.

This flow is fully `request`-driven (no browser storefront usage), matching `e2e/flows/admin-multi-store.spec.ts` so a transient/suspended tenant cannot disturb concurrent browser specs. It proves the whole lifecycle end-to-end through the real middleware: active→200, suspended→403, deleted→404, restore→200, plus the audit trail.

- [ ] **Step 1: Add the `grantSuperAdmin` DB helper**

In `e2e/helpers/db.ts`, add after `getDefaultTenantId` (line 71):

```ts
/**
 * Promote an existing user to SUPER_ADMIN (idempotent). Creates the SUPER_ADMIN
 * role if missing and grants it at storeId 0 (all-stores) for the user's tenant.
 * The user must log in AFTER this so their JWT carries the SUPER_ADMIN role.
 */
export function grantSuperAdmin(username: string): void {
  const safe = username.replace(/'/g, "''");
  execPsql(`INSERT INTO roles (name) VALUES ('SUPER_ADMIN') ON CONFLICT DO NOTHING`);
  execPsql(
    `INSERT INTO user_roles ("userId", "roleId", "tenantId", "storeId") ` +
    `SELECT u.id, r.id, u."tenantId", 0 FROM users u, roles r ` +
    `WHERE u.username = '${safe}' AND r.name = 'SUPER_ADMIN' ON CONFLICT DO NOTHING`,
  );
}
```

- [ ] **Step 2: Write the e2e spec**

Create `e2e/flows/admin-tenant-console.spec.ts`:

```ts
/**
 * e2e/flows/admin-tenant-console.spec.ts
 *
 * Phase 3 — Super-admin console + soft-delete lifecycle.
 * API-driven (no storefront browser usage). Proves, through the REAL tenant
 * middleware, that a tenant's lifecycle status changes its resolution:
 *   ACTIVE → 200, SUSPENDED → 403, DELETED → 404, restore → 200,
 * and that every action is recorded in the audit log.
 */

import { test, expect, request } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import { grantSuperAdmin } from '../helpers/db';

const API = 'http://localhost:3000';

async function login(username: string, password: string): Promise<string> {
  const ctx = await request.newContext({ baseURL: API });
  const res = await ctx.post('/api/auth/login', { data: { username, password } });
  expect(res.ok(), `login ${username} → ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const token = body?.data?.token ?? body?.token;
  expect(token, 'login returned a token').toBeTruthy();
  await ctx.dispose();
  return token;
}

// Probe a tenant-scoped public endpoint with the X-Tenant-Slug override so the
// middleware resolves THIS tenant and applies its status gate.
async function probeStatus(slug: string): Promise<number> {
  const ctx = await request.newContext({ baseURL: API });
  const res = await ctx.get('/api/products', { headers: { 'X-Tenant-Slug': slug } });
  await ctx.dispose();
  return res.status();
}

test.describe('super-admin tenant lifecycle', () => {
  let token: string;
  let auth: Record<string, string>;
  let tenantId: number;
  const slug = `e2e-${Date.now()}`;

  test.beforeAll(async () => {
    grantSuperAdmin(ACCOUNTS.admin.username);
    token = await login(ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    auth = { Authorization: `Bearer ${token}` };
  });

  test('create → suspend(403) → restore(200) → delete(404) → restore(200) with audit trail', async () => {
    const ctx = await request.newContext({ baseURL: API, extraHTTPHeaders: auth });

    // Create
    const created = await ctx.post('/api/admin/tenants', {
      data: { slug, name: 'E2E Co', plan: 'starter', adminUsername: `${slug}-admin`, adminPassword: 'secret123' },
    });
    expect(created.status(), 'create → 201').toBe(201);
    tenantId = (await created.json()).data.tenant.id;
    expect(await probeStatus(slug)).toBe(200); // ACTIVE

    // Suspend → 403
    expect((await ctx.patch(`/api/admin/tenants/${tenantId}/status`, { data: { status: 'SUSPENDED' } })).status()).toBe(200);
    expect(await probeStatus(slug)).toBe(403);

    // Restore → 200
    expect((await ctx.patch(`/api/admin/tenants/${tenantId}/status`, { data: { status: 'ACTIVE' } })).status()).toBe(200);
    expect(await probeStatus(slug)).toBe(200);

    // Update name/plan
    expect((await ctx.patch(`/api/admin/tenants/${tenantId}`, { data: { name: 'E2E Renamed', plan: 'pro' } })).status()).toBe(200);

    // Soft-delete → 404 (indistinguishable from unknown)
    expect((await ctx.delete(`/api/admin/tenants/${tenantId}`)).status()).toBe(200);
    expect(await probeStatus(slug)).toBe(404);

    // Deleted tenant is hidden from the default list, visible with ?status=DELETED
    const defaultList = (await (await ctx.get('/api/admin/tenants')).json()).data;
    expect(defaultList.some((t: any) => t.id === tenantId)).toBe(false);
    const deletedList = (await (await ctx.get('/api/admin/tenants?status=DELETED')).json()).data;
    expect(deletedList.some((t: any) => t.id === tenantId)).toBe(true);

    // Restore from deleted → 200
    expect((await ctx.patch(`/api/admin/tenants/${tenantId}/status`, { data: { status: 'ACTIVE' } })).status()).toBe(200);
    expect(await probeStatus(slug)).toBe(200);

    // Audit trail records every action, newest-first
    const audit = (await (await ctx.get(`/api/admin/tenants/audit?tenantId=${tenantId}`)).json()).data;
    const actions = audit.map((r: any) => r.action);
    for (const a of ['TENANT_CREATED', 'TENANT_SUSPENDED', 'TENANT_RESTORED', 'TENANT_UPDATED', 'TENANT_DELETED']) {
      expect(actions, `audit contains ${a}`).toContain(a);
    }
    expect(audit[0].actorUsername).toBe(ACCOUNTS.admin.username);

    await ctx.dispose();
  });

  test('a regular ADMIN cannot reach the console', async () => {
    // A fresh manager token (no SUPER_ADMIN) must be rejected at requireSuperAdmin.
    const mgr = await login(ACCOUNTS.manager.username, ACCOUNTS.manager.password);
    const ctx = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer ${mgr}` } });
    expect((await ctx.get('/api/admin/tenants')).status()).toBe(403);
    await ctx.dispose();
  });
});
```

> Endpoint/path assumptions to verify against the running app while implementing: the login route (`POST /api/auth/login`) and its response envelope (`data.token`), and that `GET /api/products` is a tenant-scoped route that returns 200 for an active tenant with no catalog. If the login path or product route differs, adjust to the real ones (check `backend/src/index.ts` route mounts) — keep the status-code assertions.

- [ ] **Step 3: Run the e2e flow**

Ensure the dev stack is up and migrated (Task 13 Step 1), then:

Run: `npm run test:e2e -- admin-tenant-console`
Expected: PASS — the lifecycle status codes (200/403/200/404/200) hold through the real middleware, the audit trail contains all five actions, and a non-super-admin gets 403.

- [ ] **Step 4: Commit**

```bash
git add e2e/helpers/db.ts e2e/flows/admin-tenant-console.spec.ts
git commit -m "test(phase3): e2e tenant lifecycle flow (active/suspend/delete/restore + audit)"
```

---

## Self-Review notes (author)

- **Spec coverage:** DELETED enum + 404 (Task 1) ✓; audit table + unscoped registration (Task 2) ✓; actor threading + audit on create/suspend/restore/regenerate (Task 3) ✓; soft-delete + list filter (Task 4) ✓; edit name/plan (Task 5) ✓; audit read endpoint (Task 6) ✓; SUPER_ADMIN gate tests (Task 7) ✓; isSuperAdmin + API client (Task 8) ✓; console scaffold + relocation (Task 9) ✓; routing/redirect/nav (Task 10) ✓; affordances (Task 11) ✓; Activity page (Task 12) ✓; verification + migration apply (Task 13) ✓. Non-goals (plan tiers, branding, subdomain DNS/TLS, self-service, extra seeding) intentionally untouched.
- **Deviation:** audit read is `GET /admin/tenants/audit` (single router) rather than the spec's `GET /admin/audit`; documented in Task 6. Frontend matches.
- **Type consistency:** `AuditActor`, `recordTenantAudit`, `getActor`, `listTenants(statusFilter?)`, `deleteTenant`, `updateTenant`, `getAuditLog`, `getTenantAudit`, `isSuperAdmin` names are used identically across tasks.
- **Ordering caveat:** `AdminActivityPage` is imported in Task 10 but created in Task 12 — Task 10 Step 1 notes the placeholder. If executing with subagents strictly in order, keep the placeholder until Task 12.
