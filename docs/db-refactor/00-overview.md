# Database Rearchitecture — Roadmap (Approach A)

## Why
The current Postgres + Prisma schema has structural debt: **no foreign keys** (a past
migration dropped them all; the service layer re-joins by hand and delete handlers leave
orphans), **money as `Float`** (payment checks use a `±0.01` tolerance), a **flat catalog**
with three overlapping image fields and JSON pricing config, **stringly-typed / inconsistent**
columns (PrintJob's snake_case physical naming, duplicated delivery-zone fields on
User/Order), and review votes stored as `Int[]` arrays.

Target: **Approach A** — fully normalized relational design with enforced foreign keys,
`Decimal` money, first-class pricing tables, consistent naming. The app will scale to
**thousands of products**, so variants and proper indexing are warranted, not gold-plating.

## Locked decisions (from the 2026-06-16 brainstorm)
- **Reseed, not backfill.** Migrations for non-user tables can be destructive; reseed via
  `backend/prisma/seed.ts`.
- **Preserve `users`** (+ `roles`, `user_roles`). Live deployment has real users but **no
  orders/credits yet** (`creditBalance = 0`), so everything else is safe to drop & reseed.
- **Printer agent in scope.** `printJob.service.ts` uses raw SQL with snake_case columns;
  the PrintJob rename must update that raw SQL. The external HTTP print agent is unaffected
  (it already receives camelCase JSON from the response mapper).
- **All money → `Decimal` in one pass** (Phase 1), to avoid a Float/Decimal seam between phases.
- **Order of work: cleanup first, then the variant feature, then enhancements.**

## Phases (run one at a time; each keeps the app functional)
| # | Phase | File | User-visible? |
|---|-------|------|---------------|
| 1 | Foundation cleanup — integrity, money, indexes, naming, delivery-zone dedupe, review votes, printer raw SQL | `01-foundation-cleanup.md` | No (invisible correctness pass) |
| 2 | Catalog: Product → Variant (+ full variant UI) | `02-catalog-variants.md` | Yes (variants) |
| 3 | Order & payment enhancements — status history, dedicated Payment table | `03-order-payment-enhancements.md` | Yes (admin) |

## Cross-cutting principles
- Re-introduce Prisma **relations with explicit `onDelete`** (Restrict for owner refs,
  Cascade for child rows, SetNull for soft refs like `createdBy`).
- Money → `Decimal(12,2)`; quantities/weights → `Decimal(12,3)`; tax rate → `Decimal(6,4)`.
- Add indexes on every FK/filter column actually queried.
- Replace magic strings with enums; standardize physical naming.
- API mapper serializes `Decimal` → `number` so existing frontend money reads keep working.
- Replace manual Map-joins with Prisma `include`s as relations return.

> Status: **plans only** — nothing implemented yet.
</content>
