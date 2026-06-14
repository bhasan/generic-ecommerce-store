# Settings Store + API Factories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicated persistence boilerplate across the 5 `ui_settings`-backed services via a composable Zod-validated `SettingsStore<T>`, and collapse repeated frontend API wrappers via factory functions.

**Architecture:** A thin generic `SettingsStore<T>` owns the repeated Prisma read/merge/validate/upsert dance; each domain service keeps its own class + domain logic and delegates the boilerplate. Validation moves to per-domain Zod schemas (error messages preserved verbatim). Frontend collection APIs adopt the existing `createResourceApi`; singleton settings APIs adopt a new `createSettingsApi`.

**Tech Stack:** TypeScript, Express, Prisma, Zod (new), Vitest; React, Vite.

**Spec:** `docs/superpowers/specs/2026-06-14-settings-store-api-factories-design.md`

**Behavior-preservation rule (applies to every backend task):** existing service test files must stay green **unchanged**. Each Zod rule must reproduce the current `AppError` message string verbatim. If a message can't be reproduced, STOP and flag it.

---

## File Structure

- Create `backend/src/services/settingsStore.ts` — generic store + `parseOrThrow`.
- Create `backend/src/services/settingsStore.test.ts` — store unit tests.
- Modify the 5 settings services to delegate to a `SettingsStore` instance and replace `validate()` with a Zod schema.
- Create `web/src/services/createSettingsApi.js` — `{ get, update }` factory.
- Create `web/src/services/createSettingsApi.test.js`.
- Modify singleton settings API files (branding, payment, store, landing, ordering) to use `createSettingsApi`.
- Modify collection API files that fit CRUD shape to use existing `createResourceApi`.

---

## Task 1: `SettingsStore<T>` + `parseOrThrow`

**Files:**
- Create: `backend/src/services/settingsStore.ts`
- Test: `backend/src/services/settingsStore.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { AppError } from '../middleware/error.middleware';

const prismaMock = vi.hoisted(() => ({
  uiSetting: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock('../config/database', () => ({ default: prismaMock }));

const schema = z.object({ a: z.string(), n: z.number() });
const defaults = { a: 'def', n: 0 };

describe('SettingsStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a deep clone of defaults when no row exists', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue(null);
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'k', schema, defaults });
    const result = await store.read();
    expect(result).toEqual(defaults);
    expect(result).not.toBe(defaults);
  });

  it('shallow-merges stored value over defaults', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue({ value: { a: 'stored' } });
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'k', schema, defaults });
    expect(await store.read()).toEqual({ a: 'stored', n: 0 });
  });

  it('runs onRead transform', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue({ value: { a: 'x', n: 1 } });
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({
      key: 'k', schema, defaults,
      onRead: (raw) => ({ ...raw, a: raw.a.toUpperCase() }),
    });
    expect((await store.read()).a).toBe('X');
  });

  it('validates and upserts on write, returning plaintext input', async () => {
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: {} });
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'k', schema, defaults });
    const data = { a: 'hi', n: 2 };
    const result = await store.write(data);
    expect(prismaMock.uiSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'k' },
      update: { value: data },
      create: { key: 'k', value: data },
    });
    expect(result).toEqual(data);
  });

  it('runs onWrite transform before persisting but returns plaintext input', async () => {
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: {} });
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({
      key: 'k', schema, defaults,
      onWrite: (data) => ({ ...data, a: `enc:${data.a}` }),
    });
    const result = await store.write({ a: 'secret', n: 1 });
    const persisted = prismaMock.uiSetting.upsert.mock.calls[0][0].update.value;
    expect(persisted.a).toBe('enc:secret');
    expect(result.a).toBe('secret');
  });

  it('throws AppError(400) on schema validation failure', async () => {
    const { SettingsStore } = await import('./settingsStore');
    const store = new SettingsStore({ key: 'k', schema, defaults });
    await expect(store.write({ a: 123, n: 'no' } as never)).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm run test -- src/services/settingsStore.test.ts`
Expected: FAIL — `Cannot find module './settingsStore'`

- [ ] **Step 3: Install zod**

Run: `cd backend && npm install zod`
Expected: zod added to dependencies.

