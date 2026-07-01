#!/usr/bin/env bash
# ============================================================================
# Issue/renew the wildcard certificate for *.yourapp.com via DNS-01.
# ----------------------------------------------------------------------------
# A wildcard cert (*.yourapp.com) can ONLY be issued via the DNS-01 challenge —
# Let's Encrypt will not issue a wildcard over HTTP-01. That means certbot needs
# permission to create a TXT record in your DNS zone, via a provider plugin.
# This example uses Cloudflare; swap the plugin + creds for your provider
# (route53, google, digitalocean, ...).
#
# Prereqs:
#   - certbot + the DNS plugin:  apt install certbot python3-certbot-dns-cloudflare
#   - a scoped API token with Zone:DNS:Edit, stored 0600 at the path below:
#       dns_cloudflare_api_token = <token>
#
# Run on a schedule (certbot's systemd timer / cron) for auto-renewal, then
# reload the proxy:  `nginx -s reload`  (or Caddy reloads automatically).
# ============================================================================
set -euo pipefail

APEX="${APEX_DOMAIN:-yourapp.com}"
EMAIL="${ACME_EMAIL:-ops@yourapp.com}"
CF_CREDENTIALS="${CF_CREDENTIALS:-/etc/letsencrypt/cloudflare.ini}"

certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials "${CF_CREDENTIALS}" \
  --dns-cloudflare-propagation-seconds 30 \
  -d "${APEX}" \
  -d "*.${APEX}" \
  --cert-name "${APEX}" \
  --agree-tos -m "${EMAIL}" --non-interactive

echo "Issued/renewed wildcard cert for ${APEX} and *.${APEX}"
echo "Now reload the proxy:  docker exec <nginx> nginx -s reload"
