#!/bin/sh
set -e

# Substitute env vars into the config template before Prometheus starts.
# Prometheus has no native env var expansion in its config file, so we
# preprocess it here using awk (available in the busybox image).
awk \
  -v url="$PROMETHEUS_REMOTE_WRITE_URL" \
  -v user="$PROMETHEUS_USERNAME" \
  -v pass="$PROMETHEUS_PASSWORD" \
  '{
    gsub(/\${PROMETHEUS_REMOTE_WRITE_URL}/, url)
    gsub(/\${PROMETHEUS_USERNAME}/, user)
    gsub(/\${PROMETHEUS_PASSWORD}/, pass)
    print
  }' /etc/prometheus/prometheus.yml.template > /tmp/prometheus.yml

exec /bin/prometheus \
  --config.file=/tmp/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time=7d \
  --web.enable-lifecycle