- [ ] **Step 4: Write minimal implementation**

```typescript
import { ZodType } from 'zod';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(result.error.issues[0].message, 400);
  }
  return result.data;
}

export interface SettingsStoreConfig<T> {
  key: string;
  schema: ZodType<T>;
  defaults: T;
  onRead?: (raw: T) => T;
  onWrite?: (data: T) => T;
}

export class SettingsStore<T extends object> {
  constructor(private readonly config: SettingsStoreConfig<T>) {}

  async read(): Promise<T> {
    const { key, defaults, onRead } = this.config;
    const row = await prisma.uiSetting.findUnique({ where: { key } });
    if (!row) {
      return structuredClone(defaults);
    }
    const stored = row.value as unknown as Partial<T>;
    const merged = { ...structuredClone(defaults), ...stored } as T;
    return onRead ? onRead(merged) : merged;
  }

  async write(data: T): Promise<T> {
    const { key, schema, onWrite } = this.config;
    const validated = parseOrThrow(schema, data);
    const toStore = onWrite ? onWrite(validated) : validated;
    await prisma.uiSetting.upsert({
      where: { key },
      update: { value: toStore as object },
      create: { key, value: toStore as object },
    });
    return validated;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm run test -- src/services/settingsStore.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/settingsStore.ts backend/src/services/settingsStore.test.ts backend/package.json backend/package-lock.json
git commit -m "feat: add Zod-validated SettingsStore<T> base"
```

---

## Task 2: Migrate `landingPageSettings` (establishes the pattern)

**Files:**
- Modify: `backend/src/services/landingPageSettings.service.ts`
- Test (must stay green unchanged): `backend/src/services/landingPageSettings.service.test.ts`

This is the simplest service (no transforms, no side-effects) — use it to prove the pattern.

- [ ] **Step 1: Run existing tests to capture the green baseline**

Run: `cd backend && npm run test -- src/services/landingPageSettings.service.test.ts`
Expected: PASS. Note the exact validation-message assertions; the Zod schema must reproduce them verbatim.

- [ ] **Step 2: Rewrite the service to use a Zod schema + SettingsStore**

Replace the hand-written `interface` + `DEFAULT_*` + `validate()` with a Zod schema as source of truth, deriving the type via `z.infer`. Map each existing rule to a Zod rule with the **same message**:
- `featuredProductIds` must be an array → `z.array(...)` with `.max(12, 'Invalid landing page settings: cannot select more than 12 featured products')`
- elements positive integers → `z.number().int().positive()` with the existing message via `.refine` or array-level message
- `promotions` array, `.max(20, ...)`, each `url` non-empty string, `description` string — preserve each message string exactly as in the current `validate()`.

Then:
```typescript
const store = new SettingsStore<LandingPageSettings>({
  key: 'landing_page_settings',
  schema: LandingPageSettingsSchema,
  defaults: DEFAULT_LANDING_PAGE_SETTINGS,
});

export class LandingPageSettingsService {
  async getLandingPageSettings() { return store.read(); }
  async updateLandingPageSettings(data: LandingPageSettings) { return store.write(data); }
}
```

Keep the exported class + method names identical so controllers/tests are untouched.

- [ ] **Step 3: Run the existing tests**

Run: `cd backend && npm run test -- src/services/landingPageSettings.service.test.ts`
Expected: PASS, unchanged. If a message assertion fails, adjust the Zod message to match; do not change the test.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/landingPageSettings.service.ts
git commit -m "refactor: migrate landingPageSettings to SettingsStore + Zod"
```

---

## Task 3: Migrate `paymentSettings` (encryption via onRead/onWrite hooks)

**Files:**
- Modify: `backend/src/services/paymentSettings.service.ts`
- Test (must stay green unchanged): `backend/src/services/paymentSettings.service.test.ts`

The service keeps its constructor `encryptionKey` and uses `onWrite`/`onRead` for the cc_payment field crypto. Note: `cc_payment` is a **nested** object → the hooks must restore nested defaults and encrypt/decrypt only the two fields.

- [ ] **Step 1: Run existing tests for the green baseline**

Run: `cd backend && npm run test -- src/services/paymentSettings.service.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 2: Rewrite using a Zod schema + per-instance SettingsStore**

