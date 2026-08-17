# Multi-Tenancy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three highest-priority gaps left by the Phase-1 multi-tenancy foundation: two latent isolation bugs, the missing media (upload) isolation, and the missing Demo tenant seed.

**Architecture:** Isolation is enforced by a Prisma Client Extension that reads an `AsyncLocalStorage` tenant context and injects `tenantId`/`storeId` into every scoped query (`backend/src/config/database.ts`). This plan (A) makes that extension fail-closed in CI/test, not just production, and replaces a hardcoded default-tenant id with a value resolved at boot; (B) routes uploaded files into per-tenant directories and serves/lists them through a tenant guard; (C) adds an idempotent Demo-tenant seed that produces a fully isolated sandbox.

**Tech Stack:** Node + Express + TypeScript, Prisma (Postgres 16), Vitest. Files generated to `backend/generated/prisma`. Tests run from `backend/` against a real Postgres reachable as `db:5432` in-container.

## Global Constraints

- All work happens in `backend/`. Run tests with `cd backend && npx vitest run <path>`. Use Vitest (`describe/it/expect`, `vi.mock`/`vi.fn`).
- Prisma client + enums import from `../../generated/prisma` (NOT `@prisma/client`). The default export of `src/config/database.ts` is the **tenant-scoped** client; `getUnscopedPrisma()` returns the raw client; `getTenantPrisma()` returns the scoped client explicitly.
- Tenant context type is `{ tenantId: number; storeId: number | null; scope: 'tenant' | 'super-admin' }` from `src/config/tenantContext.ts`. Enter context with `runWithTenant(ctx, fn)`.
- Integration tests that touch the DB require migrations already applied; follow the existing pattern in `src/integration/tenantIsolation.test.ts` (create tenants via `getUnscopedPrisma()`, exercise scoped reads via `runWithTenant` + `getTenantPrisma()`).
- The default tenant has `slug = 'app'`. Its numeric `id` is NOT guaranteed to be `1`.
- Commits go on the `feature/multi-tenant` branch. One commit per task minimum.
- Do not introduce Postgres RLS — isolation stays ORM-first by design.

---

## File Structure

**New files:**
- `backend/src/config/defaultTenant.ts` — process-cached default-tenant id (`setDefaultTenantId`/`getDefaultTenantId`). Single source of truth for the grace-path mapping.
- `backend/src/config/defaultTenant.test.ts` — unit test for the cache.
- `backend/prisma/seed-demo.ts` — idempotent Demo-tenant seed.
- `backend/src/integration/demoSeed.test.ts` — asserts the Demo seed produces isolated data.
- (upload serve-guard is covered by a pure unit test added to `backend/src/utils/fileUtils.test.ts` — no new file, no supertest.)

**Modified files:**
- `backend/src/config/database.ts` — fail-closed scoping in `test` as well as `production`.
- `backend/src/config/verifyDefaultTenant.ts` — populate the default-tenant id cache at boot.
- `backend/src/middleware/auth.middleware.ts` — grace path uses `getDefaultTenantId()` instead of literal `1` (two call sites).
- `backend/src/middleware/auth.middleware.test.ts` — add a grace-path regression test.
- `backend/src/utils/fileUtils.ts` — `tenantUploadsDir()` helper; tenant-aware `deleteUploadedFile`.
- `backend/src/config/multer.ts` — write uploads into the per-tenant directory.
- `backend/src/services/imageProcessing.service.ts` — process images inside the upload's own directory.
- `backend/src/controllers/upload.controller.ts` — build tenant-scoped URLs; list only the current tenant's files.
- `backend/src/index.ts` — tenant-guarded `/api/uploads/tenants/:tenantId/:filename` route before the legacy static mount.
- `backend/prisma/seed.ts`, `backend/prisma/backfill-categories.ts` — switch context-less scripts to `getUnscopedPrisma()`.
- `backend/package.json` — `prisma:seed:demo` script.

---

# PART A — Security Fixes

## Task A1: Fail-closed scoping in CI/test

**Problem:** `database.ts:63-68` throws `MissingTenantContextError` only when `NODE_ENV === 'production'`; in every other env (including `test`) a scoped query with no tenant context runs **unscoped**. A missing-context isolation bug therefore passes CI silently. We make `test` fail-closed too, keeping a pass-through only for dev/script execution (where the two standalone seed/backfill scripts run). Those two scripts move to the explicit unscoped client so they don't depend on the pass-through.

**Files:**
- Modify: `backend/src/config/database.ts` (lines 62-68)
- Modify: `backend/prisma/seed.ts:1`, `backend/prisma/backfill-categories.ts:1`
- Test: `backend/src/config/database.failClosed.test.ts` (create)

**Interfaces:**
- Consumes: `getTenantContext()`, `MissingTenantContextError`, `getTenantPrisma()`, `getUnscopedPrisma()`.
- Produces: no signature changes. Behavioral change only: scoped ops with no context throw in `test` + `production`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/config/database.failClosed.test.ts
import { describe, it, expect } from 'vitest';
import { getTenantPrisma } from './database';
import { MissingTenantContextError } from './tenantContext';

