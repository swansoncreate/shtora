#!/usr/bin/env bash
set -u
DATA_DIR="/opt/shtora/data/diagnostics"
LOG="$DATA_DIR/host.jsonl"
mkdir -p "$DATA_DIR"
chmod 700 "$DATA_DIR"
touch "$LOG"
chmod 600 "$LOG"

rotate() {
  local size
  size=$(stat -c %s "$LOG" 2>/dev/null || echo 0)
  if [ "$size" -ge 3145728 ]; then
    rm -f "$LOG.3"
    [ ! -f "$LOG.2" ] || mv "$LOG.2" "$LOG.3"
    [ ! -f "$LOG.1" ] || mv "$LOG.1" "$LOG.2"
    mv "$LOG" "$LOG.1"
    touch "$LOG"
    chmod 600 "$LOG"
  fi
}
record() {
  rotate
  printf '%s\n' "$1" >> "$LOG"
}
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
load=$(awk '{print $1","$2","$3}' /proc/loadavg 2>/dev/null || echo "unknown")
mem=$(awk '/MemTotal/ {t=$2} /MemAvailable/ {a=$2} END {if(t>0) printf "%d", (t-a)*100/t; else print -1}' /proc/meminfo 2>/dev/null || echo -1)
disk=$(df -P /opt/shtora 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')
disk=${disk:- -1}
record "{\"at\":\"$now\",\"area\":\"host\",\"event\":\"resources\",\"load\":\"$load\",\"memoryUsedPercent\":$mem,\"diskUsedPercent\":$disk}"

probe() {
  local label="$1" url="$2" start status total connect
  local result
  result=$(curl -k -sS -o /dev/null --max-time 12 -w '%{http_code} %{time_total} %{time_connect}' "$url" 2>/dev/null) || result="000 12.000 0.000"
  read -r status total connect <<< "$result"
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  record "{\"at\":\"$now\",\"area\":\"ping\",\"target\":\"$label\",\"status\":$((10#$status)),\"durationSeconds\":$total,\"connectSeconds\":$connect}"
}
probe "local-health" "http://127.0.0.1:8080/api/health"
probe "grok-origin" "https://lion-raven-kite-sage.grok.me/"
