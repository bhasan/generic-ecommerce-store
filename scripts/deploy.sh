#!/usr/bin/env bash
set -euo pipefail

SKIP_UPLOAD=false
SKIP_CHECKLIST=false
SYNC_CONFIG=false
SERVER_IP=""

usage() {
  cat <<USAGE
Usage: $0 <server-ip> [--sync-config] [--skip-upload] [--skip-checklist]

By default only the Docker images are pushed. Config files (docker-compose.yml,
docker-compose.prod.yml, nginx/nginx.prod.conf) are left untouched on the server
unless --sync-config is given.

Options:
  --sync-config     Also compare and (after confirmation) upload changed config
                    files, backing up the server copy first.
  --skip-upload     Skip uploading/loading the Docker image tarballs.
  --skip-checklist  Skip the post-deploy hardening checklist.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sync-config)
      SYNC_CONFIG=true
      shift
      ;;
    --skip-upload)
      SKIP_UPLOAD=true
      shift
      ;;
    --skip-checklist)
      SKIP_CHECKLIST=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -n "$SERVER_IP" ]]; then
        echo "Error: unexpected extra argument '$1'."
        usage
        exit 1
      fi
      SERVER_IP="$1"
      shift
      ;;
  esac
done

if [[ -z "$SERVER_IP" ]]; then
  usage
  exit 1
fi
SSH_SOCKET="/tmp/ssd_ssh_mux_${SERVER_IP}_$$"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_ROOT/docker"

BACKEND_TAR="$DOCKER_DIR/backend.tar"
WEB_TAR="$DOCKER_DIR/web.tar"

SSH_USER="${SSH_USER:-root}"
REMOTE_DIR="/docker/smoke-station"
# Config files synced (relative to PROJECT_ROOT and REMOTE_DIR) when --sync-config
# is passed. Paths with subdirs (e.g. nginx/) must already exist on the server.
CONFIG_FILES=(docker-compose.yml docker-compose.prod.yml nginx/nginx.prod.conf)

echo "==> Deploy target: $SSH_USER@$SERVER_IP"
if [[ "$SKIP_UPLOAD" == "true" ]]; then
  echo "    Skipping upload (--skip-upload)"
