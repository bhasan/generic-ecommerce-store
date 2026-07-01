# Multi-Tenancy Phase 2b — Per-Store Settings + Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make operational settings (`store_settings`: address, phone, timezone, currency, POS config, notification emails) resolve **per active store** — a tenant-default baseline (the default store's settings, stored under `storeId 0`) that non-default stores override field-by-field — and make delivery/pickup use the active store's address. Branding and all other settings stay tenant-level. Single-store tenants are byte-for-byte unchanged.

**Architecture:** `ui_settings` gains a `storeId` column; the `storeId 0` row is the tenant default (= the default store's settings, inherited by others), a real `storeId` row is a non-default store's partial override. `SettingsStore` gains a `storeScoped` mode whose read merges `row0 ⊕ row[activeStore]` (non-blank override wins, blank inherits) and whose write targets `row 0` for the default store or `row[activeStore]` for a non-default store — using a new `isDefaultStore` flag on the tenant context. Delivery reads the active store's merged address.

**Tech Stack:** Express + TypeScript, Prisma (`../../generated/prisma`), Vitest. Tests run in the container: `docker exec smoke-station-delivery-backend sh -c 'cd /app && npx vitest run <path>'`.

## Global Constraints

- **Backward-compat is the bar.** Single-store tenants (only a default store, no overrides) must behave identically to today: all settings read/write the `storeId 0` row. The full existing suite + E2E must stay green.
- **`storeId 0` = tenant-default / all-stores sentinel** (0 is never a real store; established in 2a). `ui_settings.storeId` therefore has **NO foreign key to `stores`** (it stores `0`). Store-reference validity is enforced at the app layer (decision on concern #2) — this plan adds a guardrail for it (Task 6).
- **Only `store_settings` is store-scoped this phase.** `branding`, `landing_page_settings`, `payment_settings`, `ordering_constraints` stay tenant-level (they live at `storeId 0`, no merge).
- **`ui_settings` stays TENANT-scoped in `src/config/tenantScope.ts`** — the Prisma extension injects only `tenantId`. `storeId` is handled MANUALLY inside `SettingsStore` (explicit `where`/`create`). **Do NOT add `ui_settings` to `STORE_SCOPED_TABLES`** (that would auto-inject `storeId` and break the tenant-default/override reads).
- **Migrations are hand-authored SQL** applied with `npx prisma migrate deploy` (never `prisma migrate dev`). New timestamps sort after `20260701000000_userrole_store_unique`.
- Commit messages end with the repo's standard trailers (Co-Authored-By + Claude-Session).

---

### Task 1: `ui_settings.storeId` + migration + pin `SettingsStore` to `storeId 0`

Adds the column and repoints the existing tenant-scoped read/write to `storeId 0` — **no behavior change** (every setting still lives at one row per tenant, now explicitly `storeId 0`).

**Files:**
- Modify: `backend/prisma/schema.prisma` (`UiSetting` model)
- Create: `backend/prisma/migrations/20260701010000_uisetting_store_scope/migration.sql`
- Modify: `backend/src/services/settingsStore.ts` (read/write compound key)
- Test: `backend/src/integration/tenantUniqueConstraints.test.ts` (extend)

**Interfaces:**
- Produces: `ui_settings` rows keyed by `(tenantId, storeId, key)` unique; `SettingsStore` read/write operate on the `storeId 0` row (tenant default). No store FK on `ui_settings.storeId`.

- [ ] **Step 1: Write the failing test** — extend `backend/src/integration/tenantUniqueConstraints.test.ts` with:

```ts
  it('allows a tenant-default (storeId 0) and a per-store override row for the same ui_settings key', async () => {
    const prisma = getUnscopedPrisma();
    const t = await prisma.tenant.create({ data: { slug: 'p2b-uisetting', name: 'P2B', status: 'ACTIVE' } });
    const s = await prisma.store.create({ data: { tenantId: t.id, name: 'S', slug: 's', status: 'ACTIVE' } });
    try {
      await prisma.uiSetting.create({ data: { tenantId: t.id, storeId: 0, key: 'store_settings', value: { name: 'D' } } });
      await prisma.uiSetting.create({ data: { tenantId: t.id, storeId: s.id, key: 'store_settings', value: { name: 'O' } } });
      // Duplicate (tenant, storeId 0, key) must be rejected.
      await expect(
        prisma.uiSetting.create({ data: { tenantId: t.id, storeId: 0, key: 'store_settings', value: {} } }),
      ).rejects.toThrow();
    } finally {
      await prisma.uiSetting.deleteMany({ where: { tenantId: t.id } });
      await prisma.store.delete({ where: { id: s.id } });
      await prisma.tenant.delete({ where: { id: t.id } });
    }
  });
```

Run: `docker exec smoke-station-delivery-backend sh -c 'cd /app && npx vitest run src/integration/tenantUniqueConstraints.test.ts'` → FAIL (no `storeId` column; `create` with `storeId` errors on the generated client).

- [ ] **Step 2: Update the schema.** In `UiSetting`: add `storeId Int?` (NO `@relation`), change `@@unique([tenantId, key])` → `@@unique([tenantId, storeId, key])`, add `@@index([storeId])`.

- [ ] **Step 3: Hand-author the migration** `backend/prisma/migrations/20260701010000_uisetting_store_scope/migration.sql`:
```sql
-- store_settings becomes per-store: storeId 0 = tenant default (the default store's
-- settings, inherited by other stores); a real storeId = a non-default store override.
-- No FK to stores: the column stores the sentinel 0 (see concern #2 — app-level integrity).
ALTER TABLE "ui_settings" ADD COLUMN "storeId" INTEGER;
UPDATE "ui_settings" SET "storeId" = 0 WHERE "storeId" IS NULL;
DROP INDEX "ui_settings_tenantId_key_key";
CREATE UNIQUE INDEX "ui_settings_tenantId_storeId_key_key" ON "ui_settings"("tenantId", "storeId", "key");
CREATE INDEX "ui_settings_storeId_idx" ON "ui_settings"("storeId");
```

- [ ] **Step 4: Repoint `SettingsStore` to `storeId 0`.** The old `tenantId_key` compound no longer exists. In `backend/src/services/settingsStore.ts`:
  - `read()`: change `getTenantPrisma().uiSetting.findFirst({ where: { key } })` → `findFirst({ where: { key, storeId: 0 } })`.
  - `write()`: change the upsert `where: { tenantId_key: { tenantId, key } }` → `where: { tenantId_storeId_key: { tenantId, storeId: 0, key } }`, and `create: { key, value: … }` → `create: { key, storeId: 0, value: … }`.

- [ ] **Step 5: Apply + regenerate.** `docker exec smoke-station-delivery-backend sh -c 'cd /app && npx prisma migrate deploy && npx prisma generate'` → 1 migration applied.

- [ ] **Step 6: Run the extended test + the settings suites** (`settingsStore`, `storeSettings.service`, `branding.service`, `settingsIsolation`, `tenantUniqueConstraints`): `docker exec … npx vitest run src/services/settingsStore.test.ts src/services/storeSettings.service.test.ts src/services/branding.service.test.ts src/integration/settingsIsolation.test.ts src/integration/tenantUniqueConstraints.test.ts` → all pass.

- [ ] **Step 7: Typecheck + full suite** → tsc clean, 0 failed.

- [ ] **Step 8: Commit** (`git add backend/prisma/schema.prisma backend/prisma/migrations/20260701010000_uisetting_store_scope/migration.sql backend/src/services/settingsStore.ts backend/src/integration/tenantUniqueConstraints.test.ts`) — message `feat(phase2b): ui_settings gains storeId; settings pinned to storeId 0 (tenant default)`.

---

### Task 2: `isDefaultStore` on the tenant context

The settings write must target `row 0` when the active store is the default, else `row[activeStore]`. Carry that on the context.

**Files:**
- Modify: `backend/src/config/tenantContext.ts` (add optional `isDefaultStore`)
- Modify: `backend/src/middleware/tenant.middleware.ts` (`resolveActiveStore` returns `isDefault`; set it in the context)
- Test: `backend/src/middleware/tenant.middleware.test.ts` (extend)

**Interfaces:**
- Produces: `TenantContext.isDefaultStore?: boolean`; set `true` when the resolved active store is the tenant's default store, `false` for a selected non-default store, `undefined`/`false` otherwise. Consumers read `getTenantContext()?.isDefaultStore`.

- [ ] **Step 1: Write the failing test** — in `tenant.middleware.test.ts`, capture the context. The suite mocks `runWithTenant`. Add a spy on the ctx: at the top of the `active store selection` describe, the existing tests already assert `req.store.id`; add:

```ts
    it('marks the context isDefaultStore=true for the default store and false for a selected non-default store', async () => {
      tenantFindFirst.mockResolvedValue(ACTIVE(1, 'acme'));
      // selected store 9 is NOT default; default store 5 IS default.
      findStore.mockImplementation(async (args: any) => {
        if (args.where?.isDefault) return { id: 5, isDefault: true };
        return { id: 9, isDefault: false };
      });
      let ctx: any;
      (runWithTenant as any).mockImplementation((c: any, fn: any) => { ctx = c; return fn(); });

      const a = mk('acme.yourapp.com', { 'x-store-id': '9' });
      await resolveTenant(a.req, a.res, a.next);
      expect(ctx.isDefaultStore).toBe(false);

      const b = mk('acme.yourapp.com');
      await resolveTenant(b.req, b.res, b.next);
      expect(ctx.isDefaultStore).toBe(true);
    });
```

The test needs `runWithTenant` mockable — confirm the file mocks `../config/tenantContext` (it does, for `runWithTenant`). If `runWithTenant` isn't currently a `vi.fn()`, convert the mock so it records `ctx`. Run → FAIL (`isDefaultStore` undefined).

- [ ] **Step 2: Add the field.** In `tenantContext.ts`, `TenantContext`: add `isDefaultStore?: boolean;`.

- [ ] **Step 3: Populate it.** In `tenant.middleware.ts`, change `resolveActiveStore` to also select/return `isDefault` and rework the tail:
  - `resolveActiveStore` return type → `{ id: number; isDefault: boolean } | null`; both branches `select`/read `isDefault` (`findFirst({ where: { id, tenantId, status: 'ACTIVE' }, select: { id: true, isDefault: true } })` for the selected branch; the default branch's store has `isDefault: true`).
  - In `resolveTenant`: `req.store = store ? { id: store.id } : null;` unchanged; `runWithTenant({ tenantId: tenant.id, storeId: store?.id ?? null, isDefaultStore: store?.isDefault ?? false, scope: 'tenant' }, () => next())`.

- [ ] **Step 4: Run** `tenant.middleware.test.ts` → PASS (prior + new).

- [ ] **Step 5: Typecheck + full suite** → tsc clean, 0 failed. (Other `runWithTenant` call sites — outbox, reporting — omit `isDefaultStore`; it's optional, so they still compile and behave as before.)

- [ ] **Step 6: Commit** (`git add backend/src/config/tenantContext.ts backend/src/middleware/tenant.middleware.ts backend/src/middleware/tenant.middleware.test.ts`) — `feat(phase2b): carry isDefaultStore on the tenant context`.

---

### Task 3: `SettingsStore` store-scoped mode (merge read + targeted write)

**Files:**
- Modify: `backend/src/services/settingsStore.ts`
- Test: `backend/src/services/settingsStore.test.ts` (extend)

**Interfaces:**
- Consumes: `getTenantContext()` → `{ tenantId, storeId, isDefaultStore }`.
- Produces: `SettingsStoreConfig` gains `storeScoped?: boolean`. For a store-scoped store: `read()` returns `mergeStoreScoped(defaults ⊕ row0.value, row[activeStore].value)` (non-blank override wins, blank/undefined inherits; nested objects merged per-field); `write(data)` upserts to `storeId 0` when `isDefaultStore` (or storeId null), else to `row[activeStore]`. Cache key includes storeId. Tenant-scoped stores are unchanged (row 0).

- [ ] **Step 1: Write the failing tests** — add to `settingsStore.test.ts` a store-scoped instance and assert merge + write target. (Mock `getTenantContext` to return `{ tenantId, storeId, isDefaultStore }`; mock `getTenantPrisma().uiSetting.findMany/upsert`.) Concretely:

```ts
  describe('store-scoped settings', () => {
    // a store-scoped store over a simple shape
    const makeStore = () => new SettingsStore<{ a: string; b: string }>({
      key: 'k', storeScoped: true,
      schema: z.object({ a: z.string(), b: z.string() }),
      defaults: { a: '', b: '' },
    });

    it('merges tenant-default (storeId 0) with the active store override, override non-blank wins', async () => {
      ctxMock.mockReturnValue({ tenantId: 7, storeId: 9, isDefaultStore: false });
      findManyMock.mockResolvedValue([
        { storeId: 0, value: { a: 'default-a', b: 'default-b' } },
        { storeId: 9, value: { a: 'store-a', b: '' } }, // b blank → inherit
      ]);
      const result = await makeStore().read();
      expect(result).toEqual({ a: 'store-a', b: 'default-b' });
    });

    it('writes the tenant-default row (storeId 0) when the active store is the default', async () => {
      ctxMock.mockReturnValue({ tenantId: 7, storeId: 5, isDefaultStore: true });
      await makeStore().write({ a: 'x', b: 'y' });
      expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
        where: { tenantId_storeId_key: { tenantId: 7, storeId: 0, key: 'k' } },
      }));
    });

    it('writes the store override row when the active store is non-default', async () => {
      ctxMock.mockReturnValue({ tenantId: 7, storeId: 9, isDefaultStore: false });
      await makeStore().write({ a: 'x', b: 'y' });
      expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
        where: { tenantId_storeId_key: { tenantId: 7, storeId: 9, key: 'k' } },
      }));
    });
  });
```

(Set up `ctxMock`/`findManyMock`/`upsertMock` mirroring the existing test's mocking of `../config/database` and `../config/tenantContext`.) Run → FAIL.

- [ ] **Step 2: Implement.** In `settingsStore.ts`:
  - Add `storeScoped?: boolean` to `SettingsStoreConfig<T>`.
  - Add a module helper:
    ```ts
    // Field-wise merge for store-scoped settings: the override wins for any field
    // whose value is a non-empty scalar; blank/undefined inherits the default; nested
    // plain objects merge per-field. Arrays/scalars replace when non-empty.
    function mergeStoreScoped<T>(base: T, override: Partial<T> | undefined): T {
      if (!override) return base;
      const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
      for (const [k, ov] of Object.entries(override)) {
        const bv = (base as any)[k];
        if (ov === undefined || ov === null || ov === '') continue; // inherit
        if (ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object') {
          out[k] = mergeStoreScoped(bv, ov as any);
        } else {
          out[k] = ov;
        }
      }
      return out;
    }
    ```
  - `cacheKeyFor(key)`: for store-scoped, include the effective store: `${tenantId}:${effectiveStoreId}:${key}` where `effectiveStoreId = isDefaultStore ? 0 : (storeId ?? 0)`; tenant-scoped stays `${tenantId}:${key}`.
  - `read()`: if `storeScoped`, fetch both rows in one query: `uiSetting.findMany({ where: { key, storeId: { in: [0, effectiveStoreId] } } })`; base = `{ ...resolveDefaults(), ...(row0?.value ?? {}) }`; effective = `mergeStoreScoped(base, rowStore?.value)`; apply `onRead`. (When `effectiveStoreId === 0`, the `in` list dedupes to `[0]` → just the default.) Tenant-scoped read unchanged.
  - `write(data)`: `effectiveStoreId = storeScoped ? (isDefaultStore ? 0 : (storeId ?? 0)) : 0`; upsert `where: { tenantId_storeId_key: { tenantId, storeId: effectiveStoreId, key } }`, `create: { key, storeId: effectiveStoreId, value } `.
  - **Cache invalidation (important):** a write to the tenant-default row (`storeId 0`) must invalidate the cached merges of EVERY store (they inherit row 0). Since `TtlCache` has no prefix-delete, on any **store-scoped** write call `settingsCache.clear()` (settings writes are rare admin actions, so clearing the whole small cache is fine); tenant-scoped writes keep the current single-key `delete`. Add a test asserting a tenant-default write is reflected in a subsequent non-default-store read (no stale inherit).

- [ ] **Step 3: Run** `settingsStore.test.ts` → PASS.
- [ ] **Step 4: Typecheck + full suite** → clean, 0 failed (tenant-scoped stores unaffected).
- [ ] **Step 5: Commit** (`git add backend/src/services/settingsStore.ts backend/src/services/settingsStore.test.ts`) — `feat(phase2b): SettingsStore store-scoped merge read + targeted write`.

---

### Task 4: Make `store_settings` store-scoped

**Files:**
- Modify: `backend/src/services/storeSettings.service.ts` (pass `storeScoped: true`)
- Test: `backend/src/integration/settingsIsolation.test.ts` (extend — real DB)

**Interfaces:**
- Consumes: Task 3's `storeScoped` config.
- Produces: `getStoreSettings()` returns the active store's effective (merged) settings; `updateStoreSettings()` writes the tenant default (default store / `storeId 0`) or the active non-default store's override.

- [ ] **Step 1: Write the failing integration test** — extend `settingsIsolation.test.ts`: under tenant T with a default store D and a non-default store S, set the tenant default address (write under `isDefaultStore:true`), then an override for S (write under `runWithTenant({… storeId:S, isDefaultStore:false})`), and assert: reading under D → default address; reading under S → S's address; a field left blank on S → inherits the default. Assert the override does NOT change D's or the tenant default's stored row. (Mirror the file's existing `runWithTenant` + `getUnscopedPrisma` setup + cleanup.) Run → FAIL (store_settings not yet store-scoped: both reads return the same row).

- [ ] **Step 2: Implement.** In `storeSettings.service.ts`, add `storeScoped: true` to the `new SettingsStore<StoreSettings>({ … })` config. (The `onRead` POS-decrypt and `onWrite` POS-encrypt still apply — they run after the merge on read and before the upsert on write, unchanged.)

- [ ] **Step 3: Run** `settingsIsolation.test.ts` → PASS. Also run `storeSettings.service.test.ts` (its mocks are context `storeId:1` default-ish; confirm still green — if a test asserted the old single-row upsert `where`, update it to `tenantId_storeId_key` with the store the mock context implies).

- [ ] **Step 4: Typecheck + full suite** → clean, 0 failed. (Reporting timezone/currency now naturally resolve per active store — its tests mock the settings service, so unaffected.)

- [ ] **Step 5: Commit** (`git add backend/src/services/storeSettings.service.ts backend/src/integration/settingsIsolation.test.ts` + any updated `storeSettings.service.test.ts`) — `feat(phase2b): store_settings resolves per active store (tenant default + override)`.

---

### Task 5: Per-store delivery origin

**Files:**
- Modify: `backend/src/services/deliveryEligibility.service.ts` (store-address cache keyed by tenant+store)
- Test: `backend/src/services/deliveryEligibility.service.test.ts` (extend, or a focused new case)

**Interfaces:**
- Consumes: `getStoreSettings()` (now per active store), `getTenantContext()` (`tenantId`, `storeId`).
- Produces: `getStoreAddress()` returns the ACTIVE store's address; the in-memory store-address cache is keyed by `${tenantId}:${storeId ?? 0}` so two stores don't share a cached address.

- [ ] **Step 1: Write the failing test** — assert that `getStoreAddress`/eligibility resolves the address for the active store and that the cache does not serve store A's address to store B. (Mock `getStoreSettings` to return different addresses per `getTenantContext().storeId`; call under two different store contexts; assert distinct results.) Run → FAIL (cache keyed by tenantId only → store B gets store A's cached address).

- [ ] **Step 2: Implement.** In `deliveryEligibility.service.ts`:
  - Change `_storeAddressCache` key from `number` (tenantId) to a string `${tenantId}:${storeId}`.
  - In `getStoreAddress()`: `const ctx = getTenantContext(); const cacheKey = \`${ctx?.tenantId ?? 0}:${ctx?.storeId ?? 0}\`;` use it for get/set.
  - `invalidateStoreAddressCache()` still `.clear()`s all (simplest; called on any store-settings address change).

- [ ] **Step 3: Run** the delivery test → PASS.
- [ ] **Step 4: Typecheck + full suite** → clean, 0 failed.
- [ ] **Step 5: Commit** (`git add backend/src/services/deliveryEligibility.service.ts backend/src/services/deliveryEligibility.service.test.ts`) — `feat(phase2b): delivery uses the active store's address (store-keyed cache)`.

---

### Task 6: Store-reference integrity guardrail (concern #2)

Because `user_roles.storeId` and `ui_settings.storeId` carry the `0` sentinel and have no store FK, add a guardrail that no such row references a **non-existent** real store.

**Files:**
- Create: `backend/src/integration/storeRefIntegrity.test.ts`

- [ ] **Step 1: Write the test** (real DB; read-only — no fixtures needed, it asserts a global invariant over seeded data):

```ts
import { describe, it, expect } from 'vitest';
import { getUnscopedPrisma } from '../config/database';

const prisma = getUnscopedPrisma();

describe('store-reference integrity (sentinel columns have no FK)', () => {
  // storeId 0 = "all stores / tenant default" sentinel; any OTHER value must be a real store.
  it('no user_roles row references a non-existent store', async () => {
    const orphans = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM user_roles ur
      WHERE ur."storeId" IS NOT NULL AND ur."storeId" <> 0
        AND NOT EXISTS (SELECT 1 FROM stores s WHERE s.id = ur."storeId")`;
    expect(Number(orphans[0].count)).toBe(0);
  });

  it('no ui_settings row references a non-existent store', async () => {
    const orphans = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM ui_settings u
      WHERE u."storeId" IS NOT NULL AND u."storeId" <> 0
        AND NOT EXISTS (SELECT 1 FROM stores s WHERE s.id = u."storeId")`;
    expect(Number(orphans[0].count)).toBe(0);
  });
});
```

- [ ] **Step 2: Run** `docker exec … npx vitest run src/integration/storeRefIntegrity.test.ts` → PASS (seeded data is clean).
- [ ] **Step 3: Full suite** → 0 failed.
- [ ] **Step 4: Commit** (`git add backend/src/integration/storeRefIntegrity.test.ts`) — `test(phase2b): store-reference integrity guardrail for sentinel storeId columns`.

---

## After 2b

Run the full E2E as the backward-compat gate (single-store delivery + settings unchanged) — pass count unchanged. Then proceed to **sub-plan 2c (per-store catalog)** — the heaviest wave (`StoreVariantOverride`, effective values, checkout decrement, POS-outbox per store, `storeIsolation` guardrail, stock-race extension).
