#!/usr/bin/env bash
# Usage: sync-env.sh <env-example> <env-file> [--backup-dir <dir>]
#
# Backs up <env-file>, then appends any keys present in <env-example> that are
# missing from <env-file>. Existing values are never modified. New keys are
# appended with an empty value so the operator can fill them in.
#
# --backup-dir <dir>  Write backup into <dir>/<basename-of-env-file> instead of
#                     next to the original. Used by deploy.sh to co-locate all
#                     deploy artifacts under one timestamped folder.
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <env-example> <env-file> [--backup-dir <dir>]" >&2
  exit 1
fi

EXAMPLE_FILE="$1"
ENV_FILE="$2"
BACKUP_DIR_OVERRIDE=""

shift 2
while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup-dir)
      [[ $# -lt 2 ]] && { echo "sync-env: --backup-dir requires a value." >&2; exit 1; }
      BACKUP_DIR_OVERRIDE="$2"; shift 2 ;;
    *)
      echo "sync-env: unexpected argument '$1'" >&2; exit 1 ;;
  esac
done

if [[ ! -f "$EXAMPLE_FILE" ]]; then
  echo "sync-env: example file not found: $EXAMPLE_FILE" >&2
  exit 1
fi

# Create the env file if it doesn't exist yet
if [[ ! -f "$ENV_FILE" ]]; then
  echo "sync-env: $ENV_FILE does not exist — creating empty file"
  touch "$ENV_FILE"
fi

# Backup — into shared deploy dir if provided, otherwise next to the original
if [[ -n "$BACKUP_DIR_OVERRIDE" ]]; then
  mkdir -p "$BACKUP_DIR_OVERRIDE"
  BACKUP="$BACKUP_DIR_OVERRIDE/$(basename "$ENV_FILE")"
else
  BACKUP="${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
fi
cp "$ENV_FILE" "$BACKUP"
echo "sync-env: backed up $ENV_FILE → $BACKUP"

ADDED=0

while IFS= read -r line; do
  # Skip comments and blank lines
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue

  # Extract key (everything before the first '=')
  key="${line%%=*}"
  [[ -z "$key" ]] && continue

  # Skip if key already present in env file
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    continue
  fi

  # Append missing key with empty value
  echo "${key}=" >> "$ENV_FILE"
  echo "sync-env:   + ${key}="
  ADDED=$((ADDED + 1))

done < "$EXAMPLE_FILE"

if [[ $ADDED -eq 0 ]]; then
  echo "sync-env: $ENV_FILE is up to date — no new keys added"
else
  echo "sync-env: added $ADDED new key(s) to $ENV_FILE — fill in values before next deploy"
fi