- Build `PaymentSettingsSchema` mapping every rule in the current `validate()` to a Zod rule, **preserving each message verbatim** (e.g. `'CashApp handle must start with $'`, `'cc_payment.loginId is required when card payments are enabled'`, `'cc_payment.transactionKey must be a string of 64 characters or fewer'`). The conditional-required rules (loginId/transactionKey required only when `cc.enabled`) use `.superRefine`.
- The store is created **per instance** (because the key is captured in closures) inside the constructor, so the encryption key is available to the hooks:

```typescript
constructor(encryptionKey?: string) {
  this.encryptionKey = encryptionKey ?? process.env.PAYMENT_ENCRYPTION_KEY ?? '';
  if (!this.encryptionKey) throw new Error('PAYMENT_ENCRYPTION_KEY must be set');
  const key = this.encryptionKey;
  this.store = new SettingsStore<PaymentSettings>({
    key: 'payment_settings',
    schema: PaymentSettingsSchema,
    defaults: DEFAULT_PAYMENT_SETTINGS,
    onRead: (raw) => {
      const cc = { ...DEFAULT_PAYMENT_SETTINGS.cc_payment, ...raw.cc_payment };
      return { ...raw, cc_payment: {
        ...cc,
        loginId: cc.loginId ? decrypt(cc.loginId, key) : '',
        transactionKey: cc.transactionKey ? decrypt(cc.transactionKey, key) : '',
      }};
    },
    onWrite: (data) => ({ ...data, cc_payment: {
      ...data.cc_payment,
      loginId: data.cc_payment.loginId ? encrypt(data.cc_payment.loginId, key) : '',
      transactionKey: data.cc_payment.transactionKey ? encrypt(data.cc_payment.transactionKey, key) : '',
    }}),
  });
}

async getPaymentSettings() { return this.store.read(); }
async updatePaymentSettings(data: PaymentSettings) { return this.store.write(data); }
```

- [ ] **Step 3: Run existing tests**