// NODE_ENV is 'test' under Vitest. A scoped query with no active tenant
// context must fail closed rather than silently run unscoped.
describe('tenant extension fails closed in test env', () => {
  it('throws MissingTenantContextError when no context is active', async () => {
    await expect(getTenantPrisma().category.findMany()).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/config/database.failClosed.test.ts`
Expected: FAIL — the query resolves (returns an array) instead of throwing, because the current code passes through in `test`.

- [ ] **Step 3: Make the extension fail-closed in test + production**

In `backend/src/config/database.ts`, replace the no-context block (currently lines 62-68):

```ts
          const ctx = getTenantContext();
          if (!ctx) {
            if (process.env.NODE_ENV === 'production') {
              throw new MissingTenantContextError();
            }
            return query(args);
          }
```

with:

```ts
          const ctx = getTenantContext();
          if (!ctx) {
            // Fail closed wherever isolation must be trustworthy: production AND
            // CI/test (so a missing-context regression turns the build red).
            // Dev/script execution (NODE_ENV unset or 'development') keeps a
            // logged pass-through for ad-hoc scripts; the sanctioned context-free
            // path everywhere is getUnscopedPrisma().
            if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') {
              throw new MissingTenantContextError();
            }
            // eslint-disable-next-line no-console
            console.warn(
              `[tenant] scoped op "${operation}" on "${table}" ran with no tenant context (dev pass-through)`,
            );
            return query(args);
          }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/config/database.failClosed.test.ts`
Expected: PASS.

- [ ] **Step 5: Move the two context-less scripts to the unscoped client**

These scripts run outside any request, so post-change they must not use the scoped default export.

In `backend/prisma/seed.ts`, replace line 1:

```ts
import prisma from '../src/config/database';
```

with:

```ts
import { getUnscopedPrisma } from '../src/config/database';

const prisma = getUnscopedPrisma();
```

Apply the identical change to `backend/prisma/backfill-categories.ts:1`. (Both files already pass `tenantId`/`storeId` explicitly on every write, so the unscoped client is correct — it simply stops relying on the dev pass-through.)

- [ ] **Step 6: Run the FULL backend suite and triage fallout**

Run: `cd backend && npx vitest run`

Some existing tests import the default scoped `prisma` and exercise scoped models without entering a context — they previously passed via the test pass-through and will now throw `MissingTenantContextError`. Likely suspects (confirm against actual output, do not assume): `src/services/authorizenet.service.test.ts`, `src/services/pos/orders/posOrderService.test.ts`, `src/services/search/postgres.search.service.integration.test.ts`.

For each failing test, apply exactly one of these two fixes — never re-enable a blanket pass-through:
- **The test asserts tenant-scoped behavior or hits a request-path service** → wrap the DB calls in `runWithTenant({ tenantId: <seededTenantId>, storeId: <seededStoreId | null>, scope: 'tenant' }, async () => { ... })`.
- **The test is pure setup/teardown or genuinely cross-tenant (fixtures, counts across tenants)** → switch that call from the default import / `getTenantPrisma()` to `getUnscopedPrisma()`.

Re-run `npx vitest run` until green.

- [ ] **Step 7: Verify the seed still runs end-to-end**

Run: `cd backend && npx prisma migrate reset --force --skip-generate`
Expected: migrations apply and `prisma/seed.ts` completes, printing `🎉 Database seeded successfully!` with no `MissingTenantContextError`. (Reset runs the configured seed; this proves Step 5 works.)

- [ ] **Step 8: Commit**

```bash
git add backend/src/config/database.ts backend/src/config/database.failClosed.test.ts \
  backend/prisma/seed.ts backend/prisma/backfill-categories.ts
git add -u backend/src   # any triaged test fixes from Step 6
git commit -m "fix(tenancy): fail closed on missing tenant context in CI/test"
```

---

## Task A2: Resolve default-tenant id dynamically (remove hardcoded `1`)

**Problem:** The legacy-JWT grace path in `auth.middleware.ts:31` and `:76` maps a token with no `tenantId` to the literal default-tenant id `1`. The seed/migration key the default tenant off `slug = 'app'` and never guarantee `id = 1`. If the default tenant is any other id, every legacy token authenticates against the **wrong tenant**. We resolve the real id once at boot and read it from a cache.

**Files:**
- Create: `backend/src/config/defaultTenant.ts`
- Test: `backend/src/config/defaultTenant.test.ts`
- Modify: `backend/src/config/verifyDefaultTenant.ts`
- Modify: `backend/src/middleware/auth.middleware.ts` (lines 31 and 76)
- Modify: `backend/src/middleware/auth.middleware.test.ts`

**Interfaces:**
- Produces:
  - `setDefaultTenantId(id: number): void`
  - `getDefaultTenantId(): number | null` — returns the cached id, or `null` if boot verification has not run.
- Consumes: `verifyDefaultTenant` calls `setDefaultTenantId` with the resolved row's id.

- [ ] **Step 1: Write the failing test for the cache**

```ts
// backend/src/config/defaultTenant.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setDefaultTenantId, getDefaultTenantId } from './defaultTenant';

describe('defaultTenant cache', () => {
  it('is null before it is set', () => {
    // fresh module state per file run
    expect(getDefaultTenantId()).toBeNull();
  });

  it('returns the value once set', () => {
    setDefaultTenantId(7);
    expect(getDefaultTenantId()).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/config/defaultTenant.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the cache**

```ts
// backend/src/config/defaultTenant.ts
// Process-wide cache of the default tenant's numeric id, resolved at boot from
// the row with slug 'app'. The legacy-JWT grace path reads this instead of
// assuming id === 1.
let defaultTenantId: number | null = null;

export function setDefaultTenantId(id: number): void {
  defaultTenantId = id;
}

export function getDefaultTenantId(): number | null {
  return defaultTenantId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/config/defaultTenant.test.ts`
Expected: PASS.

- [ ] **Step 5: Populate the cache in `verifyDefaultTenant`**

Replace the whole body of `backend/src/config/verifyDefaultTenant.ts`:

```ts
// backend/src/config/verifyDefaultTenant.ts
import { setDefaultTenantId } from './defaultTenant';

export async function verifyDefaultTenant(prisma: {
  tenant: { findFirst: (args: any) => Promise<any> };
}): Promise<void> {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'app' },
  });
  if (!tenant) {
    throw new Error(
      'FATAL: Default tenant (slug: app) is missing from the database. Ensure database migrations have run.',
    );
  }
  setDefaultTenantId(tenant.id);
}
```

- [ ] **Step 6: Confirm the existing `verifyDefaultTenant` test still passes**

Run: `cd backend && npx vitest run src/config/verifyDefaultTenant.test.ts`
Expected: PASS (the "passes when default tenant exists" case now also sets the cache; the mock returns `{ id: 1, slug: 'app' }`, so no assertion breaks).

- [ ] **Step 7: Write the failing grace-path regression test**

```ts
// add to backend/src/middleware/auth.middleware.test.ts
import { setDefaultTenantId } from '../config/defaultTenant';

it('maps a legacy token (no tenantId) to the RESOLVED default tenant, not literal 1', async () => {
  setDefaultTenantId(42); // default tenant is id 42, not 1
  vi.spyOn(jwt, 'verifyToken').mockReturnValue({
    userId: 1, username: 'u', roles: [],
  } as any); // note: no tenantId field => legacy token

  // Request resolved to the default tenant (id 42) must SUCCEED.
  const okReq: any = { headers: { authorization: 'Bearer x' }, tenantId: 42, path: '/', method: 'GET' };
  const okRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const okNext = vi.fn();
  await authenticate(okReq, okRes, okNext);
  expect(okNext).toHaveBeenCalled();

  // Same legacy token on a NON-default tenant (id 99) must be rejected.
  const badReq: any = { headers: { authorization: 'Bearer x' }, tenantId: 99, path: '/', method: 'GET' };
  const badRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const badNext = vi.fn();
  await authenticate(badReq, badRes, badNext);
  expect(badRes.status).toHaveBeenCalledWith(401);
  expect(badNext).not.toHaveBeenCalled();
});
```

> If `authenticate`/`jwt` are not already imported at the top of this test file, add `import { authenticate } from './auth.middleware';` and `import * as jwt from '../utils/jwt.util';` (mirror the existing cross-check test in this file).

- [ ] **Step 8: Run test to verify it fails**

Run: `cd backend && npx vitest run src/middleware/auth.middleware.test.ts`
Expected: FAIL — with the hardcoded `1`, the `tenantId: 42` request is treated as a mismatch (`1 !== 42`) and returns 401, so `okNext` is never called.

- [ ] **Step 9: Use the cached id in both grace-path sites**

In `backend/src/middleware/auth.middleware.ts`, add the import near the top:

```ts
import { getDefaultTenantId } from '../config/defaultTenant';
```

Replace line 31 (inside `authenticate`):

```ts
    const tokenTenantId = decoded.tenantId === undefined ? 1 : decoded.tenantId;
```

with:

```ts
    const tokenTenantId = decoded.tenantId === undefined ? getDefaultTenantId() : decoded.tenantId;
```

Replace the identical line 76 (inside `optionalAuthenticate`) the same way.

> Behavior note: `getDefaultTenantId()` returns `null` before boot verification runs. A `null` token-tenant is already treated as "super-admin / exempt" by the existing `tokenTenantId !== null` guards, so an uninitialized cache fails safe (a legacy token simply won't be force-matched to a tenant) rather than silently binding to the wrong one.

- [ ] **Step 10: Run test to verify it passes**

Run: `cd backend && npx vitest run src/middleware/auth.middleware.test.ts`
Expected: PASS (new grace-path test + existing cross-check test).

- [ ] **Step 11: Commit**

```bash
git add backend/src/config/defaultTenant.ts backend/src/config/defaultTenant.test.ts \
  backend/src/config/verifyDefaultTenant.ts \
  backend/src/middleware/auth.middleware.ts backend/src/middleware/auth.middleware.test.ts
git commit -m "fix(tenancy): resolve default-tenant id at boot instead of hardcoding 1"
```

---

# PART B — Media / Upload Isolation

> **Design:** New uploads are written under `uploads/tenants/<tenantId>/` and served via a guarded route that rejects cross-tenant paths. The legacy flat `uploads/` static mount is retained read-only for pre-existing URLs (they belong to the default tenant and predate tenancy), but the **list** endpoint stops enumerating the shared root — that enumeration was the active leak. Upload requests already pass through `resolveTenant` (mounted at `index.ts:116`, before route handlers), so a tenant context is always active inside multer and the controllers.

## Task B1: Write uploads into per-tenant directories

**Files:**
- Modify: `backend/src/utils/fileUtils.ts`
- Modify: `backend/src/config/multer.ts`
- Modify: `backend/src/services/imageProcessing.service.ts`
- Test: `backend/src/utils/fileUtils.test.ts` (create or extend)

**Interfaces:**
- Produces: `tenantUploadsDir(tenantId: number): string` — absolute path to `uploads/tenants/<tenantId>`, created if absent.
- Consumes: `getTenantContextOrThrow()` from `tenantContext.ts`.
- Changes: `processUploadedImage(file: { filename: string; mimetype: string; destination: string })` now reads/writes inside `file.destination` (the multer-chosen tenant dir) instead of the shared `UPLOADS_DIR`.

- [ ] **Step 1: Write the failing test for `tenantUploadsDir`**

```ts
// backend/src/utils/fileUtils.test.ts
import { describe, it, expect } from 'vitest';
import path from 'path';
import { tenantUploadsDir, UPLOADS_DIR } from './fileUtils';

describe('tenantUploadsDir', () => {
  it('returns a per-tenant subdirectory of the uploads root', () => {
    const dir = tenantUploadsDir(42);
    expect(dir).toBe(path.join(UPLOADS_DIR, 'tenants', '42'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/utils/fileUtils.test.ts`
Expected: FAIL — `tenantUploadsDir` is not exported.

- [ ] **Step 3: Add `tenantUploadsDir` and tenant-aware delete to `fileUtils.ts`**

Add to `backend/src/utils/fileUtils.ts` (keep existing exports):

```ts
/**
 * Absolute path to a tenant's upload directory, created on demand.
 */
export function tenantUploadsDir(tenantId: number): string {
  const dir = path.join(UPLOADS_DIR, 'tenants', String(tenantId));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
```

Replace the existing `deleteUploadedFile` so it resolves BOTH legacy (`/api/uploads/<file>`) and tenant (`/api/uploads/tenants/<id>/<file>`) URLs, with a traversal guard:

```ts
/**
 * Delete an uploaded file from disk given its URL path. Handles both legacy
 * flat URLs and tenant-scoped URLs. Silently ignores a missing file.
 */
export async function deleteUploadedFile(url: string): Promise<void> {
  if (!url || !url.startsWith('/api/uploads/')) return;
  const rel = url.slice('/api/uploads/'.length).split('?')[0];
  const filePath = path.resolve(UPLOADS_DIR, rel);
  // Refuse anything that escapes the uploads root.
  if (filePath !== UPLOADS_DIR && !filePath.startsWith(UPLOADS_DIR + path.sep)) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/utils/fileUtils.test.ts`
Expected: PASS.

- [ ] **Step 5: Point multer at the tenant directory**

In `backend/src/config/multer.ts`, add the imports and rewrite the `destination` callback:

```ts
import { UPLOADS_DIR, tenantUploadsDir } from '../utils/fileUtils';
import { getTenantContextOrThrow } from './tenantContext';
```

```ts
const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => {
    try {
      const { tenantId } = getTenantContextOrThrow();
      cb(null, tenantUploadsDir(tenantId));
    } catch (err) {
      cb(err as Error, '');
    }
  },
  filename: (_req: any, file: any, cb: any) => {
    let ext = file.mimetype.split('/')[1];
    if (file.mimetype === 'image/jpeg') ext = 'jpg';
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}.${ext}`;
    cb(null, uniqueName);
  },
});
```

(`UPLOADS_DIR` is still imported because `ensureUploadsDir()` creates the root; leave that function as-is.)

- [ ] **Step 6: Make `processUploadedImage` operate inside the upload's own directory**

In `backend/src/services/imageProcessing.service.ts`, change `processUploadedImage` to use `file.destination` (the multer-chosen tenant dir) rather than the shared root:

```ts
export async function processUploadedImage(
  file: { filename: string; mimetype: string; destination: string },
): Promise<string> {
  if (isVideoMime(file.mimetype)) return file.filename;

  const inputPath = path.join(file.destination, file.filename);
  const webpFilename = file.filename.replace(/\.[^.]+$/, '.webp');
  const outputPath = path.join(file.destination, webpFilename);

  await sharp(inputPath)
    .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(outputPath);

  await fs.promises.unlink(inputPath);
  return webpFilename;
}
```

(`UPLOADS_DIR` import in this file may now be unused; remove it if `tsc` flags it. `processFaviconUpload` is global branding and stays on the shared root.)

- [ ] **Step 7: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors (fix any unused-import error introduced above).

- [ ] **Step 8: Commit**

```bash
git add backend/src/utils/fileUtils.ts backend/src/utils/fileUtils.test.ts \
  backend/src/config/multer.ts backend/src/services/imageProcessing.service.ts
git commit -m "feat(tenancy): write uploads into per-tenant directories"
```

---

## Task B2: Tenant-guarded serving + scoped listing

**Files:**
- Modify: `backend/src/controllers/upload.controller.ts`
- Modify: `backend/src/index.ts` (around the static mount at lines 208-212)
- Modify: `backend/src/utils/fileUtils.ts` (add `resolveTenantUploadPath`)
- Test: `backend/src/utils/fileUtils.test.ts` (extend — pure unit test, no supertest/DB)

**Interfaces:**
- Consumes: `getTenantContext()`/`getTenantContextOrThrow()`, `tenantUploadsDir(tenantId)`, `UPLOADS_DIR`.
- Produces:
  - `resolveTenantUploadPath(requestedTenantId: number, filename: string, ctx: { tenantId: number; scope: 'tenant' | 'super-admin' } | undefined): string | null` — on-disk path for the requested file, or `null` to deny (cross-tenant when `ctx.scope === 'tenant'`, or non-integer id). Blocks traversal via `path.basename`. Super-admin and absent ctx are allowed (the route always runs behind `resolveTenant`).
  - route `GET /api/uploads/tenants/:tenantId/:filename` that 404s when the helper returns `null`.

**Why a pure helper instead of a supertest route test:** `src/index.ts` calls `startServer()` at import time (boots `app.listen` + the outbox worker) and does not export `app`, and `supertest` is not installed in the container image. Extracting the guard decision into `resolveTenantUploadPath` makes it unit-testable with zero infrastructure; the route becomes a thin wrapper.

- [ ] **Step 1: Build tenant-scoped URLs in the controller**

In `backend/src/controllers/upload.controller.ts`, add:

```ts
import { getTenantContextOrThrow } from '../config/tenantContext';
import { tenantUploadsDir } from '../utils/fileUtils';
```

Rewrite `uploadImage` and `uploadImages` to emit tenant-scoped URLs:

```ts
  async uploadImage(req: MulterRequest, res: Response): Promise<void> {
    if (!req.file) {
      throw new AppError('No file uploaded. Please select an image.', 400);
    }
    const { tenantId } = getTenantContextOrThrow();
    const filename = await processUploadedImage(req.file as any);
    res.status(201).json(successResponse({ url: `/api/uploads/tenants/${tenantId}/${filename}` }));
  }

  async uploadImages(req: MulterRequest, res: Response): Promise<void> {
    if (!req.files || req.files.length === 0) {
      throw new AppError('No files uploaded. Please select at least one image.', 400);
    }
    const { tenantId } = getTenantContextOrThrow();
    const filenames = await Promise.all((req.files as any[]).map(processUploadedImage));
    const urls = filenames.map((filename) => `/api/uploads/tenants/${tenantId}/${filename}`);
    res.status(201).json(successResponse({ urls }));
  }
```

- [ ] **Step 2: Scope the list endpoint to the current tenant**

Replace `getImages` so it reads only the active tenant's directory (this removes the cross-tenant enumeration leak):

```ts
  async getImages(_req: Request, res: Response): Promise<void> {
    const { tenantId } = getTenantContextOrThrow();
    const dir = tenantUploadsDir(tenantId); // created on demand; safe if empty
    const files = await fs.promises.readdir(dir);
    const statResults = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(dir, file);
        const stats = await fs.promises.stat(filePath);
        return stats.isFile()
          ? { url: `/api/uploads/tenants/${tenantId}/${file}`, filename: file, size: stats.size, createdAt: stats.birthtime }
          : null;
      }),
    );
    const images = statResults.filter((x): x is NonNullable<typeof x> => x !== null);
    images.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    res.status(200).json(successResponse({ images }));
  }
```

- [ ] **Step 3: Write the failing unit test for the guard helper**

Add to `backend/src/utils/fileUtils.test.ts`:

```ts
import { resolveTenantUploadPath, UPLOADS_DIR } from './fileUtils';
import path from 'path';

describe('resolveTenantUploadPath', () => {
  const tenantCtx = (tenantId: number) => ({ tenantId, scope: 'tenant' as const });

  it('returns the on-disk path for the active tenant own file', () => {
    const p = resolveTenantUploadPath(42, 'pic.webp', tenantCtx(42));
    expect(p).toBe(path.join(UPLOADS_DIR, 'tenants', '42', 'pic.webp'));
  });

  it('denies (null) when a tenant requests another tenant file', () => {
    expect(resolveTenantUploadPath(99, 'secret.webp', tenantCtx(42))).toBeNull();
  });

  it('allows super-admin to read any tenant file', () => {
    const p = resolveTenantUploadPath(99, 'x.webp', { tenantId: 0, scope: 'super-admin' });
    expect(p).toBe(path.join(UPLOADS_DIR, 'tenants', '99', 'x.webp'));
  });

  it('blocks path traversal in the filename', () => {
    const p = resolveTenantUploadPath(42, '../../etc/passwd', tenantCtx(42));
    expect(p).toBe(path.join(UPLOADS_DIR, 'tenants', '42', 'passwd'));
  });

  it('denies a non-integer tenant id', () => {
    expect(resolveTenantUploadPath(Number('abc'), 'x.webp', tenantCtx(42))).toBeNull();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run (in container): `docker exec generic-ecommerce-store-delivery-backend sh -c 'cd /app && npx vitest run src/utils/fileUtils.test.ts'`
Expected: FAIL — `resolveTenantUploadPath` is not exported.

- [ ] **Step 5: Implement `resolveTenantUploadPath` in `fileUtils.ts`**

Add to `backend/src/utils/fileUtils.ts`:

```ts
/**
 * Resolve the on-disk path for a tenant-scoped upload request, or null to deny.
 * A 'tenant'-scoped context may only read its own tenant's files; 'super-admin'
 * (and an absent context, which cannot occur behind resolveTenant) is allowed.
 * path.basename strips any traversal segments from the filename.
 */
export function resolveTenantUploadPath(
  requestedTenantId: number,
  filename: string,
  ctx: { tenantId: number; scope: 'tenant' | 'super-admin' } | undefined,
): string | null {
  if (!Number.isInteger(requestedTenantId)) return null;
  if (ctx && ctx.scope !== 'super-admin' && ctx.tenantId !== requestedTenantId) return null;
  const safeName = path.basename(filename);
  return path.join(UPLOADS_DIR, 'tenants', String(requestedTenantId), safeName);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run (in container): `docker exec generic-ecommerce-store-delivery-backend sh -c 'cd /app && npx vitest run src/utils/fileUtils.test.ts'`
Expected: PASS (the `tenantUploadsDir` test from B1 plus the five new guard tests).

- [ ] **Step 7: Wire the thin route into `index.ts`**

In `backend/src/index.ts`, add the imports near the other imports:

```ts
import { getTenantContext } from './config/tenantContext';
import { resolveTenantUploadPath } from './utils/fileUtils';
```

Insert the route immediately ABOVE the existing static mount (line ~208, before `app.use('/api/uploads', express.static(...))`):

```ts
// Tenant-scoped uploads: a tenant may only fetch files under its own id.
// resolveTenant (mounted on /api above) has already set the ALS context.
app.get('/api/uploads/tenants/:tenantId/:filename', (req, res) => {
  const filePath = resolveTenantUploadPath(
    Number(req.params.tenantId),
    req.params.filename,
    getTenantContext(),
  );
  if (!filePath) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.sendFile(filePath, { maxAge: '30d', immutable: true }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Not found' });
  });
});
```

Leave the existing legacy `app.use('/api/uploads', express.static(...))` mount in place below it (serves pre-tenant flat files by direct URL only).

- [ ] **Step 8: Typecheck + commit**

Run (in container): `docker exec generic-ecommerce-store-delivery-backend sh -c 'cd /app && npx tsc --noEmit'`

```bash
git add backend/src/controllers/upload.controller.ts backend/src/index.ts \
  backend/src/utils/fileUtils.ts backend/src/utils/fileUtils.test.ts
git commit -m "feat(tenancy): tenant-guarded upload serving and scoped listing"
```

---

# PART C — Demo Tenant Seed

## Task C1: Idempotent Demo-tenant seed script

**Problem:** The original motivating goal — an isolated public **Demo** sandbox — was never built. `prisma/seed.ts` creates only the `app` tenant. We add a separate, idempotent `seed-demo.ts` that builds a `demo` tenant with its own store, a fake catalog, orders spanning the order lifecycle, and two demo users. It uses `getUnscopedPrisma()` and passes `tenantId`/`storeId` explicitly (mirroring `seed.ts`), so it is correct regardless of `NODE_ENV`.

**Files:**
- Create: `backend/prisma/seed-demo.ts`
- Modify: `backend/package.json` (add `prisma:seed:demo` script)

**Interfaces:**
- Produces: `export async function seedDemo(): Promise<{ tenantId: number; storeId: number; productCount: number; orderCount: number }>` — callable from tests; the file also self-invokes when run as a script.

- [ ] **Step 1: Implement the Demo seed**

```ts
// backend/prisma/seed-demo.ts
import { getUnscopedPrisma } from '../src/config/database';
import { hashPassword } from '../src/utils/password.util';
import { DeliveryMethodEnum, OrderStatus, PaymentMethodEnum, PaymentStatus, Prisma } from '../generated/prisma';

const prisma = getUnscopedPrisma();
const DEMO_SLUG = 'demo';

export async function seedDemo(): Promise<{ tenantId: number; storeId: number; productCount: number; orderCount: number }> {
  // ── Tenant & Store (idempotent) ──────────────────────────────────────────
  let tenant = await prisma.tenant.findFirst({ where: { slug: DEMO_SLUG } });
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { slug: DEMO_SLUG, name: 'Demo Smoke Shop', status: 'ACTIVE', plan: 'demo' } });
  }
  const tenantId = tenant.id;

  let store = await prisma.store.findFirst({ where: { tenantId, slug: 'main' } });
  if (!store) {
    store = await prisma.store.create({ data: { tenantId, name: 'Demo Store', slug: 'main', isDefault: true, status: 'ACTIVE' } });
  }
  const storeId = store.id;

  // Re-runnable: clear this tenant's mutable data, leave tenant/store rows.
  await prisma.order.deleteMany({ where: { tenantId } });        // cascades items/payments/events
  await prisma.product.deleteMany({ where: { tenantId } });      // cascades images/variants
  await prisma.category.deleteMany({ where: { tenantId } });
  await prisma.userRole.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });

  // ── Roles (reuse the GLOBAL role catalog; demo only needs assignment) ─────
  const need = ['CUSTOMER', 'MANAGEMENT'] as const;
  const roleByName: Record<string, number> = {};
  for (const name of need) {
    const role = (await prisma.role.findFirst({ where: { name } })) ?? (await prisma.role.create({ data: { name } }));
    roleByName[name] = role.id;
  }

  // ── Demo users (known credentials) ───────────────────────────────────────
  const mgr = await prisma.user.create({ data: { username: 'demo-manager', password: await hashPassword('demo1234'), approved: true, tenantId } });
  await prisma.userRole.create({ data: { userId: mgr.id, roleId: roleByName.MANAGEMENT, tenantId, storeId } });

  const cust = await prisma.user.create({ data: { username: 'demo-customer', password: await hashPassword('demo1234'), approved: true, tenantId, address: '1 Demo Way, Austin, TX 78701', phoneNumber: '(512) 555-0199' } });
  await prisma.userRole.create({ data: { userId: cust.id, roleId: roleByName.CUSTOMER, tenantId } });

  // ── Fake catalog ─────────────────────────────────────────────────────────
  const cat = await prisma.category.create({ data: { name: 'Demo Goods', slug: 'demo-goods', description: 'Obviously-fake demo catalog', tenantId } });
  const productSpecs = [
    { name: 'Demo Widget',  slug: 'demo-widget',  price: '19.99', stock: 25 },
    { name: 'Demo Gadget',  slug: 'demo-gadget',  price: '39.99', stock: 10 },
    { name: 'Demo Gizmo',   slug: 'demo-gizmo',   price: '9.99',  stock: 50 },
  ];
  const products = [];
  for (const p of productSpecs) {
    const product = await prisma.product.create({
      data: {
        name: p.name, slug: p.slug, categoryId: cat.id, description: `${p.name} — demo only`, hidden: false, tenantId,
        images: { create: [{ url: 'https://placehold.co/400x400?text=Demo', role: 'THUMBNAIL', sortOrder: 0, tenantId }] },
        variants: { create: [{ label: 'Default', sku: `DEMO-${p.slug}`, pricingMode: 'UNIT', basePrice: new Prisma.Decimal(p.price), stock: p.stock, stockEnabled: true, isDefault: true, active: true, sortOrder: 0, tenantId }] },
      },
      include: { variants: true },
    });
    products.push(product);
  }

  // ── Orders across the lifecycle ──────────────────────────────────────────
  const stages: OrderStatus[] = [
    OrderStatus.PENDING, OrderStatus.APPROVED, OrderStatus.READY_FOR_DELIVERY,
    OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED, OrderStatus.READY_FOR_PICKUP, OrderStatus.PICKED_UP,
  ];
  let orderCount = 0;
  for (const status of stages) {
    const variant = products[orderCount % products.length].variants[0];
    const price = variant.basePrice as unknown as Prisma.Decimal;
    await prisma.order.create({
      data: {
        userId: cust.id, status,
        paymentMethod: PaymentMethodEnum.EXTERNAL,
        deliveryMethod: status === OrderStatus.READY_FOR_PICKUP || status === OrderStatus.PICKED_UP ? DeliveryMethodEnum.PICKUP : DeliveryMethodEnum.DELIVERY,
        subtotal: price, tax: new Prisma.Decimal('0'), total: price, taxRate: new Prisma.Decimal('0'),
        tenantId, storeId,
        items: { create: [{ variantId: variant.id, productName: products[orderCount % products.length].name, variantLabel: variant.label, quantity: 1, unitPrice: price, tenantId, storeId }] },
        payments: { create: [{ method: PaymentMethodEnum.EXTERNAL, status: status === OrderStatus.PENDING ? PaymentStatus.PENDING : PaymentStatus.SETTLED, amount: price, tenantId, storeId }] },
      },
    });
    orderCount++;
  }

  return { tenantId, storeId, productCount: products.length, orderCount };
}

