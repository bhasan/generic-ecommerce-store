#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage: $0 <server-ip> [--ssh-user <user>] [--backup-dir <remote-path>]

Takes a pg_dump of the production database on the remote server.

By default saves to: /docker/generic-ecommerce-store/backups/YYYYMMDD_HHMMSS-manual/db.sql
Pass --backup-dir to override the directory (used by deploy.sh to co-locate
all deploy artifacts under one timestamped folder).

DB credentials are read from the running backend container's environment so
this script never needs secrets locally.

Options:
  --ssh-user <user>         SSH user (default: root, or \$SSH_USER env var)
  --control-path <socket>   Reuse an existing SSH mux socket
  --backup-dir <path>       Remote directory to write db.sql into
  -h, --help                Show this help

Examples:
  $0 1.2.3.4
  $0 1.2.3.4 --ssh-user deploy
USAGE
}

SERVER_IP=""
SSH_USER="${SSH_USER:-root}"
SSH_CONTROL_PATH=""
BACKUP_DIR_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh-user)
      [[ $# -lt 2 ]] && { echo "Error: --ssh-user requires a value."; exit 1; }
      SSH_USER="$2"; shift 2 ;;
    --control-path)
      [[ $# -lt 2 ]] && { echo "Error: --control-path requires a value."; exit 1; }
      SSH_CONTROL_PATH="$2"; shift 2 ;;
    --backup-dir)
      [[ $# -lt 2 ]] && { echo "Error: --backup-dir requires a value."; exit 1; }
      BACKUP_DIR_OVERRIDE="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      [[ -n "$SERVER_IP" ]] && { echo "Error: unexpected argument '$1'."; usage; exit 1; }
      SERVER_IP="$1"; shift ;;
  esac
done

[[ -z "$SERVER_IP" ]] && { usage; exit 1; }

SSH_OPTS=()
if [[ -n "$SSH_CONTROL_PATH" ]]; then
  SSH_OPTS=(-o ControlMaster=no -o ControlPath="$SSH_CONTROL_PATH")
fi

echo "==> DB backup: $SSH_USER@$SERVER_IP"
echo "    Connecting..."

ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" "BACKUP_DIR_OVERRIDE='${BACKUP_DIR_OVERRIDE}' bash -s" <<'REMOTE'
set -euo pipefail

REMOTE_DIR="/docker/generic-ecommerce-store"
BACKEND_CONTAINER="generic-ecommerce-store-delivery-backend-prod"
DB_CONTAINER="generic-ecommerce-store-delivery-db-prod"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${BACKUP_DIR_OVERRIDE:-$REMOTE_DIR/backups/${TIMESTAMP}-db-backup}"
BACKUP_FILE="$BACKUP_DIR/db.sql"

RUNNING_CONTAINERS="$(docker ps --format '{{.Names}}')"
for container in "$BACKEND_CONTAINER" "$DB_CONTAINER"; do
  if ! grep -qx "$container" <<< "$RUNNING_CONTAINERS"; then
    echo "Error: container '$container' is not running."
    exit 1
  fi
done

# Parse credentials from DATABASE_URL in the running backend container
# Format: postgresql://user:password@host:port/dbname
DATABASE_URL="$(docker exec "$BACKEND_CONTAINER" printenv DATABASE_URL)"
if [[ -z "$DATABASE_URL" ]]; then
  echo "Error: DATABASE_URL is not set in $BACKEND_CONTAINER."
  exit 1
fi
read -r DB_USER DB_PASSWORD DB_NAME < <(
  awk 'match($0, /postgresql:\/\/([^:]+):([^@]+)@[^/]+\/([^?]+)/, m) { print m[1], m[2], m[3] }' \
    <<< "$DATABASE_URL"
)

if [[ -z "$DB_USER" || -z "$DB_PASSWORD" || -z "$DB_NAME" ]]; then
  echo "Error: could not parse DB_USER / DB_PASSWORD / DB_NAME from DATABASE_URL."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "==> Dumping database '$DB_NAME' to $BACKUP_FILE..."
docker exec -e "PGPASSWORD=${DB_PASSWORD}" "$DB_CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --no-password \
  > "$BACKUP_FILE"
# Verify the dump is non-empty
if [[ ! -s "$BACKUP_FILE" ]]; then
  echo "Error: dump file is empty — pg_dump may have failed."
  rm -f "$BACKUP_FILE"
  exit 1
fi

SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
echo "==> Dump complete: $BACKUP_FILE ($SIZE)"

# Only tar when running standalone (deploy.sh tars after all artifacts are collected)
if [[ -z "${BACKUP_DIR_OVERRIDE:-}" ]]; then
  ARCHIVE="${BACKUP_DIR}.tar.gz"
  tar -czf "$ARCHIVE" -C "$(dirname "$BACKUP_DIR")" "$(basename "$BACKUP_DIR")"
  rm -rf "$BACKUP_DIR"
  SIZE="$(du -h "$ARCHIVE" | cut -f1)"
  echo "==> Backup complete: $ARCHIVE ($SIZE)"
fi

echo ""
echo "==> Existing backups:"
ls -lh "$(dirname "$BACKUP_DIR")"/*.tar.gz 2>/dev/null || true
REMOTE
