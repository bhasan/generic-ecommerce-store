# Local Card Payment Testing (Authorize.Net)

How to exercise the full **Credit / Debit Card** checkout against the Authorize.Net
**sandbox** on a local dev machine.

## Why a tunnel is required

Authorize.Net Accept Hosted renders the card form in an iframe and communicates the
result back through an **iframe communicator** page. Authorize.Net requires that
communicator URL to be **`https://`** — it rejects `http://localhost` outright — and the
communicator must be **same-origin** as the checkout page.

So you cannot test card payments on plain `http://localhost:5843`. The whole app has to
be reached over a single HTTPS origin. A quick **cloudflared** tunnel gives you a
throwaway `https://<random>.trycloudflare.com` URL that proxies to your local frontend.
No Cloudflare account, login, or DNS is needed.

## What's already wired up

These are committed, so you don't edit files each time:

- **`docker-compose.dev.yml`** — the backend reads
  `CORS_ORIGIN: ${DEV_CORS_ORIGIN:-http://localhost:5843}`. The Authorize.Net communicator
  URL is derived from `CORS_ORIGIN`, so you override it for a test run by setting the
  `DEV_CORS_ORIGIN` env var (defaults back to localhost when unset).
- **`web/vite.config.js`** — `server.allowedHosts` already includes `.trycloudflare.com`
  (and `.ngrok-free.app` / `.ngrok.io`), so Vite accepts the tunnel host.
- **`backend/.env`** — must contain `PAYMENT_ENCRYPTION_KEY` (a 64-char hex string) or the
  backend will not boot. (It already does locally.)

## One-time: get cloudflared

```bash
curl -sL -o /tmp/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x /tmp/cloudflared
/tmp/cloudflared --version
```

## Runbook

### 1. Start the dev stack

```bash
cd ~/projects/generic-ecommerce-store-delivery
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db backend web-dev
```

Frontend (Vite) is on `5843`, backend on `3000`, Postgres on `15432`.

### 2. Start the tunnel and copy the URL

```bash
/tmp/cloudflared tunnel --url http://localhost:5843 --no-autoupdate
```

Leave this running in its own terminal. Look for a line like:

```
https://<random-words>.trycloudflare.com
```

### 3. Point the backend at the tunnel and recreate it

This makes the communicator URL HTTPS:

```bash
DEV_CORS_ORIGIN="https://<random-words>.trycloudflare.com" \
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate backend
```

Wait until the backend is healthy:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/config   # expect 200
```

### 4. Use the app *through the tunnel URL*

Open `https://<random-words>.trycloudflare.com` in the browser (**not** localhost).

1. Log in (e.g. seed user `johncustomer` / `customer123`).
2. Make sure card payments are enabled with valid sandbox credentials in
   **Admin → Website Management → Payment Methods** (Authorize.Net card). Sandbox API
   Login ID + Transaction Key, sandbox mode on.
3. Add an item → Checkout → **Credit / Debit Card** → Place Order & Pay.
4. In the hosted form use an Authorize.Net **sandbox test card**:
   - Visa `4111 1111 1111 1111`, or Mastercard `5424 0000 0000 0015`
   - Expiry: any future date (e.g. `12/28`), CVC: any 3 digits, ZIP: any valid ZIP.

### 5. Tear down

```bash
# Ctrl-C the cloudflared terminal, then restore the localhost CORS origin:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate backend
```

## Gotchas

- **New URL every run.** `trycloudflare.com` URLs are random per launch, so steps 2–3
  repeat each time. For a stable subdomain use ngrok with an account (`allowedHosts`
  already covers `.ngrok-free.app`).
- **Browse via the tunnel, not localhost.** If the checkout page is on `localhost` but the
  communicator loads from the tunnel origin, the origins don't match and the payment-result
  relay is silently dropped.
- **Exposes the dev server publicly** for the tunnel's lifetime — fine for a quick test,
  don't leave it running.
- **Sandbox `transactResponse` quirk.** In the Authorize.Net *sandbox* the post-payment
  auto-confirm (`transactResponse`) may not fire, leaving the order in `PENDING_PAYMENT`
  even after a successful charge (the receipt shows an Authorization Code + Transaction ID).
  Verify the full round-trip on a live/production Authorize.Net account.

## Cleanup of stray tunnels

```bash
pkill -f cloudflared
```
