#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${1:-}" ]]; then
  echo "Usage: $0 <server-ip>"
  exit 1
fi

SERVER_IP="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Running build..."
bash "$SCRIPT_DIR/build.sh"

echo ""
echo "==> Running deploy..."
bash "$SCRIPT_DIR/deploy.sh" "$SERVER_IP"
