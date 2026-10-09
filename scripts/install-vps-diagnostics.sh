#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then echo "Run as root." >&2; exit 1; fi
command -v systemctl >/dev/null || { echo "systemctl is required." >&2; exit 1; }
install -m 0750 "$(dirname "$0")/vps-diagnostics-probe.sh" /usr/local/sbin/shtora-diagnostics-probe
cat > /etc/systemd/system/shtora-diagnostics.service <<'UNIT'
[Unit]
Description=Shtora VPS diagnostic sample
After=network-online.target shtora.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/shtora-diagnostics-probe
UNIT
cat > /etc/systemd/system/shtora-diagnostics.timer <<'UNIT'
[Unit]
Description=Run Shtora VPS diagnostics every minute

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s
AccuracySec=5s
Unit=shtora-diagnostics.service

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now shtora-diagnostics.timer
systemctl start shtora-diagnostics.service
echo "Shtora diagnostics timer installed; journal: /opt/shtora/data/diagnostics/server.jsonl"
