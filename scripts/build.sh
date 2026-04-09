#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_ROOT/docker"
TIMESTAMP_FILE="/tmp/ssd_last_build_timestamp"

echo "==> Project root: $PROJECT_ROOT"
echo "==> Docker output dir: $DOCKER_DIR"
mkdir -p "$DOCKER_DIR"

# --- Web pre-build (Vite) ---
echo ""
echo "==> [1/5] Building web (npm run build)..."
cd "$PROJECT_ROOT/web"
npm run build
cd "$PROJECT_ROOT"

# --- Docker image builds ---
echo ""
echo "==> [2/5] Building backend Docker image..."
docker build -t smoke-station-delivery/backend:latest -f backend/Dockerfile ./backend

echo ""
echo "==> [3/5] Building web Docker image..."
docker build -t smoke-station-delivery/web:latest -f nginx/Dockerfile .

# --- Save images ---
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKEND_TAR="$DOCKER_DIR/backend_$TIMESTAMP.tar"
WEB_TAR="$DOCKER_DIR/web_$TIMESTAMP.tar"

echo ""
echo "==> [4/5] Saving backend image to $BACKEND_TAR..."
docker save smoke-station-delivery/backend:latest -o "$BACKEND_TAR"

echo "==> [5/5] Saving web image to $WEB_TAR..."
docker save smoke-station-delivery/web:latest -o "$WEB_TAR"

# --- Summary ---
echo ""
echo "==> Build complete."
echo "    Backend: $BACKEND_TAR ($(du -h "$BACKEND_TAR" | cut -f1))"
echo "    Web:     $WEB_TAR ($(du -h "$WEB_TAR" | cut -f1))"
echo "    Timestamp: $TIMESTAMP"

echo "$TIMESTAMP" > "$TIMESTAMP_FILE"
echo "    Timestamp saved to $TIMESTAMP_FILE"
