#!/usr/bin/env bash
# ============================================================================
# Issue a certificate for ONE tenant custom domain via HTTP-01 (webroot).
# ----------------------------------------------------------------------------
# Use this with the nginx path when a tenant maps their own domain (the wildcard
# cert does not cover arbitrary custom domains). A provisioning hook should call
# this AFTER the tenant has pointed their domain's A/AAAA record at this server,
# then render the per-custom-domain nginx server block and reload nginx.
#
# HTTP-01 needs the domain to already resolve here and port 80 reachable; the
# nginx :80 block in nginx.multitenant.conf.template serves /.well-known/acme-
# challenge from /var/www/certbot.
#
# (If you use the Caddy path instead, you do NOT need this — Caddy issues
#  custom-domain certs on demand. This script is the nginx-path equivalent.)
# ============================================================================
set -euo pipefail

DOMAIN="${1:?usage: issue-custom-domain-cert.sh <custom-domain>}"
EMAIL="${ACME_EMAIL:-ops@yourapp.com}"
WEBROOT="${ACME_WEBROOT:-/var/www/certbot}"

certbot certonly \
  --webroot -w "${WEBROOT}" \
  -d "${DOMAIN}" \
  --cert-name "${DOMAIN}" \
  --agree-tos -m "${EMAIL}" --non-interactive

echo "Issued cert for ${DOMAIN}."
echo "Render its nginx server block from nginx/nginx.multitenant.conf.template (section B), then: nginx -s reload"
