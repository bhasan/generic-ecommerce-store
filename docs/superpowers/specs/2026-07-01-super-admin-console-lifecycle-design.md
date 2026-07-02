# Super-Admin Console + Soft-Delete Lifecycle — Design

**Date:** 2026-07-01
**Phase:** 3 (slice 1 of the Super-Admin Console)
**Branch:** `multi-tenant-phase-3`
**Roadmap:** `docs/superpowers/specs/2026-06-27-multi-tenancy-roadmap.md` (Phase 3)

## Context

Phase 1 built tenant isolation; Phase 2 delivered multi-store operation. Phase 3 is the
platform-operator layer — the tooling the platform owner (super-admin, `admin` subdomain →
`tenantId: 0` scope) uses to run all tenants.

Today, platform-level tenant CRUD already exists but is **squatting inside the
website-management feature**: routes are correctly gated `requireSuperAdmin` (so it is
functionally safe — no cross-tenant escalation), but architecturally it lives in the wrong
place and is reachable only *behind* the ADMIN-gated `/website-management` group, so a pure
super-admin who lacks the ADMIN role cannot actually reach it.

This slice does two things:

1. **Relocate + expand** tenant management into a dedicated, SUPER_ADMIN-gated `/admin`
   console in the existing SPA.
2. **Complete the soft-delete lifecycle**: add a `DELETED` tenant status that resolves as a
   404 (indistinguishable from an unknown tenant), reversible by a super-admin, with a
   persistent audit trail of every lifecycle action.

### Decisions locked during brainstorming

- **Scope:** console + lifecycle only (plans/branding, subdomain DNS/TLS, self-service signup
  are separate later slices).
- **Console surface:** a routed `/admin` section in the same SPA, gated on `SUPER_ADMIN`
  scope (not a separate build, not admin-subdomain-host-gated).
- **`DELETED` semantics:** hidden 404 (like an unknown subdomain), hidden from the default
  console list, **reversible** by a super-admin (restore to `ACTIVE`). No hard DB deletes.
- **Console MVP includes:** regenerate machine tokens (exists), edit name + free-text plan,
  filter list by status, and a persistent audit trail.
- **Audit surfacing:** a global **Activity** page (second console nav item) showing all
  tenant lifecycle events across every tenant, newest-first, filterable by tenant + action.
  Each tenant row deep-links into it pre-filtered to that tenant.

## Goals

- A dedicated `/admin` super-admin console, gated at the route-group level on `SUPER_ADMIN`.
- Full tenant lifecycle from the console: create, edit (name/plan), suspend, restore,
  soft-delete, regenerate tokens.
- `DELETED` status enforced centrally at the tenant middleware (404, fail-closed).
- A persistent, queryable `tenant_audit_log` recording every lifecycle action with actor,
  target, request id, and a detail payload — surfaced in a global Activity page.
- Tests updated in the same branch: middleware, service, controller/integration, frontend.

## Non-goals (YAGNI — explicitly deferred)

- Structured **plan tiers** — `plan` stays a free-text `String?`.
- Per-tenant **branding** fields.
- **Subdomain provisioning** (wildcard DNS / TLS) — pure infra, separate slice.
- Public **self-service signup** + abuse prevention.
- Seeding extra **categories / settings** rows per tenant — settings services already default
  lazily ("returns defaults when no persisted settings exist"), so a freshly created tenant is
  fully functional with what `createTenant` already seeds.
- **Hard deletes** — never. Deletion is always a `status` flip.

---

## Design

### A. Data model & migrations (backend)

**A1. `TenantStatus` gains `DELETED`.**
`schema.prisma:729` `enum TenantStatus { ACTIVE SUSPENDED }` → add `DELETED`. The Tenant
model default (`schema.prisma:685`, `@default(ACTIVE)`) is unchanged.

Migration `backend/prisma/migrations/<ts>_tenant_status_deleted/migration.sql`:
```sql
ALTER TYPE "TenantStatus" ADD VALUE 'DELETED';
```
This MUST be its **own** migration containing only the `ADD VALUE`. Postgres forbids using a
freshly added enum value in the same transaction that adds it, so no migration that writes or
queries a `DELETED` row may share this file. (There is no prior `ADD VALUE` precedent in the
repo — only a `RENAME VALUE` in `20260622114549` — so follow the hand-authored dated-folder
convention.)

