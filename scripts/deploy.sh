#!/usr/bin/env bash
set -euo pipefail

SKIP_UPLOAD=false
SKIP_CHECKLIST=false
SYNC_CONFIG=false
SYNC_ENV=false
NO_MONITORING=false
CHECKLIST_ONLY=false
SERVER_IP=""

usage() {
  cat <<USAGE
Usage: $0 <server-ip> [OPTIONS]

Tarball-based deploy for Smoke Station Delivery. Builds must already be saved
to docker/backend.tar and docker/web.tar (run scripts/build.sh first).

Requires the server-side docker-compose.shared-edge.override.yml file so
Smoke Station keeps the shared public edge networks and mounts.

By default, only Docker images are uploaded and services are restarted.
Config files and env files on the server are left untouched unless the
corresponding sync flag is passed.

Options:
  --sync-config     Compare local config files against the server and
                    (after confirmation) upload any that differ, backing
                    up the server copy first. Covers docker-compose.yml,
                    docker-compose.prod.yml, nginx/nginx.prod.conf, and
                    monitoring config files.

  --sync-env        Run sync-env.sh on the server to append any missing
                    keys from .env.example -> .env.prod and
                    backend/.env.example -> backend/.env, after taking
                    a timestamped backup of each file. Safe to run on a
                    live server — it never overwrites existing values.

  --skip-upload     Skip uploading and loading the Docker image tarballs.
                    Useful when images are already loaded on the server
                    and you only want to restart services.

  --skip-checklist  Skip the post-deploy hardening checklist.

  --no-monitoring   Exclude the monitoring stack (Promtail + Prometheus)
                    from the compose command. Use for rollback or
                    debugging when monitoring services should stay as-is.

  --checklist-only  Only run the post-deploy hardening checklist; skip
                    all upload, deploy, and compose steps.

  -h, --help        Show this help message and exit.

Environment variables:
  SSH_USER          SSH user for the remote server (default: root).

Examples:
  # Standard deploy (upload images + restart services):
  $0 1.2.3.4

  # Deploy and sync env files if new keys were added:
  $0 1.2.3.4 --sync-env

  # Deploy, sync config and env files:
  $0 1.2.3.4 --sync-config --sync-env

  # Skip image upload (already loaded) and just restart services:
  $0 1.2.3.4 --skip-upload

  # Only run the hardening checklist:
  $0 1.2.3.4 --checklist-only
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sync-config)
      SYNC_CONFIG=true
      shift
      ;;
    --sync-env)
      SYNC_ENV=true
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
    --no-monitoring)
      NO_MONITORING=true
      shift
      ;;
    --checklist-only)
      CHECKLIST_ONLY=true
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
DEPLOY_TS="$(date +%Y%m%d_%H%M%S)"
DEPLOY_BACKUP_DIR="$REMOTE_DIR/backups/${DEPLOY_TS}-deploy"
REMOTE_COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.shared-edge.override.yml"
# Monitoring runs as a separate compose project to prevent its `name: smoke-station-monitoring`
# from overriding the main stack's project name and causing volume prefix collisions on `db`.
REMOTE_COMPOSE_MONITORING="docker compose -f monitoring/docker-compose.monitoring.yml"
# Config files synced (relative to PROJECT_ROOT and REMOTE_DIR) when --sync-config
# is passed. Paths with subdirs (e.g. nginx/) must already exist on the server.
CONFIG_FILES=(
  docker-compose.yml docker-compose.prod.yml nginx/nginx.prod.conf
  monitoring/docker-compose.monitoring.yml
  monitoring/promtail/config.yml
  monitoring/prometheus/prometheus.yml
  monitoring/prometheus/entrypoint.sh
  scripts/sync-env.sh
)

echo "==> Deploy target: $SSH_USER@$SERVER_IP"
if [[ "$CHECKLIST_ONLY" == "true" ]]; then
  echo "    --checklist-only: skipping upload, bootstrap, and compose steps."
fi

if [[ "$SKIP_UPLOAD" == "true" || "$CHECKLIST_ONLY" == "true" ]]; then
  [[ "$SKIP_UPLOAD" == "true" ]] && echo "    Skipping upload (--skip-upload)"
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

# Bootstrap any files that must exist on the server before compose/env steps run.
# Only uploads if the file is missing — does not overwrite existing files.
bootstrap_file() {
  local rel="$1"
  local local_path="$PROJECT_ROOT/$rel"
  if [[ ! -f "$local_path" ]]; then
    echo "    Warning: $rel not found locally, skipping."
    return
  fi
  local local_sum remote_sum
  local_sum="$(md5sum "$local_path" | awk '{print $1}')"
  remote_sum="$(ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "md5sum '$REMOTE_DIR/$rel' 2>/dev/null | awk '{print \$1}'" || true)"
  if [[ "$local_sum" != "$remote_sum" ]]; then
    if [[ -z "$remote_sum" ]]; then
      echo "    Uploading missing: $rel"
    else
      echo "    Uploading changed: $rel"
    fi
    ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "mkdir -p '$REMOTE_DIR/$(dirname "$rel")'"
    scp "${SSH_OPTS[@]}" "$local_path" "$SSH_USER@$SERVER_IP:$REMOTE_DIR/$rel"
  else
    echo "    Already present: $rel"
  fi
}

