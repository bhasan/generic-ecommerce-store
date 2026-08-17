# Migrating a live (single-tenant) instance to multi-tenant

This runbook upgrades an **existing production** Smoke Station instance (one
store, no tenant columns) to the multi-tenant architecture. After it, all your
current data lives under a default tenant (`app`) exactly as before, and you can
provision additional tenants.

> **Branch context:** this work branched from `develop` at `622ec0e`. It adds
> exactly **three** Prisma migrations on top of what `develop`/prod already has:
> | Migration | What it does |
> |---|---|
> | `20260627000000_multitenancy_core` | Creates `tenants` + `stores`, adds `tenantId`/`storeId` columns, **inserts the default `app` tenant + store, backfills every existing row to it, then sets the columns `NOT NULL`** |
> | `20260630000000_tenant_scope_unique_constraints` | Swaps single-column unique indexes for `(tenantId, …)` composite uniques |
> | `20260630010000_tenant_machine_tokens` | Adds `reportingTokenHash` / `printAgentKeyHash` to `tenants` |
>
> The data backfill is **inside** the core migration, so `prisma migrate deploy`
> does the whole schema+data move. You only run small scripts afterward for the
> two things migrations can't: a super-admin and per-tenant machine tokens.

## ⚠️ Read first — breaking changes

1. **Reporting API + print-agent auth are now PER-TENANT.** The old global
   `ONLINE_STORE_REPORTING_API_TOKEN` and `PRINT_AGENT_SHARED_KEY` **no longer
   authenticate**. After migration, any external reporting/printer integration
   gets `401` until you issue the tenant its new token (step 5) and reconfigure
   the integration with it. Plan a short coordination window for this.
2. **Fail-closed scoping requires `NODE_ENV=production`.** In production the
   tenant-scoped DB client throws if a query ever runs without tenant context
   (correct, fail-closed). Confirm prod actually sets `NODE_ENV=production`
   (the prod Dockerfile + `docker-compose.prod.yml` do).
3. **`tenantId`/`storeId` become `NOT NULL`.** The core migration backfills
   before enforcing this, so it's safe — but it means the backfill UPDATEs touch
   every row of the large tables (orders, order_items, payments…). On a big DB
   expect the migration to hold brief locks; run it in a maintenance window.

## Pre-flight

```bash
# 1. BACK UP THE DATABASE. Non-negotiable — there is no down-migration; rollback
#    = restore this dump.
pg_dump "$DATABASE_URL" -Fc -f generic-ecommerce-store-pre-multitenant-$(date +%Y%m%d%H%M).dump

# 2. Confirm the DB is on the expected migration state (everything up to the
#    branch point already applied, the 3 new ones NOT yet applied).
psql "$DATABASE_URL" -c "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"
#    You should NOT see 20260627000000_multitenancy_core yet.

# 3. Sanity-check the data the backfill will touch (see scripts/01-pre-flight-checks.sql).
psql "$DATABASE_URL" -f docs/deployment/multi-tenancy/scripts/01-pre-flight-checks.sql
```

Set/confirm these env vars on the backend before starting the new image:

| Var | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | fail-closed tenant scoping |
| `CORS_ORIGIN` | your apex (NOT `*`) | app refuses `*` in prod |
| `APP_ROOT_DOMAIN_LABELS` | `2` (or `3` for `.co.uk` etc.) | subdomain parsing |
| `DATABASE_URL` | unchanged | |

## Migration

You can either let the app self-migrate on boot (`start:prod` runs
`prisma migrate deploy` before `node dist/index.js`) **or** — recommended for a
controlled cutover — run it explicitly with the app stopped:

```bash
# With the new image/code present and the app NOT yet serving:
cd backend
npx prisma migrate deploy        # applies the 3 migrations; core backfills to 'app'
```

Expected tail: `3 migrations applied`. If it errors, the transaction rolls back
the failing migration — restore from the dump if state is unclear, fix, retry.

## Post-migration (the two things migrations can't do)

```bash
# 4. Bootstrap a SUPER_ADMIN (platform operator). This grants the SUPER_ADMIN
#    role to your EXISTING admin user — no new password needed. Edit the username
#    inside the script if your admin isn't called 'admin'.
psql "$DATABASE_URL" -f docs/deployment/multi-tenancy/scripts/02-bootstrap-super-admin.sql

# 5. Issue the default tenant's machine tokens (reporting + print). Prints the
#    PLAINTEXT tokens ONCE — store them in your secrets manager and reconfigure
#    your reporting/printer integrations with them.
DATABASE_URL="$DATABASE_URL" \
  bash docs/deployment/multi-tenancy/scripts/03-generate-machine-tokens.sh app
```

> Alternatively, do step 5 from the UI: log in as the super-admin → Website
> Management → **Tenants** → **Regenerate tokens** on the `app` row.

## Verify

```bash
psql "$DATABASE_URL" -f docs/deployment/multi-tenancy/scripts/04-verify-migration.sql
```

It asserts: the `app` tenant + its default store exist; **no** tenant-scoped row
has a NULL `tenantId`; the `SUPER_ADMIN` role exists and is assigned; and the
`app` tenant has both token hashes set. All checks must print `OK`.

Then start the app and smoke-test:

```bash
curl -sf https://yourapp.com/api/health            # 200
# log in normally — your existing users/orders/products are all under 'app'
# log in as the super-admin and open Website Management → Tenants
```

## Rollback

There is no down-migration (the backfill is destructive of the "no tenant"
state). To roll back: stop the app, `pg_restore` the pre-migration dump, and
redeploy the previous image.

```bash
pg_restore --clean --if-exists -d "$DATABASE_URL" generic-ecommerce-store-pre-multitenant-*.dump
```

## Next

- **Provision more tenants:** super-admin → Website Management → Tenants → Create.
- **Custom domains / wildcard TLS:** see `docs/guides/multi-tenant-tls.md`.
- **Set up a demo account:** see [`demo-account.md`](./demo-account.md).
