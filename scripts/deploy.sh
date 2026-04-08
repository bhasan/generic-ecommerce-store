#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${1:-}" ]]; then
  echo "Usage: $0 <server-ip>"
  exit 1
fi

SERVER_IP="$1"
TIMESTAMP_FILE="/tmp/ssd_last_build_timestamp"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_ROOT/docker"

# --- Read timestamp from last build ---
if [[ ! -f "$TIMESTAMP_FILE" ]]; then
  echo "Error: No build timestamp found at $TIMESTAMP_FILE."
  echo "       Run scripts/build.sh first."
  exit 1
fi

TIMESTAMP=$(cat "$TIMESTAMP_FILE")
BACKEND_TAR="$DOCKER_DIR/backend_$TIMESTAMP.tar"
WEB_TAR="$DOCKER_DIR/web_$TIMESTAMP.tar"

if [[ ! -f "$BACKEND_TAR" || ! -f "$WEB_TAR" ]]; then
  echo "Error: Image tar files not found for timestamp $TIMESTAMP."
  echo "       Expected:"
  echo "         $BACKEND_TAR"
  echo "         $WEB_TAR"
  echo "       Run scripts/build.sh to rebuild."
  exit 1
fi

echo "==> Deploy target: root@$SERVER_IP"
echo "==> Timestamp:     $TIMESTAMP"
echo ""
echo "    Files to upload:"
echo "      $BACKEND_TAR ($(du -h "$BACKEND_TAR" | cut -f1))"
echo "      $WEB_TAR ($(du -h "$WEB_TAR" | cut -f1))"

# --- Confirm upload ---
echo ""
read -rp "Proceed with upload? [y/N] " confirm_upload
if [[ "$confirm_upload" != "y" && "$confirm_upload" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "==> [1/3] Uploading images to root@$SERVER_IP:/docker/images/..."
scp "$BACKEND_TAR" "root@$SERVER_IP:/docker/images/"
scp "$WEB_TAR" "root@$SERVER_IP:/docker/images/"

echo ""
echo "==> [2/3] Loading images on server..."
ssh "root@$SERVER_IP" "docker load -i /docker/images/backend_$TIMESTAMP.tar && docker load -i /docker/images/web_$TIMESTAMP.tar"

# --- Confirm compose up ---
echo ""
read -rp "Run 'docker compose up -d backend web' on server? [y/N] " confirm_up
if [[ "$confirm_up" != "y" && "$confirm_up" != "Y" ]]; then
  echo "Skipped compose up. Images are loaded and ready."
  exit 0
fi

echo ""
echo "==> [3/3] Starting services on server..."
ssh "root@$SERVER_IP" "cd /docker/smoke-station && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend web"

echo ""
echo "==> Deploy complete."
