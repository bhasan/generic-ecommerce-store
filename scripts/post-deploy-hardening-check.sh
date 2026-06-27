#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/post-deploy-hardening-check.sh <server-ip> [--control-path <ssh-socket>] [--ssh-user <user>]
  scripts/post-deploy-hardening-check.sh --run-local

Description:
  Prints effective limiter/proxy settings and proxy-related runtime evidence so
  rate-limit/IP regressions do not go unnoticed after deployment.
USAGE
}

run_local_check() {
  local app_dir="${APP_DIR:-/docker/smoke-station}"
  local backend_container="${BACKEND_CONTAINER:-smoke-station-delivery-backend-prod}"
  local web_container="${WEB_CONTAINER:-smoke-station-delivery-web-prod}"
  local health_url="${HEALTH_URL:-http://localhost/api/health}"
  local proxy_probe_url="${PROXY_PROBE_URL:-http://localhost/api/notifications/unread-count}"
  local log_lines="${LOG_LINES:-300}"

  for cmd in docker curl; do
    command -v "$cmd" >/dev/null 2>&1 || { echo "Error: $cmd is required."; exit 1; }
  done

  echo "==> Post-deploy hardening checklist (UTC $(date -u '+%Y-%m-%dT%H:%M:%SZ'))"
  echo "    APP_DIR=$app_dir"
  echo "    BACKEND_CONTAINER=$backend_container"
  echo "    WEB_CONTAINER=$web_container"

  if ! docker ps --format '{{.Names}}' | grep -qx "$backend_container"; then
    echo "Error: backend container '$backend_container' is not running."
    exit 1
  fi

  local has_web_container=false
  if docker ps --format '{{.Names}}' | grep -qx "$web_container"; then
    has_web_container=true
  else
    echo "Warning: web container '$web_container' is not running; nginx config snapshot skipped."
  fi

  echo ""
  echo "==> Effective backend limiter/proxy env"
  docker exec "$backend_container" sh -lc '
    print_effective() {
      key="$1"
      fallback="$2"
      value="$(printenv "$key" || true)"
      if [ -n "$value" ]; then
        printf "%s=%s\n" "$key" "$value"
      else
        printf "%s=%s (default)\n" "$key" "$fallback"
      fi
    }

    print_effective AUTH_RATE_LIMIT_MAX 20
    print_effective AUTH_RATE_LIMIT_WINDOW_MS 900000
    print_effective GENERAL_RATE_LIMIT_MAX 100
    print_effective GENERAL_RATE_LIMIT_WINDOW_MS 900000
    print_effective POLL_RATE_LIMIT_MAX 240
    print_effective POLL_RATE_LIMIT_WINDOW_MS 900000
    print_effective TRUST_PROXY_HOPS 1
    print_effective REQUEST_IP_DEBUG_SAMPLE_SIZE 5
    print_effective LOG_LEVEL info

    if [ -n "${MAKE_NOTIFICATION_WEBHOOK_URL:-}" ]; then
      echo "MAKE_NOTIFICATION_WEBHOOK_URL=<set>"
    else
      echo "MAKE_NOTIFICATION_WEBHOOK_URL=<unset>"
    fi

    if [ -n "${MAKE_API_KEY:-}" ]; then
      echo "MAKE_API_KEY=<set>"
    else
      echo "MAKE_API_KEY=<unset>"
    fi
  '

  if $has_web_container; then
    echo ""
    echo "==> Active nginx real-ip directives (from running web container)"
    docker exec "$web_container" sh -lc "grep -E 'real_ip_header|real_ip_recursive|set_real_ip_from' /etc/nginx/conf.d/default.conf || true"
  fi

  echo ""
  echo "==> /api/health response headers"
  curl -sS -L -k -D - -o /dev/null "$health_url" | sed 's/\r$//'

  echo ""
  echo "==> Proxy-header probe status (simulated CF/XFF headers)"
  local probe_status
  probe_status="$(curl -sS -L -k -o /dev/null -w '%{http_code}' \
    -H 'CF-Connecting-IP: 203.0.113.44' \
    -H 'X-Forwarded-For: 203.0.113.44' \
    -H 'User-Agent: post-deploy-hardening-check/1.0' \
    "$proxy_probe_url" || true)"
  echo "Proxy probe status: $probe_status ($proxy_probe_url)"

  sleep 1

  echo ""
  echo "==> Recent backend proxy/rate-limit log lines"
  if ! docker logs "$backend_container" --tail "$log_lines" 2>&1 | grep -Ei 'Proxy trust configured|request ip source snapshot|Rate limit exceeded'; then
    echo "No proxy/rate-limit lines found in the last $log_lines backend log lines."
    echo "Tip: temporarily set LOG_LEVEL=debug and REQUEST_IP_DEBUG_SAMPLE_SIZE=5, then restart backend."
  fi

  echo ""
  echo "==> Hardening checklist complete."
}

run_local="false"
server_ip=""
ssh_control_path=""
ssh_user="${SSH_USER:-root}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-local)
      run_local="true"
      shift
      ;;
    --control-path)
      if [[ $# -lt 2 ]]; then
        echo "Error: --control-path requires a value."
        exit 1
      fi
      ssh_control_path="$2"
      shift 2
      ;;
    --ssh-user)
      if [[ $# -lt 2 ]]; then
        echo "Error: --ssh-user requires a value."
        exit 1
      fi
      ssh_user="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -n "$server_ip" ]]; then
        echo "Error: unexpected extra argument '$1'."
        usage
        exit 1
      fi
      server_ip="$1"
      shift
      ;;
  esac
done

if [[ "$run_local" == "true" ]]; then
  run_local_check
  exit 0
fi

if [[ -z "$server_ip" ]]; then
  usage
  exit 1
fi

ssh_opts=()
if [[ -n "$ssh_control_path" ]]; then
  ssh_opts=(-o ControlMaster=no -o ControlPath="$ssh_control_path")
fi

echo "==> Running post-deploy hardening checklist on $ssh_user@$server_ip..."
ssh "${ssh_opts[@]}" "$ssh_user@$server_ip" "bash -s -- --run-local" < "$0"
