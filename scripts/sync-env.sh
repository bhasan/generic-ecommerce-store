#!/usr/bin/env bash
# Usage: sync-env.sh <env-example> <env-file>
#
# Backs up <env-file> with a timestamp, then appends any keys present in
# <env-example> that are missing from <env-file>. Existing values are never
# modified. New keys are appended with an empty value so the operator can fill
# them in.
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <env-example> <env-file>" >&2
  exit 1
fi

EXAMPLE_FILE="$1"
ENV_FILE="$2"

if [[ ! -f "$EXAMPLE_FILE" ]]; then
  echo "sync-env: example file not found: $EXAMPLE_FILE" >&2
  exit 1
fi

# Create the env file if it doesn't exist yet
if [[ ! -f "$ENV_FILE" ]]; then
  echo "sync-env: $ENV_FILE does not exist — creating empty file"
  touch "$ENV_FILE"
fi

# Backup with timestamp
BACKUP="${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
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
