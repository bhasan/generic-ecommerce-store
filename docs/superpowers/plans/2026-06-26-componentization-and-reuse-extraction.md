# Componentization & Reusable-Code Extraction Plan (Web + Backend)

## Context

An audit of `web/` (React 19 + Vite + Context API) and `backend/` (Express + TypeScript + Prisma) found
substantial duplication and several oversized files mixing concerns. The codebase already favors small
factories/helpers (`web/src/services/createResourceApi.js`, `backend/src/utils/request.util.ts`,
`asyncHandler.util.ts`), so the strategy is to **extend those existing patterns** rather than introduce new
abstractions. Goal: reduce duplication, improve testability, and shrink large files — without changing behavior.

Validated metrics: 65 inline `.toFixed(2)` sites, ~13 modal components (web); 38 `parseIntParam` null-checks,
43 inline audit-log blocks, `order.service.ts` 1076 LOC, `user.service.ts` 746 LOC (backend).

Scope chosen: **everything including big file splits**, web and backend prioritized equally. Each phase is
independently shippable; do quick wins first to de-risk.

### Recent landings (last ~3 days) reflected in this plan
- **POS integration** (`backend/src/services/pos/`): freshly merged (#96), already capability-structured
  (PosOrderSync, outbox worker with `FOR UPDATE SKIP LOCKED`, idempotency, provider registry, ForeverPOS
  client/orders). Dead retry utils already pruned. **Out of scope** — do not refactor; its outbox/idempotency
  pattern is the template future capabilities (e.g. inventory sync) should reuse. Caution: `order.service.ts`
  now enqueues `ORDER_CREATED`/`ORDER_UPDATED` transactionally inside order mutations — see split caution in #17.
- **AppContext split** (#93): god-object already decomposed into 6 contexts — the repeated
  try/await/notify blocks in `OrdersContext.jsx`/`CatalogContext.jsx` are left for Phase 4 (React Query).
- **manage-store decomposition** (#90/#91): hooks already extracted at
  `web/src/features/manage-store/hooks/{useProducts,useProductFilters,useProductDragSort}.js` and
  components (`ProductsToolbar`, `ManageProductCard`, `ManageProductListItem`). **Mirror this hook
  location/style** for new hooks below; reuse `ManageProductCard` price logic when building `<PriceDisplay>` (#12).
- **Dashboard monolith** (906 lines) already split into nested-route pages — dropped from this plan.
- **Search service** extracted (`backend/src/services/search/`) and `product.shared.ts` created — reuse, don't touch.
- **`userRoles.helper.ts`** added (`getUserRolesWithNames(userId)`), but only wired into `auth.service`.
  This changes #15 from "create" to "extend" — see updated #15.

---

## How to execute this plan (read first)

**This document is a map, not a spec.** Every item below is the *starting point* for a task, not a complete
implementation. The line counts, file paths, and occurrence counts here were validated at authoring time but
the code moves — treat them as leads to confirm, not facts to trust.

**Each task MUST be independently researched and validated before any code is written.** For every item, the
executing agent is required to:
1. **Re-verify the current state** — open the cited files, re-run the cited greps/counts, and confirm the
   duplication/pattern still exists as described (it may have been changed, partially done, or moved).
2. **Map the full blast radius** — find *every* call site / consumer, not just the representative ones listed.
   Lists in this doc are illustrative and explicitly non-exhaustive.
3. **Produce a concrete implementation plan** for that task — exact files to add/edit, the function/component
   signature, the migration order, and the tests to add or update — derived from the research, then execute it.
4. **Check the Hotspot files section** before touching any file that appears there, and follow the stated order.
5. **Follow the Test-change policy** (Verification section) for whether assertions are allowed to change.
6. **Verify against the per-task or phase verification steps** before claiming completion — evidence (test
   output, screenshots) before assertions.

If research contradicts this plan (the pattern is gone, the count is wrong, a safer approach exists), **stop
and surface the discrepancy** rather than forcing the plan as written. The plan is wrong more often than the
code is.

### Each task is its own interactive session
Treat every numbered item as a **standalone, interactive working session** — not a step to power through
silently as part of a batch. That means: do the research, present your findings and proposed implementation
plan, and **expect back-and-forth with the user before and during execution.** Ask when anything is unclear
or ambiguous rather than guessing. Pause at natural checkpoints (after research, after a proof migration,
before a risky change) for confirmation. A task is done when its verification passes *and* the user agrees,
not when the code merely compiles. Do not start a second task in the same session unless asked.

### How ready is each task? (calibrate your research depth accordingly)
- **Spec-level — execute after re-verifying:** #8 (Deep Dive A) and #2 (Deep Dive B) have investigation,
  decisions, numbered steps, and verification. Confirm the findings still hold, then follow the steps.
- **Mechanical — clear signature + sites:** #1, #4, #5, #6, #7, #10, #15. Re-confirm the occurrences, then
  implement. #15 is the model for how specified a backend item can be.
- **Needs discovery first (lists are non-exhaustive):** #3, #9, #12, #13, #14, #16. The shape is sketched but
  you must enumerate *all* sites and reconcile differing variants into one API. Design that API and confirm it
  before coding — e.g. #12/#13 must unify components that currently differ.
- **Design-first — under-specified ON PURPOSE:** #17–#22 (the splits). This doc only names the target
  sub-modules/components; the actual seams are a design task (see the required architect step in Phase 3).
  Do not cut a large file without a reviewed boundary design.

---

## Phase 1 — Quick wins (low risk, do first)

### Web
1. **`formatCurrency` util** — new `web/src/utils/currencyUtils.js`:
   `formatCurrency(amount, decimals=2)` and `formatPrice(amount)` (returns `$x.xx`, null-safe).
   Replace ~65 inline `.toFixed(2)` calls. Representative files: `features/orders/OrderDetailPanel.jsx`,
   `features/cart/OrderSuccessPage.jsx`, `features/products/ProductCard.jsx`, `ProductListItem.jsx`,
   `components/common/SendPaymentModal.jsx`, `features/dashboard/components/CreditModal.jsx`.
2. **`<BaseModal>` + modal CSS consolidation** — ~13 modals, ~2,500 lines of CSS, *inconsistent* class
   conventions. Higher risk than a typical quick win. **See Deep Dive B** for the full build + per-modal
   migration + CSS-consolidation + verification plan.
3. **`useModalState(initialData)` hook** — new `web/src/hooks/useModalState.js` returning
   `{ isOpen, data, openModal, closeModal, setData }`. Apply to `PendingRegistrationsSection.jsx`,
   `RejectedUsersPage.jsx`, `CsvImportModal.jsx`, etc.
4. **Enhance `EmptyState` + add `LoadingState`** — extend `components/common/EmptyState.jsx`
   (currently message-only) to accept `icon/title/message/action`; add `components/common/LoadingState.jsx`.
5. **Complete `dateUtils.js`** — add `formatDateTime()`; replace inline `toLocaleString()` in
   `OrderDetailPanel.jsx` and `OrdersPage.jsx`.

### Backend
6. **`logAuditEvent(req, action, context)` helper** — new `backend/src/utils/auditLog.util.ts` collapsing the
   43 inline `logger.info({ requestId, actorUserId, ... })` blocks across product/category/user/announcement/
   contact/order controllers.
7. **ID-param middleware** — add `requireIntParam('id', label)` (or enhance pattern) to remove the 38
   `parseIntParam(...); if (id === null) return;` repetitions. Place in `backend/src/middleware/` next to
   existing validation usage; keep `parseIntParam` for non-route cases.
9. **Move announcement validation to routes** — new/expanded `backend/src/validators/announcement.validator.ts`
   using express-validator, removing inline checks in `announcement.controller.ts`.
10. **Extract image-processing service** — new `backend/src/services/imageProcessing.service.ts` for Sharp
    resize/WebP/delete logic shared by `upload.controller.ts` product upload (lines ~19-32) and favicon upload
    (lines ~112-136).

## Phase 1.5 — Contract changes (NOT quick wins; coordinate frontend+backend)

These change the client↔server contract or move where errors are produced, so tests **must** change and
deploy ordering matters. Kept separate from Phase 1 precisely because they are *not* low-risk.

8. **Response envelope (success-side standardization)** — breaking, ~1–1.5 days, cross-stack.
   **See Deep Dive A** for the full investigation and step-by-step migration. Summary: errors are already
   consistent; only success shapes vary; the web service layer (27 files) insulates the 74 components.
   (Item #9 above — announcement validation moving to routes — can also shift error output; treat it as a
   contract-adjacent change and update its tests accordingly.)

## Phase 2 — Medium (shared logic)

### Web
> **Dropped: `useApiMutation` hook.** A lightweight stand-in was considered for the repeated
> try/await/showNotification/throw blocks in `OrdersContext.jsx`/`CatalogContext.jsx`, but React Query
> (Phase 4, likely) replaces that pattern wholesale with `useMutation` + `invalidateQueries`. Building a
> throwaway now is wasted work — leave the duplication in place until Phase 4 removes it properly.
12. **`<PriceDisplay>` + `usePriceCalculation` hook** — extract the original/discounted price math+markup
    duplicated in `ProductCard.jsx`, `ProductListItem.jsx`, `ManageProductCard.jsx`, `ManageProductListItem.jsx`.
13. **`<OrderStatusStepper status, deliveryMethod />`** — unify the status UIs in `CustomerOrderList.jsx`,
    `OrderDetailPanel.jsx`, `DeliveryDriverDashboard.jsx`.
14. **`useFormValidation(initialValues, rules)` hook** (+ `utils/validationUtils.js`) — replace inline
    `fieldErrors` patterns in `LoginPage.jsx`, `RegisterPage.jsx`, `checkout/AddressForm.jsx`, `help/ContactForm.jsx`.

### Backend
15. **User role helper (extend existing)** — `backend/src/services/userRoles.helper.ts` already exports
    `getUserRolesWithNames(userId)` (used by `auth.service`). Add a **batch** variant
    `getUserRolesMapForUsers(userIds: number[]): Map<number, string[]>` (single `userRole.findMany` with
    `include: { role: true }` + `where: { userId: { in } }`) plus `formatUserWithRoles(user, map)`.
    Then collapse the hand-rolled `userRole.findMany → role.findMany → roleMap` blocks in `user.service.ts`
    — currently **10** `userRole.findMany` calls across ~3 duplicated blocks (`getAllUsers` ~L37-53,
    `getUserById` ~L95-106, and ~L246-257). Follow how `auth.service` already consumes the helper so callers
    stay unchanged.
16. **Order response shaper** — move `shapeOrderItem`/`shapeStatusEvents`/`shapePayments` (order.service.ts
    ~125-166) into a dedicated `OrderResponseShaper` reused across list/detail/delivered paths.

## Phase 3 — Large structural splits (higher risk; behavior-preserving)

Do each as its own PR with tests run before/after.

> **Required for every Phase 3 item: design the boundaries before cutting.** Each split must begin with a
> dedicated design pass — trace the file, identify genuinely independent responsibilities, map shared
> state/transactions/imports, and decide the exact module/component boundaries and the facade. Use the
> `feature-dev:code-architect` agent (or a `Plan` agent) to produce this boundary design, then **present it to
> the user for review/approval before writing code.** Splitting by line count or by guessed "concern" is how
> circular deps and broken transactions get introduced (see the #17 POS-transaction caution). No file gets cut
> without a reviewed boundary design.

### Backend
17. **Split `order.service.ts` (now 1076 LOC)** → `order.crud.service.ts`, `order.payment.service.ts`,
    `order.fulfillment.service.ts`, `order.response.service.ts` (from #16). Keep a facade `order.service.ts`
    re-exporting to avoid touching every import at once.
    **Caution:** order mutations now enqueue POS outbox events (`ORDER_CREATED` on APPROVED, `ORDER_UPDATED`
    on status change) **inside the same Prisma transaction**. Keep each enqueue call co-located with its order
    mutation in the same split module/transaction boundary — do not separate the enqueue from the write.
18. **Split `user.service.ts` (746 LOC)** → `user.role.service.ts` (#15), `user.approval.service.ts`,
    keep `user.service.ts` as facade.

### Web
19. **Split `OrdersPage.jsx` (816)** → `<AdminOrdersView>`, `<CustomerOrdersView>`, `<OrderFilters>`; page becomes controller.
20. **Split `OrderDetailPanel.jsx` (498)** → `<OrderDetailsView>`, `<OrderStatusEditor>`, `<OrderItemsEditor>`, `<OrderCheckIn>`.
21. **Split `CheckoutPage.jsx` (636)** → `<PaymentMethodSection>`, `<FulfillmentMethodSection>`, `<OrderSummarySection>` (state machine `checkoutMachine.js` stays).
22. **Split `ProductFormModal.jsx` (420)** → `<ProductBasicFields>`, `<ProductImagesSection>`, `<ProductVariantsSection>` (reuse existing `VariantRow`).

## Phase 4 — React Query migration (optional; after Phase 3)

Server-state strategy upgrade. **Prerequisite (AppContext split) is already complete.** Full detail lives in
`docs/REACT_QUERY_MIGRATION.md` — do not duplicate it here; this is the pointer + how it fits.

- **What it does:** replaces the hand-rolled `useState`/`useEffect`/loading-flag/`setInterval` server-state
  pattern in `CatalogContext`, `OrdersContext`, `StoreConfigContext`, `NotificationsContext`, and
  `creditBalance` (Auth) with `@tanstack/react-query` hooks — caching, background refetch, `refetchInterval`
  polling, and mutations with automatic cache invalidation.
- **This is the home for the OrdersContext/CatalogContext mutation duplication** (`useApiMutation` was
  dropped from Phase 2 in favor of doing it here). Items #12–#14 remain valid and independent.
- **Out of scope per the doc:** `AuthContext` session state, `CartContext` (localStorage), `UIContext`.
- **Shape:** 8 independently-deployable steps (setup → `useStoreConfig` → `useCategories` → `useProducts` →
  `useOrders` → `useNotifications` → `creditBalance` → remove shim). `useApp()` shim stays until all
  ~74 consumers migrate — no flag day. Est. ~one sprint.
- **Verification:** same as below, plus confirm polling intervals (`ORDER_POLL_INTERVAL_MS`,
  notification/staff-count intervals) still fire via `refetchInterval`, and that mutations invalidate the
  right query keys (e.g. order action → `['orders']`).

---

## Reuse — extend, don't reinvent
- Web: `services/createResourceApi.js`, `utils/dateUtils.js`, `utils/notificationMessage.js`, `utils/roles.js`,
  `components/common/{ConfirmationModal,PageHeader,ErrorBoundary,Notification}.jsx`, global `hooks/`.
  **Pattern to mirror for new hooks:** `features/manage-store/hooks/{useProducts,useProductFilters,useProductDragSort}.js`
  (with co-located `.test.js`). Put feature-specific hooks beside their feature; cross-cutting ones
  (`useModalState`, `useFormValidation`) in global `web/src/hooks/`.
- Backend: `utils/request.util.ts` (`validateRequest`, `parseIntParam`, `parsePaginationQuery`),
  `utils/asyncHandler.util.ts`, `utils/ttlCache.ts`, `middleware/error.middleware.ts` (`AppError`),
  `services/product.shared.ts`, `services/userRoles.helper.ts` (extend, see #15),
  `services/search/` (do not touch), `middleware/{auth,role}.middleware.ts`, `validators/deliveryAddress.ts`.
- **Do not touch:** `services/pos/**` (recently landed, already well-factored).

## Verification
- After each phase: `npm run test` (runs `test:backend` + `test:web`).
- Backend type safety: `npm --prefix backend run build` (tsc).
- For response-envelope (#8) and big splits: run relevant e2e/live smoke — `npm run test:e2e` and/or
  `npm run smoke:local` — to confirm web client still parses API shapes.
- Manual sanity: launch the app (`docker-compose.dev.yml`) and exercise orders, checkout, product CRUD,
  user approval, and image upload flows.
- Test-change policy (per change type):
  - **Logic-only refactors** (Phases 2–3 extractions/splits): assertions should not change. Splits keep a
    facade/re-export so imports stay stable. *New* shared code (utils/hooks/components) ships with its *own*
    new tests. Editing an existing assertion during a logic-only refactor is a red flag — investigate.
  - **Contract changes** (Phase 1.5: #8, and #9): response/error shapes *do* change, so their controller,
    integration, and service tests are expected to change in the same commit. That is correct, not a red flag.

## Hotspot files — order matters (avoid redoing work)
Several items touch the same file. Splitting/extracting a file and *then* applying small utils to it means
doing the small change twice and fighting merge conflicts. **Rule: for any hotspot file, do the structural
split first, then apply the small utils to the smaller resulting components** (or batch all of that file's
changes into one pass).
- `OrderDetailPanel.jsx` — touched by #1 (currency), #5 (dateTime), #13 (status stepper), #20 (split).
  → Do #20 (and #13's extraction) first, then apply #1/#5 to the resulting sub-components.
- `OrdersPage.jsx` — touched by #1, #5, #19 → split (#19) first, then #1/#5.
- `ProductFormModal.jsx` / `CsvImportModal.jsx` — touched by #2/#3 (modal) and #22 (split).
  → Migrate to `BaseModal` (#2) first, then split internals (#22).
- `OrdersContext.jsx` / `CatalogContext.jsx` — left untouched until Phase 4 (RQ).
Everything else is largely non-overlapping and can proceed in parallel.

## Suggested order & rough sizing (S ≤ half-day, M ≈ 1–2 days, L > 2 days)
1. **Phase 1 quick wins**, parallelizable: web #1 (S) ∥ #3 (S) ∥ #4 (S) ∥ #5 (S);
   backend #6 (S) ∥ #7 (S) ∥ #9 (S) ∥ #10 (S). Modal work #2 is **M** (see Deep Dive B) — start its B1/B1b early.
2. **Phase 1.5 contract change** #8 (M) — its own coordinated frontend+backend pass (Deep Dive A).
3. **Phase 2**: #12 (S, depends on #1), #13 (S), #14 (M), backend #15 (S), #16 (S).
4. **Phase 3 splits**, one PR each, respecting hotspot order above: #19 (M), #20 (M), #21 (M), #22 (M),
   #17 (L), #18 (M).
5. **Phase 4** React Query migration (L, ~one sprint) — optional but likely; absorbs the deferred context dedup.

---

# Deep Dive A — Response Envelope Standardization (#8)

## Investigation findings (from reading the code, not guessing)

**The error side is already done.** `backend/src/middleware/error.middleware.ts` (`AppError` + global
handler) emits `{ error: { code, message, requestId } }`, and the web client already tolerates every error
shape: `web/src/services/api.js:118-137` reads
`errorData?.error?.message ?? errorData.error(string) ?? errorData.message ?? errorData.errors`, and lifts
`error.code` / `error.requestId`. **No error-side work needed.**

**Only success responses are inconsistent.** Observed success shapes across controllers:
- Resource wrappers: `{ message, product }`, `{ message, category }`, `{ message, user }`, `{ message, order }`,
  `{ message, announcement }`, `{ orderItem }`
- Bare data: `{ token }`, `{ userId }`, `{ count }`, `{ url }`, `{ urls }`, `{ images }`
- Compound: `{ transaction, newBalance }`, `{ imported, skipped }`, `{ job }`
- Boolean-flag style: `{ success: true, message, messageId }` (contact)

**The blast radius is the service layer, not the components.** Success responses are consumed almost
entirely through `web/src/services/*.js` (27 files). Only `AuthContext.jsx` imports `api.js` primitives
directly. Service read-sites that pull a named key: `response.token` (×9), `response.user` (×6),
`response.order` (×3), `response.orderItem` (×2), `response.url`, `response.message`; plus `createResourceApi`
reads `response[resourceKey] || response` for product/category/announcement/user. **~12 read-sites + 1 factory
+ AuthContext = the entire frontend change surface.** The 74 components are insulated.

## Decision: target shape — **Option 1, full consistency (locked)**
**Every** success response uses `{ success: true, message?, data }` — no exceptions, including bare scalars
(`{ token }` → `{ data: { token } }`, `{ count }` → `{ data: { count } }`). `data` holds the resource or
compound payload (e.g. `data: { transaction, newBalance }`). Rationale: the goal is *consistent* shapes, not
*more* consistent; a "wrap-except-these" rule just codifies the drift and keeps per-endpoint knowledge in the
client. Full consistency lets the client unwrap `.data` in exactly one place and sets up React Query (Phase 4)
cleanly. Keep the existing error shape unchanged (it's already consistent).

**One sanctioned convention (not an exception):** list/collection endpoints use
`{ success: true, data: [...], meta: { count, limit, offset } }`. This is the standard collection envelope and
is forward-compatible with pagination — `data` is still the payload field, so the single-unwrap rule holds
(`meta` is read only where pagination is shown).

This also *simplifies the client*: `createResourceApi` drops the `response[resourceKey] || response` fallback
and always returns `.data`; the base `get/post/...` helpers in `api.js` can unwrap `.data` centrally so every
service stops hand-picking keys.

## Effort estimate: ~1–1.5 days. Moderate, mechanical, well-bounded.

## Step-by-step (each step independently committable)
- **A1. Add helper** — `backend/src/utils/responseEnvelope.ts`: `successResponse(data, message?)` →
  `{ success: true, message, data }`, and `listResponse(data, meta)` →
  `{ success: true, data, meta: { count, limit, offset } }`. Unit-test both.
- **A2. Migrate backend controllers in resource groups**, one commit each, updating that resource's
  controller test in the same commit: product → category → announcement → user → order → store-credit →
  upload → contact → auth → notification → reporting/printJob/misc. (Integration tests in
  `backend/src/integration/*.routes.test.ts` assert shapes — update alongside.)
- **A3. Update the web client to unwrap `.data` centrally** — prefer unwrapping in the `api.js`
  `get/post/put/patch/del` helpers (single choke point) so services stop hand-picking keys; otherwise do it in
  `createResourceApi.js` (always return `response.data`) plus the named read-sites (auth/token, users, orders,
  upload). For list endpoints, expose `meta` where pagination is consumed. Update each service's co-located
  `.test.js`. Components stay untouched. **Sequence A3 to land right after its A2 backend counterpart** (or
  feature-flag the unwrap) so client and server are never mismatched in a deployed state.
- **A4. Update `AuthContext.jsx`** (the one direct `api.js` consumer) if it reads success keys.
- **A5. Full-stack verification** (see below).

## Verification for A
- `npm run test:backend` after each A2 commit (controller + integration tests).
- `npm run test:web` after each A3 commit (service tests).
- `npm run test` green before/after the whole sequence.
- `npm run test:e2e` (or `npm run smoke:local`) — these exercise the real client↔server contract and will
  catch any missed read-site.
- Manual sanity: login (token), product/category CRUD (resource wrappers), place order + add item
  (`order`/`orderItem`), store-credit adjust (`transaction/newBalance`), image upload (`urls`),
  CSV import (`imported/skipped`), contact form.
- Grep guard: after migration, `grep -rn "response\.\(product\|category\|user\|order\|token\)" web/src/services`
  should return nothing (all reads go through `.data`).

---

# Deep Dive B — BaseModal + Modal CSS Consolidation (#2)

## Investigation findings
~13 modal components and ~2,500 lines of CSS across 10 files
(`MediaLibraryModal.css` 435, `SendPaymentModal.css` 325, `AnnouncementModal.css` 270,
`ProductMediaModal.css` 263, `RejectUserModal.css` 242, `CashAppModal.css` 234, `CreditModal.css` 201,
`ProductItemModal.css` 198, `ConfirmationModal.css` 193, `ImageCropModal.css` 134).

**Conventions conflict — this is NOT a find/replace:**
- `.modal-overlay` is defined in **4** files (RejectUserModal, ConfirmationModal, AnnouncementModal,
  ProductsPageAdmin) with potentially different values.
- Two close-button names: `.modal-close` (×2) vs `.modal-close-btn` (×4).
- Two container names: `.modal-container` (×2) vs `.modal-content` (×3).
- `.modal-header` / `.modal-body` / `.modal-footer` each redefined ~6×.
- Some files with modal CSS (`ImageCropModal`, `ProductMediaModal`, `ProductItemModal`) don't use
  `.modal-overlay` markup at all — they have bespoke structure and must be assessed individually.

## Decision: canonical contract
Pick ONE set: `.modal-overlay > .modal-dialog > {.modal-header, .modal-body, .modal-footer}` with
`.modal-close` and `.modal-icon-*`. Put it in a single shared `web/src/components/common/BaseModal.css`,
imported once by `BaseModal.jsx`. Each modal keeps ONLY its body-specific CSS; overlay/dialog/header/footer
CSS is deleted from per-modal files.

## Step-by-step (incremental — never big-bang)
- **B1. Build primitives + tests** — `BaseModal.jsx` (overlay click-to-close, `Esc` to close,
  stop-propagation, focus trap, `aria-modal`/role, scroll-lock), `<ModalHeader icon title subtitle onClose>`,
  `<ModalFooter>`; plus `BaseModal.css` with the canonical classes. Add `BaseModal.test.jsx`. **No migrations yet.**
- **B1b. CSS definition audit (do BEFORE writing `BaseModal.css`)** — for every shared class name that appears
  in more than one modal CSS file (`.modal-overlay` ×4, `.modal-header`/`.modal-body`/`.modal-footer` ×6,
  `.modal-title` ×4, `.modal-close`/`.modal-close-btn`, `.modal-container`/`.modal-content`, `.modal-icon-*`),
  extract and **diff the rule bodies side by side** to find where definitions diverge (padding, max-width,
  border-radius, z-index, animations, breakpoints). Produce a short reconciliation table: class → chosen
  canonical values → which modals differed and how. The canonical `BaseModal.css` is built from this table,
  not from whichever file is copied first. Any modal that *intentionally* differs (e.g. a wider media library
  dialog) keeps that override as a body-specific class, not by redefining the shared one. **This is the step
  that prevents silent visual regressions when classes merge.**
- **B2. Proof migration (2 modals)** — migrate the two simplest, `ConfirmationModal` and `RejectUserModal`
  (both already have tests: `ConfirmationModal.test.jsx`, `RejectUserModal.test.jsx`). Delete their
  overlay/header/footer CSS; keep body CSS. Commit each separately, run tests + visual diff, and verify
  against the B1b table before proceeding to the rest.
- **B3. Migrate the rest, one modal per commit** — `AnnouncementModal`, `SendPaymentModal`, `CashAppModal`,
  `CreditModal`, `MediaLibraryModal`, `CsvImportModal`, `AuthorizeNetPaymentModal`, then the bespoke ones
  (`ImageCropModal`, `ProductMediaModal`, `ProductItemModal`, `ProductFormModal`) assessed individually —
  some may only adopt `BaseModal` shell but keep custom internals.
- **B4. Remove the duplicate `.modal-overlay` in `ProductsPageAdmin.css`** once nothing references it.
- **B5. CSS dead-code sweep** — grep each removed class to confirm zero references before deleting.

## Verification for B (visual regression is the real risk)
- **Against the B1b reconciliation table:** for each migrated modal, confirm the rendered overlay/dialog/header/
  footer match the canonical values, and that any divergence from the modal's *original* CSS was a deliberate,
  noted entry in the table (not an accidental loss of a custom padding/width/animation).
- After **each** modal migration commit: run that modal's unit test (where present) + `npm run test:web`.
- **Manual visual diff per modal** — open each modal in the running app (`docker-compose.dev.yml`), check at
  desktop + mobile widths: overlay dim, dialog max-width/centering, header/footer spacing, close button
  position, scroll behavior on long content, animations.
- **Chrome DevTools MCP screenshots** (optional but recommended): capture before/after of each modal for a
  side-by-side; covers the 8 most-used modals.
- Accessibility check (a11y skill): focus trap, `Esc`, focus returns to trigger on close, `aria-modal`.
- Grep guard after B5: `grep -rn "\.modal-overlay\|\.modal-close-btn\|\.modal-content" web/src` should only
  hit `BaseModal.css` (or be empty for the deprecated aliases).