// Self-invoke when run directly as a script (not when imported by a test).
if (require.main === module) {
  seedDemo()
    .then((r) => { console.log('🎭 Demo tenant seeded:', r); })
    .catch((e) => { console.error('❌ Demo seed failed:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
```

> All seven `OrderStatus` members used above are verified present in `schema.prisma` (`enum OrderStatus`, lines 559-570: PENDING, APPROVED, READY_FOR_DELIVERY, OUT_FOR_DELIVERY, DELIVERED, READY_FOR_PICKUP, PICKED_UP). `Category.slug` is `String?` (nullable) so the explicit `slug: 'demo-goods'` is safe. If `Product` requires any non-null field not shown here, copy the exact create-shape from `prisma/seed.ts` (`makeProduct`).

- [ ] **Step 2: Add the npm script**

In `backend/package.json` `scripts`, add after `"prisma:seed:prod"`:

```json
    "prisma:seed:demo": "ts-node prisma/seed-demo.ts",
```

- [ ] **Step 3: Run the seed against the dev DB**

Run: `cd backend && npm run prisma:seed:demo`
Expected: prints `🎭 Demo tenant seeded: { tenantId: <n>, storeId: <n>, productCount: 3, orderCount: 7 }` with no errors.

- [ ] **Step 4: Run it AGAIN to prove idempotency**

Run: `cd backend && npm run prisma:seed:demo`
Expected: same output, no unique-constraint errors (the delete-then-recreate block makes it re-runnable).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/seed-demo.ts backend/package.json
git commit -m "feat(tenancy): add idempotent Demo tenant seed"
```

---

## Task C2: Demo-seed isolation integration test

**Files:**
- Create: `backend/src/integration/demoSeed.test.ts`

**Interfaces:**
- Consumes: `seedDemo()` (Task C1), `getUnscopedPrisma`, `getTenantPrisma`, `runWithTenant`.

- [ ] **Step 1: Write the test**

```ts
// backend/src/integration/demoSeed.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { seedDemo } from '../../prisma/seed-demo';
import { getUnscopedPrisma, getTenantPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';

let demoTenantId = 0, demoStoreId = 0;

beforeAll(async () => {
  const r = await seedDemo();
  demoTenantId = r.tenantId; demoStoreId = r.storeId;
});

describe('Demo tenant seed', () => {
  it('creates an isolated demo tenant with catalog and lifecycle orders', async () => {
    const products = await runWithTenant(
      { tenantId: demoTenantId, storeId: demoStoreId, scope: 'tenant' },
      () => getTenantPrisma().product.findMany(),
    );
    expect(products.length).toBe(3);

    const orders = await runWithTenant(
      { tenantId: demoTenantId, storeId: demoStoreId, scope: 'tenant' },
      () => getTenantPrisma().order.findMany(),
    );
    expect(orders.length).toBe(7);
  });

  it('does not leak demo products into the default (app) tenant', async () => {
    const base = getUnscopedPrisma();
    const appTenant = await base.tenant.findFirst({ where: { slug: 'app' } });
    if (!appTenant) return; // no default tenant in this DB → nothing to compare
    const leaked = await runWithTenant(
      { tenantId: appTenant.id, storeId: null, scope: 'tenant' },
      () => getTenantPrisma().product.findMany({ where: { slug: 'demo-widget' } }),
    );
    expect(leaked.length).toBe(0);
  });

  it('is idempotent — re-running keeps counts stable', async () => {
    const r = await seedDemo();
    const orders = await runWithTenant(
      { tenantId: r.tenantId, storeId: r.storeId, scope: 'tenant' },
      () => getTenantPrisma().order.findMany(),
    );
    expect(orders.length).toBe(7);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd backend && npx vitest run src/integration/demoSeed.test.ts`
Expected: PASS (3 tests) — demo has 3 products / 7 orders, the default tenant sees zero demo products, re-seed stays at 7.

- [ ] **Step 3: Commit**

```bash
git add backend/src/integration/demoSeed.test.ts
git commit -m "test(tenancy): demo seed isolation + idempotency integration test"
```

---

## Final: Full suite green

- [ ] **Step 1: Run the entire backend suite**

Run: `cd backend && npx vitest run`
Expected: all tests pass, including the three new isolation guards.

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Final commit if anything was touched during triage**

```bash
git add -u backend
git commit -m "chore(tenancy): hardening pass — full suite green"
```

---

## Self-Review notes (for the implementer)

- **Bug #1 residual:** dev/script execution (`NODE_ENV` unset/`development`) still pass-through with a warning — intentional, so ad-hoc scripts work. The sanctioned context-free path is `getUnscopedPrisma()`. Production and CI are fail-closed.
- **Bug #2 residual:** `getDefaultTenantId()` is `null` until `verifyDefaultTenant` runs at boot; the existing `!== null` guards make that fail safe. Confirm `index.ts` calls `verifyDefaultTenant(getUnscopedPrisma())` during boot (it does, per Task 10 of the foundation plan) so the cache is populated in production.
- **Media residual:** legacy flat `/api/uploads/<file>` URLs remain directly fetchable (pre-tenant data, default tenant). A follow-up migration to relocate them under `tenants/<defaultId>/` and rewrite stored URLs is out of scope here; the active enumeration leak (list endpoint) is closed.
- **SKU uniqueness** (`ProductVariant.sku @unique` is still global) is a separate, lower-severity item from the comparison — not addressed here; track separately.