Run: `cd backend && npm run test -- src/services/paymentSettings.service.test.ts`
Expected: PASS (10 tests), unchanged. The test mocks `../utils/crypto.util` with `enc:`-prefix fakes — confirm the encrypt/decrypt assertions still hold.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/paymentSettings.service.ts
git commit -m "refactor: migrate paymentSettings to SettingsStore with crypto hooks"
```

---

## Task 4: Migrate `branding` (read-modify-write + computed colors retained)

**Files:**
- Modify: `backend/src/services/branding.service.ts`
- Test (must stay green unchanged): `backend/src/services/branding.service.test.ts`

The service keeps `generateCssBlock()`, `computeColorVariants()`, the read-modify-write merge, and the nested `faviconUrls` default. Only the plain get/upsert moves to the store. `updateBranding` takes a `Partial<>` and merges with current — so:

- [ ] **Step 1:** Run `cd backend && npm run test -- src/services/branding.service.test.ts` — capture green baseline.
- [ ] **Step 2:** Add `BrandingSchema` (validates the merged result; preserve any existing messages — branding's current `updateBranding` has no `validate()` throw, so the schema should be permissive/`.partial()`-friendly and mainly drive typing). Restore nested `faviconUrls` defaults in `onRead`. Rewrite:
  - `getBranding()` → `store.read()` (with `onRead` restoring `faviconUrls` nested default).
  - `updateBranding(data)` → `const current = await store.read(); const merged = { ...current, ...data }`; run the existing color-variant computation on `merged`; then `store.write(merged)`.
  - Keep `generateCssBlock()` and `computeColorVariants()` verbatim.
- [ ] **Step 3:** Run `cd backend && npm run test -- src/services/branding.service.test.ts` — Expected PASS unchanged.
- [ ] **Step 4:** Commit: `git commit -am "refactor: migrate branding to SettingsStore, retain CSS + color logic"`

---

## Task 5: Migrate `storeSettings` (normalize + side-effects retained)

**Files:**
- Modify: `backend/src/services/storeSettings.service.ts`
- Test (must stay green unchanged): `backend/src/services/storeSettings.service.test.ts`

Keep `normalize()`, `getNotificationEmailRouting()`, the address-change `verifyStoreAddress` call, and the three cache invalidations. Only the get/upsert moves to the store.

- [ ] **Step 1:** Run `cd backend && npm run test -- src/services/storeSettings.service.test.ts` — capture baseline.
- [ ] **Step 2:** Add `StoreSettingsSchema` mapping the current `validate()` rules with verbatim messages. Rewrite:
  - `getStoreSettings()` → `this.normalize(await store.read())` (or set `onRead: normalize`).
  - `updateStoreSettings(data)`:
    1. `const normalized = this.normalize(data, { sanitizeInvalidEmails: false })`
    2. keep the `verifyStoreAddress` branch (compare to `await this.getStoreSettings()`)
    3. `await store.write(normalized)` (schema validation happens here — keep the standalone `this.validate` only if the schema can't express a rule; otherwise remove it)
    4. keep the three `invalidate*Cache()` calls
    5. return `this.normalize(written)`.
- [ ] **Step 3:** Run `cd backend && npm run test -- src/services/storeSettings.service.test.ts` — Expected PASS unchanged.
- [ ] **Step 4:** Commit: `git commit -am "refactor: migrate storeSettings to SettingsStore, retain normalize + side-effects"`

---

## Task 6: Migrate `orderingConstraints` (normalize + cross-key read retained)

**Files:**
- Modify: `backend/src/services/orderingConstraints.service.ts`
- Test (must stay green unchanged): `backend/src/services/orderingConstraints.service.test.ts`

Keep `normalize()`, the offline-zip caching, and the cross-key `store_settings` read (that read stays a direct Prisma call — it reads a *different* key). Only the `ordering_constraints` get/upsert moves to the store.

- [ ] **Step 1:** Run `cd backend && npm run test -- src/services/orderingConstraints.service.test.ts` — baseline.
- [ ] **Step 2:** Add `OrderingConstraintsSchema` (verbatim messages). Rewrite `getOrderingConstraints()` and `updateOrderingConstraints()` to delegate the `ordering_constraints` read/upsert to the store, set `onRead: normalize` (or normalize after read), and keep the no-row branch that injects `offlineDeliveryZipCodes` from `getOfflineZips()`. Leave `getOfflineZips()` and its direct `store_settings` read untouched.
- [ ] **Step 3:** Run `cd backend && npm run test -- src/services/orderingConstraints.service.test.ts` — Expected PASS unchanged.
- [ ] **Step 4:** Commit: `git commit -am "refactor: migrate orderingConstraints to SettingsStore, retain normalize + cross-key read"`

---

## Task 7: Run the full backend suite (refactor safety gate)

- [ ] **Step 1:** Run `cd backend && npm run test`
Expected: all suites PASS (was 293 + 6 new store tests = 299).
- [ ] **Step 2:** If anything is red, fix the service (not the test) until green. Commit any fix with a clear message.

---

## Task 8: Frontend `createSettingsApi` factory + convert singletons

**Files:**
- Create: `web/src/services/createSettingsApi.js`
- Create: `web/src/services/createSettingsApi.test.js`
- Modify: `web/src/services/brandingApi.js`, `paymentSettingsApi.js`, `storeSettingsApi.js`, `landingPageSettingsApi.js`, `orderingConstraintsApi.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  get: vi.fn(() => Promise.resolve({ ok: true })),
  put: vi.fn((_e, d) => Promise.resolve(d)),
}));

import { get, put } from './api';
import { createSettingsApi } from './createSettingsApi';

describe('createSettingsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('get() calls GET on the endpoint', async () => {
    const api = createSettingsApi('/branding');
    expect(await api.get()).toEqual({ ok: true });
    expect(get).toHaveBeenCalledWith('/branding');
  });

  it('update() calls PUT with data', async () => {
    const api = createSettingsApi('/branding');
    const data = { tagline: 'x' };
    expect(await api.update(data)).toEqual(data);
    expect(put).toHaveBeenCalledWith('/branding', data);
  });
});
```

- [ ] **Step 2:** Run `cd web && npm run test -- src/services/createSettingsApi.test.js` — Expected FAIL (module missing).

- [ ] **Step 3: Implement**

```javascript
import { get, put } from './api';