**A2. New `TenantAuditLog` model** (platform-level, unscoped), shaped after `OrderStatusEvent`
(`schema.prisma:134-151`) and `PosOutbox` (`schema.prisma:511-529`):

```prisma
model TenantAuditLog {
  id             Int      @id @default(autoincrement())
  action         String   // TENANT_CREATED | TENANT_UPDATED | TENANT_SUSPENDED
                           // | TENANT_RESTORED | TENANT_DELETED | TENANT_TOKENS_REGENERATED
  targetTenantId Int      // subject tenant — plain column, NOT a cascade FK, so the
                          // record survives the tenant being soft-deleted
  actorUserId    Int?     // super-admin user id; FK onDelete: SetNull (like changedBy)
  actorUsername  String   // denormalized so the row is self-describing if the user is removed
  requestId      String?  // correlation id from req.requestId
  detail         Json?    // e.g. { from, to } status, or { name, plan } diff
  createdAt      DateTime @default(now())

  actor User? @relation("TenantAuditActor", fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([targetTenantId, createdAt])
  @@index([createdAt])
  @@map("tenant_audit_log")
}
```

This mirrors `OrderStatusEvent.changedByUser` (`schema.prisma:143`) exactly, including the
named relation + `onDelete: SetNull`. Prisma requires both sides of a relation, so the `User`
model gains a back-reference (parallel to `statusEventChanges` at `schema.prisma:41`):
`tenantAuditActions TenantAuditLog[] @relation("TenantAuditActor")`. Note `actorUserId` is the
*actor* (super-admin) FK; `targetTenantId` is deliberately a plain `Int` column with **no**
relation so audit history is never cascade-removed when a tenant is deleted/purged.

- Register `tenant_audit_log` in **`tenantScope.ts` `UNSCOPED_TABLES`** (alongside
  `tenants`/`stores`). These are cross-tenant super-admin actions with no single owning tenant;
  RLS tenant scoping would be wrong. `targetTenantId` is a *descriptive subject column*, not the
  isolation scope. Written via `getUnscopedPrisma()`.
- Separate migration `<ts>_add_tenant_audit_log/migration.sql`, hand-authored in the PosOutbox
  style: SERIAL PK, `TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP`, explicit `CreateIndex`, FK on
  `actorUserId` with `ON DELETE SET NULL`.
- After schema edits: `npm run prisma:generate` (client imported from `../../generated/prisma`,
  not `@prisma/client`).

### B. Middleware — `DELETED` behaves like unknown (404)

Tenant status is enforced at a single choke point. Insert a `DELETED` branch at
`tenant.middleware.ts:172`, **before** the existing suspend branch:

```ts
if (tenant.status === 'DELETED') { res.status(404).json({ error: 'Tenant not found' }); return; }
if (tenant.status !== 'ACTIVE')  { res.status(403).json({ error: 'This store is suspended' }); return; }
```

- The 404 body (`{ error: 'Tenant not found' }`) is reused verbatim from the existing
  unknown-tenant paths (`:168-171`, `:135-138`) so `DELETED` is indistinguishable from an
  unknown tenant.
- `SUSPENDED` keeps its `403 { error: 'This store is suspended' }`.
- Do **not** scatter status checks into routes/controllers — extend the one central gate.
- Machine-token middlewares (`reportingAuth.middleware.ts:69`, `printAgentAuth.middleware.ts:38`)
  already collapse every non-ACTIVE status to `401`, so `DELETED` is already covered — no code
  change; add a clarifying comment and a regression test.

### C. Backend — service / controller / routes

Every mutating service method takes an **actor** param `{ userId, username, requestId }` sourced
in the controller from `req.user.userId`, `req.user.username`, `req.requestId` (mirroring
`order.controller.ts:162-164`), and writes its audit row **inside the same `$transaction`** as
the mutation (never via the in-process event bus, which is non-durable). All tenant-management
code continues to use `getUnscopedPrisma()`.

