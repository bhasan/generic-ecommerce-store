#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${1:-}" ]]; then
  echo "Usage: $0 <server-ip>"
  exit 1
fi

SERVER_IP="$1"
SSH_SOCKET="/tmp/ssd_ssh_mux_${SERVER_IP}_$$"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_ROOT/docker"

BACKEND_TAR="$DOCKER_DIR/backend.tar"
WEB_TAR="$DOCKER_DIR/web.tar"

if [[ ! -f "$BACKEND_TAR" || ! -f "$WEB_TAR" ]]; then
  echo "Error: Image tar files not found."
  echo "       Expected:"
  echo "         $BACKEND_TAR"
  echo "         $WEB_TAR"
  echo "       Run scripts/build.sh to rebuild."
  exit 1
fi

echo "==> Deploy target: root@$SERVER_IP"
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

# --- Open master SSH connection (single password prompt) ---
echo ""
echo "==> Connecting to root@$SERVER_IP (you will be prompted for the password once)..."
ssh -fNM -o ControlMaster=yes -o ControlPath="$SSH_SOCKET" -o ControlPersist=600 "root@$SERVER_IP"
trap 'ssh -O exit -o ControlPath="$SSH_SOCKET" "root@$SERVER_IP" 2>/dev/null || true' EXIT

SSH_OPTS=(-o ControlMaster=no -o ControlPath="$SSH_SOCKET")

echo ""
echo "==> [1/3] Uploading images to root@$SERVER_IP:/docker/images/..."
scp "${SSH_OPTS[@]}" "$BACKEND_TAR" "root@$SERVER_IP:/docker/images/"
scp "${SSH_OPTS[@]}" "$WEB_TAR" "root@$SERVER_IP:/docker/images/"

echo ""
echo "==> [2/3] Loading images on server..."
ssh "${SSH_OPTS[@]}" "root@$SERVER_IP" "docker load -i /docker/images/backend.tar && docker load -i /docker/images/web.tar"

echo ""
echo "==> Verifying images are retained on server..."
ssh "${SSH_OPTS[@]}" "root@$SERVER_IP" "ls -lh /docker/images/backend.tar /docker/images/web.tar"

# --- Confirm compose up ---
echo ""
read -rp "Run 'docker compose up -d backend web' on server? [y/N] " confirm_up
if [[ "$confirm_up" != "y" && "$confirm_up" != "Y" ]]; then
  echo "Skipped compose up. Images are loaded and ready."
  exit 0
fi

echo ""
echo "==> [3/3] Starting services on server..."
ssh "${SSH_OPTS[@]}" "root@$SERVER_IP" "cd /docker/smoke-station && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend web"

echo ""
echo "==> Deploy complete."