else
  if [[ ! -f "$BACKEND_TAR" || ! -f "$WEB_TAR" ]]; then
    echo "Error: Image tar files not found."
    echo "       Expected:"
    echo "         $BACKEND_TAR"
    echo "         $WEB_TAR"
    echo "       Run scripts/build.sh to rebuild."
    exit 1
  fi

  echo ""
  echo "    Files to upload:"
  echo "      $BACKEND_TAR ($(du -h "$BACKEND_TAR" | cut -f1))"
  echo "      $WEB_TAR ($(du -h "$WEB_TAR" | cut -f1))"

  echo ""
  read -rp "Proceed with upload? [y/N] " confirm_upload
  if [[ "$confirm_upload" != "y" && "$confirm_upload" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# --- Open master SSH connection (single password prompt) ---
echo ""
echo "==> Connecting to $SSH_USER@$SERVER_IP (you will be prompted for the password once)..."
ssh -fNM -o ControlMaster=yes -o ControlPath="$SSH_SOCKET" -o ControlPersist=600 "$SSH_USER@$SERVER_IP"
trap 'ssh -O exit -o ControlPath="$SSH_SOCKET" "$SSH_USER@$SERVER_IP" 2>/dev/null || true' EXIT

SSH_OPTS=(-o ControlMaster=no -o ControlPath="$SSH_SOCKET")

if [[ "$SKIP_UPLOAD" == "false" ]]; then
  echo ""
  echo "==> [1/4] Uploading images to $SSH_USER@$SERVER_IP:/docker/images/..."
  scp "${SSH_OPTS[@]}" "$BACKEND_TAR" "$SSH_USER@$SERVER_IP:/docker/images/"
  scp "${SSH_OPTS[@]}" "$WEB_TAR" "$SSH_USER@$SERVER_IP:/docker/images/"

  echo ""
  echo "==> [2/4] Loading images on server..."
  ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "docker load -i /docker/images/backend.tar && docker load -i /docker/images/web.tar"

  echo ""
  echo "==> Verifying images are retained on server..."
  ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "ls -lh /docker/images/backend.tar /docker/images/web.tar"
fi

# Set when nginx/nginx.prod.conf is uploaded, so we can force-recreate web below
# (the conf is bind-mounted, so a plain `up -d` won't pick up the new file).
NGINX_SYNCED=false

# --- Sync changed config files (opt-in via --sync-config) ---
if [[ "$SYNC_CONFIG" == "false" ]]; then
  echo ""
  echo "==> Config sync skipped (pass --sync-config to upload changed config files)."
else
  echo ""
  echo "==> Checking for config changes on server..."
  CHANGED_CONFIGS=()
  for cfg in "${CONFIG_FILES[@]}"; do
    local_path="$PROJECT_ROOT/$cfg"
    if [[ ! -f "$local_path" ]]; then
      echo "    Warning: $cfg not found locally, skipping."
      continue
    fi
    # Guard: Docker auto-creates a missing bind-mount source as a *directory*.
    # If that happened, scp'ing the file here would silently nest it inside the
    # directory and the next container mount would fail. Abort with guidance.
    if ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "[ -d '$REMOTE_DIR/$cfg' ]"; then
      echo "    ERROR: $REMOTE_DIR/$cfg is a directory on the server, not a file."
      echo "           Docker likely auto-created it as a bind-mount source while the"
      echo "           file was missing. Fix it on the server, then re-run:"
      echo "             cd $REMOTE_DIR && docker compose -f docker-compose.yml -f docker-compose.prod.yml rm -sf web"
      echo "             rm -rf '$REMOTE_DIR/$cfg'"
      exit 1
    fi
    local_sum="$(md5sum "$local_path" | awk '{print $1}')"
    remote_sum="$(ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "md5sum '$REMOTE_DIR/$cfg' 2>/dev/null | awk '{print \$1}'" || true)"
    if [[ "$local_sum" != "$remote_sum" ]]; then
      if [[ -z "$remote_sum" ]]; then
        echo "    $cfg: not present on server (will upload)"
      else
        echo "    $cfg: differs from server (will upload)"
      fi
      CHANGED_CONFIGS+=("$cfg")
    else
      echo "    $cfg: unchanged"
    fi
  done

  if [[ ${#CHANGED_CONFIGS[@]} -gt 0 ]]; then
    echo ""
    read -rp "Upload ${#CHANGED_CONFIGS[@]} changed config file(s) to $REMOTE_DIR? [y/N] " confirm_cfg
    if [[ "$confirm_cfg" == "y" || "$confirm_cfg" == "Y" ]]; then
      CONFIG_TS="$(date +%Y%m%d_%H%M%S)"
      for cfg in "${CHANGED_CONFIGS[@]}"; do
        # Back up the existing server copy (if any) before overwriting.
        ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" \
          "if [ -f '$REMOTE_DIR/$cfg' ]; then cp -p '$REMOTE_DIR/$cfg' '$REMOTE_DIR/${cfg}.${CONFIG_TS}.bak' && echo '    Backed up $cfg -> ${cfg}.${CONFIG_TS}.bak'; fi"
        scp "${SSH_OPTS[@]}" "$PROJECT_ROOT/$cfg" "$SSH_USER@$SERVER_IP:$REMOTE_DIR/$cfg"
        if [[ "$cfg" == "nginx/nginx.prod.conf" ]]; then
          NGINX_SYNCED=true
        fi
      done
      echo "    Config files uploaded."
    else
      echo "    Skipped config upload. Server will use its existing config."
    fi
  fi
fi

# --- Confirm compose up ---
echo ""
read -rp "Run 'docker compose up -d backend web' on server? [y/N] " confirm_up
if [[ "$confirm_up" != "y" && "$confirm_up" != "Y" ]]; then
  echo "Skipped compose up. Images are loaded and ready."
  exit 0
fi

echo ""
echo "==> [3/4] Starting services on server..."
ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "cd /docker/smoke-station && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend web"

if [[ "$NGINX_SYNCED" == "true" ]]; then
  echo ""
  echo "==> nginx config changed; force-recreating web to pick up the bind-mounted conf..."
  ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "cd /docker/smoke-station && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate web"
fi

echo ""
if [[ "$SKIP_CHECKLIST" == "true" ]]; then
  echo "==> [4/4] Hardening checklist skipped (--skip-checklist)."
else
  echo "==> [4/4] Running post-deploy hardening checklist..."
  bash "$SCRIPT_DIR/post-deploy-hardening-check.sh" "$SERVER_IP" --control-path "$SSH_SOCKET" --ssh-user "$SSH_USER"
fi

echo ""
echo "==> Deploy complete."
