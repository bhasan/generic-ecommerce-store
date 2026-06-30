#!/bin/sh
set -e

# Substitute env vars into the config template before Prometheus starts.
# Prometheus has no native env var expansion in its config file, so we
# preprocess it here using awk (available in the busybox image).
sed \
  -e "s|\${PROMETHEUS_REMOTE_WRITE_URL}|${PROMETHEUS_REMOTE_WRITE_URL}|g" \
  -e "s|\${PROMETHEUS_USERNAME}|${PROMETHEUS_USERNAME}|g" \
  -e "s|\${PROMETHEUS_PASSWORD}|${PROMETHEUS_PASSWORD}|g" \
  /etc/prometheus/prometheus.yml.template > /tmp/prometheus.yml

exec /bin/prometheus \
  --config.file=/tmp/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time=7d \
  --web.enable-lifecycle