| Route | Method | Behaviour | Audit action |
| --- | --- | --- | --- |
| `GET /admin/tenants?status=ACTIVE\|SUSPENDED\|DELETED\|all` | list | **Default excludes DELETED.** Add `status` to the projected `TenantListItem`. | — |
| `POST /admin/tenants` | create | Existing provisioning tx (tenant + default store + admin + role + tokens); add audit insert inside it. | `TENANT_CREATED` |
| `PATCH /admin/tenants/:id` | **new** — update | Update `name` and free-text `plan`. Validate at controller (envelope `{ error: { message, code } }`). | `TENANT_UPDATED` (detail = changed fields) |
| `PATCH /admin/tenants/:id/status` | setStatus | **ACTIVE/SUSPENDED only.** Wrap the (currently bare) `update` in a `$transaction`; read prior status in-tx to derive the action. Restore-from-DELETED also flows here (PATCH status ACTIVE). | `TENANT_SUSPENDED` or `TENANT_RESTORED` |
| `DELETE /admin/tenants/:id` | **new** — soft-delete | Set `status: DELETED` in a tx. Dedicated route keeps `setStatus` from ever accepting `DELETED`. | `TENANT_DELETED` |
| `POST /admin/tenants/:id/regenerate-tokens` | existing | Add audit insert. | `TENANT_TOKENS_REGENERATED` |
| `GET /admin/audit?tenantId=&action=&limit=` | **new** — read | List audit rows newest-first; optional `tenantId` and `action` filters. Powers both the global feed and the per-tenant deep-link. | — |

- All routes stay behind `authenticate + requireSuperAdmin` (already correct — no authz change).
- `setTenantStatus`'s TS signature widens only if it performs the DELETED write; per the table,
  DELETED is a **dedicated `deleteTenant` service method**, so `setTenantStatus` stays
  `'ACTIVE' | 'SUSPENDED'`.
- Response envelopes unchanged: `successResponse(...)` for success, `{ error: { message, code } }`
  for controller validation.

### D. Auth reconciliation

Backend `/admin/tenants` routes are already `requireSuperAdmin`-gated — correct and unchanged.
The only stale artifact is the comment in `web/src/services/tenantApi.js` claiming the backend
requires ADMIN; fix the comment to say SUPER_ADMIN.

### E. Frontend — dedicated `/admin` console

New feature folder `web/src/features/admin/`, mirroring the dashboard/website convention
(`<Name>Page.jsx` layout + `pages/` leaves + `components/` sections + colocated CSS/tests):

- `AdminConsolePage.jsx` — layout using the shared global classes (`dashboard-grid-container` /
  `dashboard-grid-layout` / `dashboard-grid-content`, from `styles/dashboard.css`) + `PageHeader`
  (lucide icon, e.g. `ShieldCheck`) + `AdminConsoleSidebar` + `<Outlet/>`.
- `components/AdminConsoleSidebar.jsx` — `NAV_ITEMS` array: **Tenants**, **Activity**.
- `pages/AdminTenantsPage.jsx` + `components/AdminTenantsSection.jsx` — **relocated** from
  `web/src/features/website/.../WebsiteTenantsSection.jsx` (update the relative import to
  `services/tenantApi`, which stays in `services/` unchanged).
- `pages/AdminActivityPage.jsx` + `components/AdminActivitySection.jsx` — **new** audit feed.
- `AdminConsolePage.css` — move the `tenant-*` styles out of `WebsiteManagementPage.css`.
- Move `TenantsPage.test.jsx` alongside the relocated page; fix the `vi.mock` path depth.

**Routing / gating (`App.jsx`):**

```jsx
<Route path="/admin" element={
  <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}><AdminConsolePage/></ProtectedRoute>
}>
  <Route index element={<Navigate to="tenants" replace/>} />
  <Route path="tenants"  element={<AdminTenantsPage/>} />
  <Route path="activity" element={<AdminActivityPage/>} />
</Route>
```

- **Group-level** `SUPER_ADMIN` gate fixes today's bug where a pure super-admin (without the
  ADMIN role) cannot reach the tenants leaf buried under the ADMIN-gated `/website-management`.
- Backward-compat redirect (the `/manage-products` precedent):
  `<Route path="/website-management/tenants" element={<Navigate to="/admin/tenants" replace/>} />`.
- Remove the `superAdminOnly` Tenants item from `WebsiteManagementSidebar` so the website
  sidebar no longer advertises a platform function.
- Add an `isSuperAdmin(user)` helper to `web/src/utils/roles.js` (parallel to `isGuest`).
- Add a SUPER_ADMIN "Admin Console" entry point in `Navbar` / `AdminDropdown` (+ mobile mirror),
  gated on `isSuperAdmin`; add `/admin` to `AdminDropdown`'s `ACTIVE_PATHS`.
