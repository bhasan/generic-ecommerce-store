#!/usr/bin/env bash
# Bring the monitoring stack (Promtail + Prometheus) up or down on the server.
# Useful for toggling monitoring without a full redeploy.
#
# Usage:
#   monitoring.sh <server-ip> up    [--env-file <file>]
#   monitoring.sh <server-ip> down
#   monitoring.sh <server-ip> status
set -euo pipefail

SERVER_IP=""
COMMAND=""
ENV_FILE=".env.prod"
SSH_USER="${SSH_USER:-root}"
REMOTE_DIR="/docker/smoke-station"

COMPOSE_CMD="docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.shared-edge.override.yml \
  -f monitoring/docker-compose.monitoring.yml"

usage() {
  cat <<USAGE
Usage: $0 <server-ip> <command> [options]

Commands:
  up      Start (or restart) Promtail and Prometheus
  down    Stop and remove Promtail and Prometheus containers
  status  Show running state and recent logs for both containers

Options:
  --env-file <file>   Env file to pass to compose (default: .env.prod)

Environment:
  SSH_USER   SSH user (default: root)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    up|down|status)
      COMMAND="$1"; shift ;;
    --env-file)
      [[ $# -lt 2 ]] && { echo "Error: --env-file requires a value."; usage; exit 1; }
      ENV_FILE="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      if [[ -z "$SERVER_IP" ]]; then
        SERVER_IP="$1"; shift
      else
        echo "Error: unexpected argument '$1'."; usage; exit 1
      fi ;;
  esac
done

if [[ -z "$SERVER_IP" || -z "$COMMAND" ]]; then
  usage; exit 1
fi

SSH_SOCKET="/tmp/ssd_mon_mux_${SERVER_IP}_$$"
echo "==> Connecting to $SSH_USER@$SERVER_IP..."
ssh -fNM -o ControlMaster=yes -o ControlPath="$SSH_SOCKET" -o ControlPersist=60 "$SSH_USER@$SERVER_IP"
trap 'ssh -O exit -o ControlPath="$SSH_SOCKET" "$SSH_USER@$SERVER_IP" 2>/dev/null || true' EXIT
SSH_OPTS=(-o ControlMaster=no -o ControlPath="$SSH_SOCKET")

case "$COMMAND" in
  up)
    echo "==> Starting monitoring stack on $SERVER_IP..."
    ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" \
      "cd '$REMOTE_DIR' && $COMPOSE_CMD --env-file $ENV_FILE up -d promtail prometheus"
    echo ""
    echo "==> Container status:"
    ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" \
      "docker ps --filter name=smoke-station-promtail --filter name=smoke-station-prometheus --format 'table {{.Names}}\t{{.Status}}'"
    ;;

  down)
    echo "==> Stopping monitoring stack on $SERVER_IP..."
    ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" \
      "cd '$REMOTE_DIR' && $COMPOSE_CMD --env-file $ENV_FILE stop promtail prometheus && \
       $COMPOSE_CMD --env-file $ENV_FILE rm -f promtail prometheus"
    echo "==> Monitoring stack stopped."
    ;;

  status)
    echo "==> Monitoring container status on $SERVER_IP:"
    ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" \
      "docker ps -a --filter name=smoke-station-promtail --filter name=smoke-station-prometheus \
         --format 'table {{.Names}}\t{{.Status}}\t{{.RunningFor}}'"
    echo ""
    echo "==> Last 20 lines — promtail:"
    ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" \
      "docker logs --tail 20 smoke-station-promtail 2>&1" || echo "(not running)"
    echo ""
    echo "==> Last 20 lines — prometheus:"
    ssh "${SSH_OPTS[@]}" "$SSH_USER@$SERVER_IP" \
      "docker logs --tail 20 smoke-station-prometheus 2>&1" || echo "(not running)"
    ;;
esac
