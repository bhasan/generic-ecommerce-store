# Multi-tenant HTTPS / TLS deployment

How to put Generic Ecommerce Store behind HTTPS for many tenants on one instance. The
application side is already done — this is purely the edge (DNS + TLS + proxy).

## The one thing the app needs from the edge

Generic Ecommerce Store resolves the active tenant from the **HTTP Host header** (named
subdomain or custom domain → `backend/src/middleware/tenant.middleware.ts`). So
the proxy's entire multi-tenant responsibility is:

1. Terminate TLS for every hostname that should reach the app.
2. Forward the **original Host** unchanged (`proxy_set_header Host $host` in
   nginx; automatic in Caddy `reverse_proxy`).

Do **not** rewrite or hardcode Host — that's the tenant's identity.

## Two classes of hostname

| Class | Example | Cert strategy |
|---|---|---|
| **Platform subdomains** | `acme.yourapp.com` | **One wildcard cert** `*.yourapp.com` via **DNS-01** |
| **Tenant custom domains** | `shop.acmevapes.com` | Per-domain cert (nginx) **or** on-demand TLS (Caddy) |

A wildcard `*.yourapp.com` matches exactly one label, so it covers every tenant
subdomain with a single cert — but **not** the bare apex (list `yourapp.com`
explicitly) and **not** custom domains (different registrable domain, separate
SNI).

## DNS

- `*.yourapp.com` and `yourapp.com` → A/AAAA to the instance (one wildcard DNS
  record covers all tenant subdomains; no DNS change when you add a tenant).
- Each **custom domain** is pointed at the instance by the *tenant* (an A/AAAA
  record, or CNAME to `yourapp.com`). Store it in `Tenant.customDomain`
  (resolution already matches it).

## Option 1 — nginx (good for subdomains + a few custom domains)

1. Issue the wildcard cert (DNS-01 — the only way to get a wildcard):
   ```bash
   APEX_DOMAIN=yourapp.com ACME_EMAIL=ops@yourapp.com \
     infra/tls/issue-wildcard-cert.sh
   ```
   (Cloudflare example; swap the certbot DNS plugin for your provider.)
2. Use `nginx/nginx.multitenant.conf.template` — the wildcard `server` block
   (section A) serves apex + all subdomains. Extract the shared `location`
   blocks into `/etc/nginx/snippets/app-locations.conf` and `include` them.
3. For each **custom domain** a tenant adds: after they point DNS at you,
   ```bash
   infra/tls/issue-custom-domain-cert.sh shop.acmevapes.com
   ```
   then render section B's `server` block for that domain and `nginx -s reload`.
   Automate this from a provisioning hook once it's more than occasional.
4. `docker-compose.prod.yml` already mounts `/etc/letsencrypt` and exposes 443.

**Trade-off:** custom domains need a cert + server block + reload each. Fine for
a few; tedious past a couple dozen → use Caddy.

## Option 2 — Caddy (recommended once custom domains scale)

`infra/tls/Caddyfile.template`. Caddy auto-issues/renews everything, including
**on-demand TLS** for arbitrary custom domains — no per-domain config or reload.

Guardrail: on-demand TLS must ask the app whether a hostname is a real, active
tenant before minting a cert, or anyone could point a domain at you and exhaust
rate limits. The Caddyfile points `on_demand_tls.ask` at
`GET /api/internal/tls-allowed?domain=<host>`. **You need to add this route**
(unauthenticated, internal-only): return `200` iff an ACTIVE tenant has that
`customDomain` (or it's a `*.yourapp.com` subdomain), else `404`. ~15 lines over
`getUnscopedPrisma().tenant.findFirst({ where: { customDomain } })`. Until it
exists, restrict on-demand TLS to a static allowlist.

- Wildcard subdomains still use DNS-01 (needs a DNS-provider plugin build of
  Caddy, e.g. `caddy-dns/cloudflare`, + `CF_API_TOKEN`).
- Point Caddy's `reverse_proxy` at `backend:3000`; serve the built SPA from
  `/usr/share/nginx/html`.

## Verifying

```bash
# Subdomain resolves to its tenant over TLS:
curl -sI https://acme.yourapp.com/api/health
# Custom domain resolves to the same tenant:
curl -sI https://shop.acmevapes.com/api/health
# Unknown subdomain is a hard 404 (tenant.middleware), not a default tenant:
curl -s https://nope.yourapp.com/api/health
```

Confirm the app sees the right tenant: every backend log line carries
`tenantId` (and nginx/Caddy access logs carry `host`) — a request to
`acme.yourapp.com` must log acme's tenantId.

## Checklist before going multi-tenant in prod

- [ ] Wildcard cert for `*.yourapp.com` + apex issued and auto-renewing.
- [ ] Wildcard DNS record live.
- [ ] Proxy forwards Host unchanged; `/metrics` blocked at the edge.
- [ ] `CORS_ORIGIN` set (the app refuses `*` in production) — for many tenant
      origins, drive it from config or relax to the apex + a subdomain regex.
- [ ] `APP_ROOT_DOMAIN_LABELS` set if your apex isn't 2 labels (e.g. `.co.uk` = 3).
- [ ] Custom-domain path chosen (nginx per-domain **or** Caddy on-demand + the
      `tls-allowed` route).
- [ ] HSTS enabled (templates include it) once you're sure every host is HTTPS.
