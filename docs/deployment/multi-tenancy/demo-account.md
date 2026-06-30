# Setting up a demo account

A demo tenant is just another tenant on the shared instance — fully isolated from
your real `app` data by the same tenant scoping. There are two ways to create
one; use the seed script if you want a ready-made demo with sample catalog +
orders, or the UI if you want an empty tenant to populate yourself.

## Option A — seeded demo with sample data (recommended)

The repo ships an **idempotent** demo seed that creates a `demo` tenant with a
store, staff + customer users, a small catalog, and a few orders.

```bash
# from backend/ (or: docker exec <backend> sh -c 'cd /app && npm run prisma:seed:demo')
npm run prisma:seed:demo
```

It creates:

| Tenant | `demo` ("Demo Smoke Shop", plan `demo`) |
|---|---|
| Store | `main` (default, active) |
| Manager login | `demo-manager` / `demo1234` |
| Customer login | `demo-customer` / `demo1234` |
| Catalog | Demo Widget / Gadget / Gizmo + a few demo orders |

Re-running is safe — it finds the existing `demo` tenant instead of duplicating
it. (`demo` is not a reserved slug, so it's allowed.)

## Option B — empty demo tenant via the super-admin UI

1. Log in as a **super-admin** (see the main runbook, step 4).
2. Website Management → **Tenants** → **Create tenant**:
   - Slug `demo`, Name `Demo Smoke Shop`, an admin username + password.
3. Copy the reporting/print tokens it shows once (only needed if the demo uses
   those integrations).

This gives an empty tenant; add catalog/content through the demo tenant's own
admin UI.

## Reaching the demo store

The app resolves the tenant from the host (or an explicit header):

| Context | How |
|---|---|
| Production (subdomain) | point `demo.yourapp.com` at the instance (covered by the `*.yourapp.com` wildcard cert) and visit it |
| Production (custom domain) | map a `customDomain` on the `demo` tenant (see `docs/guides/multi-tenant-tls.md`) |
| Local / API testing | send header `X-Tenant-Slug: demo` (highest-priority override), e.g. `curl -H 'X-Tenant-Slug: demo' http://localhost:3000/api/health` |

Then log in with the demo credentials above. Everything the demo user does stays
inside the `demo` tenant — it cannot see or touch `app` (or any other tenant's)
data.

## Tearing a demo down

Suspend it from the Tenants screen (status → `SUSPENDED`; the resolver then 403s
that host), or delete the tenant's rows directly if you need a hard removal
(there is no cascade-delete tenant API yet — that's part of the deferred
super-admin portal work).

> ⚠️ Don't reuse a real customer's data for demos — seed obviously-fake data
> (the seed script already does). Outbound notifications are sanitized, but a
> public demo tenant is still internet-reachable like any other tenant.