export function createSettingsApi(endpoint) {
  return {
    get: () => get(endpoint),
    update: (data) => put(endpoint, data),
  };
}
```

- [ ] **Step 4:** Run the test — Expected PASS.

- [ ] **Step 5: Convert the 5 singleton API files**

For each file, read its current exported function names. Re-implement them on top of `createSettingsApi(endpoint)` **keeping the exported names identical** so callers/tests don't change. Example for `brandingApi.js` (adapt endpoint + names to each file's reality):
```javascript
import { createSettingsApi } from './createSettingsApi';
const api = createSettingsApi('/branding');
export const getBranding = () => api.get();
export const updateBranding = (data) => api.update(data);
// preserve any extra exports (e.g. getBrandingCss) as-is
```
If a settings API has extra non-CRUD calls (e.g. branding CSS), leave those untouched.

- [ ] **Step 6:** Run `cd web && npm run test` — Expected: all PASS unchanged.

- [ ] **Step 7: Commit**

```bash
git add web/src/services/createSettingsApi.js web/src/services/createSettingsApi.test.js web/src/services/brandingApi.js web/src/services/paymentSettingsApi.js web/src/services/storeSettingsApi.js web/src/services/landingPageSettingsApi.js web/src/services/orderingConstraintsApi.js
git commit -m "refactor: add createSettingsApi factory, convert singleton settings APIs"
```

---

## Task 9: Frontend `createResourceApi` rollout to collection APIs

**Files (modify, only those confirmed CRUD-shaped):** `web/src/services/usersApi.js`, `creditApi.js`, `contactMessagesApi.js`, and any other unconverted collection API whose calls map to `getAll/getById/create/update/remove`.

- [ ] **Step 1: Audit shape per file.** For each candidate, read it and confirm its functions map cleanly to `createResourceApi`'s surface. If a file has bespoke endpoints (filters, nested routes, custom actions), keep those bespoke functions and only fold the standard CRUD calls into the factory. If it doesn't fit at all, skip it and note why.

- [ ] **Step 2: Convert each fitting file**, preserving exported names so callers/tests are untouched. Pattern:
```javascript
import { createResourceApi } from './createResourceApi';
const resource = createResourceApi('/users', 'user');
export const getUsers = () => resource.getAll();
export const getUser = (id) => resource.getById(id);
export const createUser = (data) => resource.create(data);
export const updateUser = (id, data) => resource.update(id, data);
export const deleteUser = (id) => resource.remove(id);
// keep any non-CRUD exports as-is
```

- [ ] **Step 3:** Run `cd web && npm run test` — Expected: all PASS unchanged.

- [ ] **Step 4: Commit**

```bash
git add web/src/services/
git commit -m "refactor: roll out createResourceApi to collection API modules"
```

---

## Task 10: Final verification

- [ ] **Step 1:** `cd backend && npm run test` — all green.
- [ ] **Step 2:** `cd web && npm run test` — all green.
- [ ] **Step 3:** `cd backend && npx tsc --noEmit` — no type errors (the Zod-derived types must satisfy all consumers).
- [ ] **Step 4:** Review the net diff for leftover dead code (old `validate()` methods, unused `AppError` imports, unused interfaces now derived from Zod). Remove and commit.

---

## Self-Review Notes

- **Spec coverage:** SettingsStore (Task 1), 5 service migrations (Tasks 2–6), full-suite gate (Task 7), createSettingsApi + singletons (Task 8), createResourceApi rollout (Task 9), tsc/dead-code (Task 10). All spec sections covered.
- **Message preservation** is enforced as an explicit step in every backend migration task.
- **Nested-merge caveat** is handled in Tasks 3 (cc_payment) and 4 (faviconUrls) via `onRead`.
- **Type consistency:** `SettingsStore`/`SettingsStoreConfig`/`parseOrThrow`/`read`/`write`/`onRead`/`onWrite` names are used identically across all tasks.
- **Verification-during-impl** items from the spec (which frontend APIs fit; message reproducibility) are explicit audit steps in Tasks 9 and each backend migration.
