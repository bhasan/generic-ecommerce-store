# Design: Duplication Cleanup — Settings Store + API Factories

**Date:** 2026-06-14
**Status:** Approved (pending spec review)
**Scope:** Backend `SettingsStore<T>` extraction + frontend API factory rollout

## Context

This is sub-project #1 of a larger architecture effort. The agreed sequence is:

1. **Duplication cleanup** (this spec)
2. Checkout / payment strategy
3. Vendor config store
4. Audit & monitoring (later)

Doing duplication cleanup first is deliberate: the `SettingsStore<T>` extracted here
is the foundation the later vendor-config work builds on.

### The problem

Five backend services persist a single JSON blob to the `ui_settings` table, each
re-implementing the same Prisma + merge-with-defaults + validate dance:

- `landingPageSettings.service.ts` (`key: 'landing_page_settings'`)
- `paymentSettings.service.ts` (`key: 'payment_settings'`)
- `branding.service.ts` (`key: 'branding'`)
- `storeSettings.service.ts` (`key: 'store_settings'`)
- `orderingConstraints.service.ts` (`key: 'ordering_constraints'`)

The shared core is narrow (`findUnique({key})` / `upsert({key})` / merge defaults /
validate). The variation between services is real and must be preserved:

| Service | Behavior beyond get/upsert/merge |
|---|---|
| `landingPageSettings` | none — pure |
| `paymentSettings` | field-level encryption (encrypt `loginId`/`transactionKey` on write, decrypt on read) |
| `branding` | read-modify-write (merges with *current*), computed color variants, `generateCssBlock()` |
| `storeSettings` | `normalize()`, cross-service side-effects (address verify, cache invalidation), derived getters |
| `orderingConstraints` | `normalize()`, cross-key reads (reads `store_settings` for offline zips), caching |

On the frontend, a `createResourceApi` factory already exists but only 3 of ~18 API
files use it. The rest hand-roll near-identical wrappers.

## Approach

**Composition over inheritance.** A thin generic `SettingsStore<T>` owns only the
repeated part. Each domain service keeps its own class and domain logic and *delegates*
the boilerplate to a store instance. This bends to the divergence between services
instead of forcing them into a rigid base class.

Rejected alternatives:
- **`BaseSettingsService<T>` inheritance:** branding's read-modify-write and
  storeSettings' side-effects fight the template; most methods get overridden anyway.
- **Central settings registry (config-driven):** most powerful for future vendor
  config, but the side-effecting services don't fit a pure registry. YAGNI for now;
  approach A is the clean seam to evolve toward this later.

## Backend Design

### `SettingsStore<T>` — `backend/src/services/settingsStore.ts`

```ts
interface SettingsStoreConfig<T> {
  key: string;                 // e.g. 'payment_settings'
  schema: ZodType<T>;          // validation + type source of truth
  defaults: T;
  onRead?:  (raw: T) => T;     // e.g. decrypt fields
  onWrite?: (data: T) => T;    // e.g. encrypt fields
}

class SettingsStore<T> {
  constructor(config: SettingsStoreConfig<T>);
  read(): Promise<T>;
  write(data: T): Promise<T>;
}
```

**`read()`**
1. `prisma.uiSetting.findUnique({ where: { key } })`
2. If absent → return `structuredClone(defaults)`.
3. Else → shallow-merge stored value over defaults (top-level keys only).
4. Run `onRead` if provided (e.g. decrypt).
5. Return.

**Nested-merge caveat:** the store merges *top-level* keys only. Services with nested
default objects — `paymentSettings.cc_payment` and `branding.faviconUrls` — must restore
those nested defaults themselves. This is done in `onRead` (e.g. paymentSettings spreads
`{ ...defaults.cc_payment, ...stored.cc_payment }` before/after decrypting). This keeps
the store simple and makes each service's nested-merge behavior explicit rather than
hidden in a deep-merge utility. Existing service tests assert these merges and must stay
green.

**`write(data)`**
1. `parseOrThrow(schema, data)` — validates; throws `AppError(400)` on failure.
2. Run `onWrite` if provided (e.g. encrypt) to produce the persisted shape.
3. `prisma.uiSetting.upsert({ where: { key }, update: { value }, create: { key, value } })`.
4. Return the **plaintext validated input** (not the encrypted/stored row) — matches the
   existing payment-encryption contract where callers receive plaintext.

### Zod → AppError adapter

A shared helper preserves today's error-response shape:

```ts
function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(result.error.issues[0].message, 400);
  }
  return result.data;
}
```

Each existing validation rule maps to a Zod rule **with its current error message string
preserved verbatim**, so API behavior and existing tests do not drift.

### Per-service migration

- **landingPageSettings, paymentSettings:** become thin wrappers over a `SettingsStore`
  instance. paymentSettings passes `onWrite: encryptFields` and `onRead: decryptFields`,
  moving the just-added encrypt/decrypt logic into the transform hooks. The constructor
  still accepts the encryption key. Behavior identical.
- **branding:** keeps its class, `generateCssBlock()`, and color-variant computation.
  Read-modify-write uses `store.read()` then `store.write({ ...current, ...data })`.
  The computed-color step stays in the service before calling `store.write`.
- **storeSettings:** keeps `normalize()`, derived getters
  (`getNotificationEmailRouting`), and side-effects (`verifyStoreAddress`, cache
  invalidation). Delegates plain get/upsert to the store.
- **orderingConstraints:** keeps `normalize()` and the cross-key offline-zip read;
  delegates only the plain get/upsert to the store.

### Zod schemas

- Add `zod` to backend dependencies.
- One schema per settings domain, co-located in each service file, replacing the
  hand-written `validate()`.
- The schema is the source of truth for the type via `z.infer`; hand-maintained
  interfaces are derived, not duplicated.

## Frontend Design

The ~15 unconverted API files split into two shapes:

- **Collection resources** (products, categories, users, credits, contactMessages, and
  other CRUD-shaped APIs): roll out the existing `createResourceApi`. Each file is
  confirmed to fit the `getAll/getById/create/update/remove` shape before converting.
- **Singleton settings resources** (branding, payment, store, landing, ordering):
  add a new `createSettingsApi(endpoint)` → `{ get, update }` factory and convert them.

## Error Handling

- Schema validation failures throw `AppError(message, 400)` via `parseOrThrow`, keeping
  the existing HTTP error contract.
- Error message strings are preserved verbatim from the current hand-written validators.

## Testing (TDD throughout)

- **`SettingsStore`** gets its own unit tests:
  - `read()` with no persisted row → returns defaults (deep clone, not shared reference).
  - `read()` with a partial row → merges over defaults.
  - `onRead` / `onWrite` hooks fire when provided.
  - `write()` with invalid data → throws `AppError` 400.
  - `write()` returns plaintext input, not the persisted/transformed value.
- **Each migrated service** keeps its existing test file; those tests must stay green
  **unchanged** — this is the proof the refactor preserves behavior. Where a test asserts
  a specific validation message, the Zod rule must reproduce it.
- **Frontend:** existing API tests stay green; add a small test for `createSettingsApi`.

## Verification During Implementation

Two items to confirm while building rather than now:

1. Exactly which frontend APIs are CRUD-shaped (fit `createResourceApi`) vs. special.
2. Whether any current error message cannot be reproduced verbatim by a Zod rule — if so,
   flag it rather than silently changing the message.

## Out of Scope

- Checkout / payment strategy refactor (sub-project #2).
- Vendor config registry (sub-project #3).
- Audit & monitoring (sub-project #4).
- Any change to the `ui_settings` table schema or stored JSON shape.