if [[ "$CHECKLIST_ONLY" == "true" ]]; then
  echo ""
  echo "==> [4/4] Running post-deploy hardening checklist..."
  bash "$SCRIPT_DIR/post-deploy-hardening-check.sh" "$SERVER_IP" --control-path "$SSH_SOCKET" --ssh-user "$SSH_USER"
  echo ""
  echo "==> Done."
  exit 0
fi

echo ""
echo "==> Ensuring required server files are present..."
bootstrap_file "scripts/sync-env.sh"

echo ""
echo "==> Uploading latest env example files..."
scp "${SSH_OPTS[@]}" "$PROJECT_ROOT/.env.example" "$SSH_USER@$SERVER_IP:$REMOTE_DIR/.env.example"
scp "${SSH_OPTS[@]}" "$PROJECT_ROOT/backend/.env.example" "$SSH_USER@$SERVER_IP:$REMOTE_DIR/backend/.env.example"
if [[ "$NO_MONITORING" == "false" ]]; then
  bootstrap_file "monitoring/docker-compose.monitoring.yml"
  bootstrap_file "monitoring/promtail/config.yml"
  bootstrap_file "monitoring/prometheus/prometheus.yml"
  bootstrap_file "monitoring/prometheus/entrypoint.sh"
fi

echo ""
echo "==> Verifying required shared-edge Compose override on server..."
ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "cd '$REMOTE_DIR' && test -f docker-compose.shared-edge.override.yml && $REMOTE_COMPOSE config --quiet"

if [[ "$SKIP_UPLOAD" == "false" ]]; then
  echo ""
  echo "==> [1/4] Uploading images to $SSH_USER@$SERVER_IP:/docker/images/..."
  scp "${SSH_OPTS[@]}" "$BACKEND_TAR" "$WEB_TAR" "$SSH_USER@$SERVER_IP:/docker/images/"

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
      for cfg in "${CHANGED_CONFIGS[@]}"; do
        # Back up the existing server copy (if any) into the deploy backup dir.
        ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "
          if [ -f '$REMOTE_DIR/$cfg' ]; then
            mkdir -p '$DEPLOY_BACKUP_DIR/configs/$(dirname "$cfg")'
            cp -p '$REMOTE_DIR/$cfg' '$DEPLOY_BACKUP_DIR/configs/$cfg'
            echo '    Backed up $cfg -> $DEPLOY_BACKUP_DIR/configs/$cfg'
          fi
        "
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

# --- Sync env files (opt-in via --sync-env) ---
if [[ "$SYNC_ENV" == "false" ]]; then
  echo ""
  echo "==> Env sync skipped (pass --sync-env to append missing keys from .env.example files)."
else
  echo ""
  echo "==> Syncing env files on server (backup + append missing keys)..."
  ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "
    cd '$REMOTE_DIR'
    bash scripts/sync-env.sh .env.example .env --backup-dir '$DEPLOY_BACKUP_DIR/env'
    bash scripts/sync-env.sh backend/.env.example backend/.env --backup-dir '$DEPLOY_BACKUP_DIR/env'
  "
fi

# --- Confirm compose up ---
echo ""
echo ""
echo "==> Taking pre-deploy database backup..."
bash "$SCRIPT_DIR/backup-db.sh" "$SERVER_IP" --ssh-user "$SSH_USER" --control-path "$SSH_SOCKET" --backup-dir "$DEPLOY_BACKUP_DIR"

echo ""
echo "==> Archiving backup..."
ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "
  ARCHIVE='${DEPLOY_BACKUP_DIR}.tar.gz'
  tar -czf \"\$ARCHIVE\" -C '$REMOTE_DIR/backups' '${DEPLOY_TS}-deploy'
  rm -rf '$DEPLOY_BACKUP_DIR'
  echo \"    \$(du -h \"\$ARCHIVE\" | cut -f1)  \$ARCHIVE\"
"

echo ""
echo "==> Checking Prisma migration status before backend recreation..."
echo "    If pending migrations are shown, review them before confirming the deploy below."
ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "cd '$REMOTE_DIR' && $REMOTE_COMPOSE run --rm --no-deps backend npx prisma migrate status" || true

read -rp "Run shared-edge 'docker compose up -d --no-deps --no-build --force-recreate backend web' on server? [y/N] " confirm_up
if [[ "$confirm_up" != "y" && "$confirm_up" != "Y" ]]; then
  echo "Skipped compose up. Images are loaded and ready."
  exit 0
fi

echo ""
echo "==> [3/4] Starting services on server..."
ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "cd '$REMOTE_DIR' && $REMOTE_COMPOSE up -d --no-deps --no-build --force-recreate backend"
ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "cd '$REMOTE_DIR' && $REMOTE_COMPOSE up -d --no-build web"

if [[ "$NO_MONITORING" == "false" ]]; then
  echo ""
  echo "==> Starting monitoring services (promtail, prometheus)..."
  ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "cd '$REMOTE_DIR' && $REMOTE_COMPOSE_MONITORING --env-file .env.prod up -d promtail prometheus"
fi

if [[ "$NGINX_SYNCED" == "true" ]]; then
  echo ""
  echo "==> nginx config changed; recreating web to pick up the bind-mounted conf..."
  ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "cd '$REMOTE_DIR' && $REMOTE_COMPOSE up -d --no-build web"
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
