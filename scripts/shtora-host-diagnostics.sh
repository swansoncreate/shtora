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
disk=${disk:--1}
record "{\"at\":\"$now\",\"area\":\"host\",\"event\":\"resources\",\"load\":\"$load\",\"memoryUsedPercent\":$mem,\"diskUsedPercent\":$disk}"

probe() {
  local label="$1" url="$2" status total connect result
  result=$(curl -sS -o /dev/null --max-time 12 -w '%{http_code} %{time_total} %{time_connect}' "$url" 2>/dev/null) || result="000 12.000 0.000"
  read -r status total connect <<< "$result"
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  record "{\"at\":\"$now\",\"area\":\"ping\",\"target\":\"$label\",\"status\":$((10#$status)),\"durationSeconds\":$total,\"connectSeconds\":$connect}"
}
probe "local-health" "http://127.0.0.1:8080/api/health"

# Read only the configured public origin; never log env contents or credentials.
grok_origin=""
if [ -f /etc/shtora/session-auth.env ]; then
  grok_origin=$(sed -n 's/^SHTORA_GROK_ORIGIN=//p' /etc/shtora/session-auth.env | head -n1 | tr -d '"\\047' || true)
fi
if [ -z "$grok_origin" ] && [ -f /opt/shtora/data/grok-origin.txt ]; then
  grok_origin=$(head -n1 /opt/shtora/data/grok-origin.txt | tr -d '"\\047' || true)
fi
if [[ "$grok_origin" =~ ^https://[a-zA-Z0-9.-]+\\.grok\\.me$ ]]; then
  result=$(curl -sS -o /dev/null --max-time 12 -w '%{http_code} %{time_namelookup} %{time_connect} %{time_appconnect} %{time_total}' "$grok_origin/" 2>/dev/null) || result="000 0.000 0.000 0.000 12.000"
  read -r status dns connect tls total <<< "$result"
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  record "{\\\"at\\\":\\\"$now\\\",\\\"area\\\":\\\"ping\\\",\\\"target\\\":\\\"grok-origin\\\",\\\"status\\\":$((10#${status:-0})),\\\"dnsSeconds\\\":${dns:-0},\\\"connectSeconds\\\":${connect:-0},\\\"tlsSeconds\\\":${tls:-0},\\\"durationSeconds\\\":${total:-0}}"
fi

service_state=$(systemctl is-active shtora.service 2>/dev/null || echo unknown)
restarts=$(systemctl show shtora.service -p NRestarts --value 2>/dev/null || echo 0)
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
record "{\\\"at\\\":\\\"$now\\\",\\\"area\\\":\\\"host\\\",\\\"event\\\":\\\"service\\\",\\\"active\\\":\\\"$service_state\\\",\\\"restarts\\\":${restarts:-0}}"
