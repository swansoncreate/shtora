#!/usr/bin/env bash
set -Eeuo pipefail

# Periodic, privacy-safe VPS diagnostics. Run as root from a systemd timer.
LOG_DIR="/opt/shtora/data/diagnostics"
LOG_FILE="$LOG_DIR/server.jsonl"
MAX_BYTES=$((5 * 1024 * 1024))

mkdir -p "$LOG_DIR"
chmod 750 "$LOG_DIR"

rotate_if_needed() {
  [[ -f "$LOG_FILE" ]] || return 0
  local size
  size=$(stat -c %s "$LOG_FILE" 2>/dev/null || echo 0)
  if (( size > MAX_BYTES )); then
    rm -f "$LOG_FILE.3"
    [[ ! -f "$LOG_FILE.2" ]] || mv "$LOG_FILE.2" "$LOG_FILE.3"
    [[ ! -f "$LOG_FILE.1" ]] || mv "$LOG_FILE.1" "$LOG_FILE.2"
    mv "$LOG_FILE" "$LOG_FILE.1"
  fi
}

log() {
  local area="$1" event="$2" details="$3"
  rotate_if_needed
  printf '{"at":"%s","level":"info","source":"vps-probe","area":"%s","event":"%s","details":{%s}}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$area" "$event" "$details" >> "$LOG_FILE"
  chmod 640 "$LOG_FILE"
}

start=$(date +%s%3N)
health=$(curl -sS -o /dev/null -w '%{http_code} %{time_connect} %{time_total}' --max-time 8 http://127.0.0.1:8080/api/health 2>/dev/null || echo "000 0 8")
read -r health_status health_connect health_total <<< "$health"
log "network" "local_health_probe" "\"status\":${health_status:-0},\"connectSeconds\":${health_connect:-0},\"totalSeconds\":${health_total:-0}"

if [[ -f /etc/shtora/session-auth.env ]]; then
  # Read only the configured public Grok origin; never emit env contents.
  grok_origin=$(sed -n 's/^SHTORA_GROK_ORIGIN=//p' /etc/shtora/session-auth.env | head -n1 | tr -d '"\047' || true)
  if [[ "$grok_origin" =~ ^https://[a-zA-Z0-9.-]+\.grok\.me$ ]]; then
    timing=$(curl -sS -o /dev/null -w '%{http_code} %{time_namelookup} %{time_connect} %{time_appconnect} %{time_total}' --max-time 10 "$grok_origin/" 2>/dev/null || echo "000 0 0 0 10")
    read -r status dns connect tls total <<< "$timing"
    log "network" "grok_origin_probe" "\"status\":${status:-0},\"dnsSeconds\":${dns:-0},\"connectSeconds\":${connect:-0},\"tlsSeconds\":${tls:-0},\"totalSeconds\":${total:-0}"
  fi
fi

load1=$(awk '{print $1}' /proc/loadavg)
mem_total=$(awk '/MemTotal:/ {print $2}' /proc/meminfo)
mem_available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
disk_used=$(df -P /opt/shtora | awk 'NR==2 {gsub("%","",$5); print $5}')
service_state=$(systemctl is-active shtora.service 2>/dev/null || echo unknown)
restarts=$(systemctl show shtora.service -p NRestarts --value 2>/dev/null || echo 0)
log "server" "resource_sample" "\"load1\":${load1:-0},\"memTotalKb\":${mem_total:-0},\"memAvailableKb\":${mem_available:-0},\"diskUsedPercent\":${disk_used:-0},\"serviceActive\":\"${service_state}\",\"serviceRestarts\":${restarts:-0}"