- All API calls go through the existing `tenantApi.js` → `services/api.js` client (central
  timeout / retry / 401-refresh / `requestId`); no new per-call retry logic.

### F. Frontend — console affordances

**Tenants page** (`AdminTenantsSection`): existing create form + one-time token reveal +
suspend/activate + regenerate, plus:
- Inline **edit name / plan** (`PATCH /admin/tenants/:id`).
- **Delete** button (on ACTIVE/SUSPENDED rows, with confirm) → `DELETE /admin/tenants/:id`.
- **Restore** button (on DELETED rows) → `PATCH /admin/tenants/:id/status` `{ status: 'ACTIVE' }`.
- **Status filter** control; default hides DELETED, opt-in to reveal.
- Per-row **Activity** link → navigates to `/admin/activity?tenant=<id>`.

**Activity page** (`AdminActivitySection`): reads `GET /admin/audit?tenantId=&action=`, renders
newest-first rows (relative time · actor username · action · target tenant · detail), with a
tenant filter and an action filter. Honors a `tenant` query param for the per-row deep-link.

### G. Data flow (delete → hidden → restore)

1. Super-admin clicks **Delete** on `acme-corp` → `DELETE /admin/tenants/:id`.
2. Service, in one tx: `tenant.update({ status: 'DELETED' })` + `tenantAuditLog.create({ action:
   'TENANT_DELETED', targetTenantId, actorUserId, actorUsername, requestId })`.
3. Any subsequent request resolving to `acme-corp` hits the middleware gate at `:172` → `404`
   `{ error: 'Tenant not found' }`. The tenant's child data is untouched — it's hidden purely
   because the tenant no longer resolves.
4. Default console list excludes it; `?status=DELETED` reveals it with a **Restore** button.
5. Restore → `PATCH /:id/status { status: 'ACTIVE' }`; service reads prior status (`DELETED`),
   logs `TENANT_RESTORED`, sets `ACTIVE`. All child data is intact again.

### H. Testing

- **Middleware** (`tenant.middleware.test.ts`): new `DELETED → 404, next not called` test,
  sibling to the existing `SUSPENDED → 403` test; keep both so the two states stay distinct.
  Regression tests confirming machine-token middlewares still `401` a DELETED tenant.
- **Service** (new `tenantManagement.service.test.ts`): audit row written for each action;
  `TENANT_SUSPENDED` vs `TENANT_RESTORED` derived from prior status; restore-from-DELETED logs
  `TENANT_RESTORED`; list filter excludes DELETED by default; `GET /admin/audit` filters.
- **Integration** (`tenantManagement.routes.test.ts`): extend the existing SUPER_ADMIN gate test
  to cover the new `PATCH /:id`, `DELETE /:id`, and `GET /admin/audit` routes; validation shapes.
- **Frontend**: relocated tenants page tests pass at the new path; delete / restore / status-filter
  / edit flows; Activity page renders + filters; `/admin` console gated on SUPER_ADMIN; the
  backward-compat redirect resolves.

## Build sequence (high level — detailed plan follows in writing-plans)

1. Schema: `DELETED` enum migration (standalone) → `TenantAuditLog` model + migration →
   `tenantScope.ts` registration → `prisma:generate`.
2. Middleware `DELETED → 404` + tests.
3. Service/controller/routes: actor threading, audit writes, `update` / `deleteTenant` /
   `listTenants(status)` / `getAudit` + tests.
4. Frontend `features/admin` scaffold + relocation + routing/gating/nav + redirect.
5. Frontend affordances: edit / delete / restore / status filter / Activity page + tests.
6. Full suite green (`npm test`, `npm --prefix backend run build`, `npm --prefix web run lint`).

## Risks / caveats

- **Enum migration ordering:** the `ADD VALUE` migration must be standalone (Postgres constraint).
- **Audit durability:** write audit rows in the same tx as the mutation, not via the event bus
  (which swallows handler errors and is non-durable).
- **Audit survives deletion:** `targetTenantId` is a plain column, not a cascade FK — a soft-delete
  (and any later hard purge) must not orphan/remove audit history.
- **`req.tenant` is null on the admin subdomain:** log the target tenant id from the route param,
  not `req.tenant`.
