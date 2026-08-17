#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_ROOT/docker"

echo "==> Project root: $PROJECT_ROOT"
echo "==> Docker output dir: $DOCKER_DIR"
mkdir -p "$DOCKER_DIR"

# --- Web pre-build (Vite) ---
echo ""
echo "==> [1/6] Installing web dependencies (npm ci)..."
cd "$PROJECT_ROOT/web"
npm ci

echo ""
echo "==> [2/6] Building web (npm run build)..."
npm run build
cd "$PROJECT_ROOT"

# --- Docker image builds ---
echo ""
echo "==> [3/6] Building backend Docker image..."
docker build -t generic-ecommerce-store-delivery/backend:latest -f backend/Dockerfile ./backend

echo ""
echo "==> [4/6] Building web Docker image..."
docker build -t generic-ecommerce-store-delivery/web:latest -f nginx/Dockerfile .

# --- Save images ---
BACKEND_TAR="$DOCKER_DIR/backend.tar"
WEB_TAR="$DOCKER_DIR/web.tar"

echo ""
echo "==> [5/6] Saving backend image to $BACKEND_TAR..."
docker save generic-ecommerce-store-delivery/backend:latest -o "$BACKEND_TAR"

echo "==> [6/6] Saving web image to $WEB_TAR..."
docker save generic-ecommerce-store-delivery/web:latest -o "$WEB_TAR"

# --- Summary ---
echo ""
echo "==> Build complete."
echo "    Backend: $BACKEND_TAR ($(du -h "$BACKEND_TAR" | cut -f1))"
echo "    Web:     $WEB_TAR ($(du -h "$WEB_TAR" | cut -f1))"
