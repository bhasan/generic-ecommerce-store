#!/usr/bin/env bash
# Generates a cryptographically secure 32-byte (64 hex char) AES-256 key
# suitable for PAYMENT_ENCRYPTION_KEY.
#
# Usage:
#   ./scripts/generate-encryption-key.sh
#
# Prints the key and the env var assignment ready to paste into a .env file.

set -euo pipefail

if command -v openssl &>/dev/null; then
  KEY=$(openssl rand -hex 32)
elif command -v xxd &>/dev/null; then
  KEY=$(dd if=/dev/urandom bs=32 count=1 2>/dev/null | xxd -p | tr -d '\n')
else
  echo "ERROR: neither openssl nor xxd found — cannot generate a secure key." >&2
  exit 1
fi

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  PAYMENT_ENCRYPTION_KEY — save this somewhere safe now."
echo "  It cannot be recovered after this session."
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "  Key (hex):  $KEY"
echo ""
echo "  .env line:  PAYMENT_ENCRYPTION_KEY=$KEY"
echo ""
echo "══════════════════════════════════════════════════════════════"
echo ""
