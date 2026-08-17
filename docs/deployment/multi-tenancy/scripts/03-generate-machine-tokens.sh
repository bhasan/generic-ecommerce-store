#!/usr/bin/env bash
# ============================================================================
# Issue the reporting + print-agent machine tokens for ONE tenant.
#   DATABASE_URL=... bash 03-generate-machine-tokens.sh [tenant-slug]   # default 'app'
#
# The app stores only a SHA-256 hash of each token; the plaintext is shown ONCE
# here. Token format matches the app exactly: base64url(32 random bytes), stored
# as lowercase sha256 hex (see backend/src/utils/machineToken.ts).
#
# After the multi-tenant migration the OLD global reporting/print tokens stop
# authenticating — reconfigure each integration with the token printed below.
# Re-running this ROTATES the tokens (old ones immediately stop working).
# ============================================================================
set -euo pipefail

SLUG="${1:-app}"
: "${DATABASE_URL:?set DATABASE_URL}"

gen_token() { openssl rand -base64 32 | tr '+/' '-_' | tr -d '='; }     # base64url, unpadded
sha256_hex() { printf '%s' "$1" | openssl dgst -sha256 | awk '{print $NF}'; }

REPORTING_TOKEN="$(gen_token)"; REPORTING_HASH="$(sha256_hex "$REPORTING_TOKEN")"
PRINT_KEY="$(gen_token)";       PRINT_HASH="$(sha256_hex "$PRINT_KEY")"

# `| grep -oE '^[0-9]+'` keeps only the RETURNING id row, dropping psql's
# "UPDATE 1" command-tag line that some versions also print under -tA.
TENANT_ID="$(psql "$DATABASE_URL" -tA -c \
  "UPDATE tenants
      SET \"reportingTokenHash\" = '$REPORTING_HASH',
          \"printAgentKeyHash\"  = '$PRINT_HASH',
          \"updatedAt\" = now()
    WHERE slug = '$SLUG'
  RETURNING id;" | grep -oE '^[0-9]+' | head -1)"

if [ -z "$TENANT_ID" ]; then
  echo "ERROR: no tenant with slug '$SLUG'." >&2
  exit 1
fi

cat <<EOF

  ── Tokens issued for tenant '$SLUG' (tenant id $TENANT_ID) ──
  STORE THESE NOW. They are shown once; only the hash is kept in the database.

  Reporting API token : $REPORTING_TOKEN
  Print agent key     : $PRINT_KEY

  Send each as the HTTP Authorization Bearer token from the respective
  integration (reporting API / print agent). The token now identifies the
  tenant — there is no separate tenant header.
EOF
