#!/usr/bin/env bash
set -Eeuo pipefail

# Deploy a fresh Vercel output artifact without requiring /opt/shtora to be a Git checkout.
# The live app/data remain in place until the new build is ready.
ROOT="/opt/shtora"
REPO_URL="https://github.com/swansoncreate/shtora.git"
BRANCH="release/grok-build-functional"
PORT="8080"
DOMAIN="81-200-157-181.sslip.io"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/deploy-vps-session-auth-prebuilt.sh" >&2
  exit 1
fi

for cmd in git npm node curl tar ss systemctl cp mv date mktemp; do
  command -v "$cmd" >/dev/null || { echo "Missing required command: $cmd" >&2; exit 1; }
done

[[ -d "$ROOT/.vercel/output" ]] || {
  echo "Expected current build at $ROOT/.vercel/output; no changes made." >&2
  exit 1
}
[[ -d "$ROOT/data" ]] || {
  echo "Expected separate data directory at $ROOT/data; refusing to proceed." >&2
  exit 1
}
[[ ! -e "$ROOT/.vercel/output.next" ]] || {
  echo "$ROOT/.vercel/output.next already exists; inspect it and move it aside manually before retrying." >&2
  exit 1
}

pid="$(ss -ltnp "sport = :${PORT}" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -n1)"
[[ -n "$pid" ]] || { echo "No process found listening on port ${PORT}; no changes made." >&2; exit 1; }
unit="$(grep -oE '[^/[:space:]]+\.service' "/proc/${pid}/cgroup" 2>/dev/null | tail -n1 || true)"
[[ -n "$unit" ]] || { echo "Could not identify the systemd service for PID ${pid}; no changes made." >&2; exit 1; }
systemctl is-active --quiet "$unit" || { echo "$unit is not active; no changes made." >&2; exit 1; }

stamp="$(date +%Y%m%d%H%M%S)"
work="$(mktemp -d /tmp/shtora-session-build.XXXXXX)"
output_backup="/root/shtora-output-before-session-auth-${stamp}.tar.gz"
rollback_dir="$ROOT/.vercel/output.rollback-${stamp}"
failed_dir="$ROOT/.vercel/output.failed-${stamp}"

cleanup() { rm -rf "$work"; }
trap cleanup EXIT

echo "Preparing source in a temporary directory; the live service is still running."
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$work/source"
cd "$work/source"

echo "Installing dependencies and building with VPS sign-in enabled."
# Do not run deploy-time SQL migrations against an inherited shell database URL.
env -u DATABASE_URL -u PGHOST -u PGUSER -u PGPASSWORD -u PGDATABASE VITE_AUTH_ENABLED=true npm ci
env -u DATABASE_URL -u PGHOST -u PGUSER -u PGPASSWORD -u PGDATABASE VITE_AUTH_ENABLED=true npm run build

new_output="$work/source/.vercel/output"
[[ -f "$new_output/functions/__server.func/index.mjs" ]] || {
  echo "Build did not produce functions/__server.func/index.mjs; live app was not changed." >&2
  exit 1
}
[[ -d "$new_output/static" ]] || {
  echo "Build did not produce the static directory; live app was not changed." >&2
  exit 1
}

echo "Saving a rollback archive and staging the new build."
tar -czf "$output_backup" -C "$ROOT" .vercel/output
cp -a "$new_output" "$ROOT/.vercel/output.next"
echo "Rollback archive: $output_backup"

echo "Stopping $unit for the short artifact switch."
if ! systemctl stop "$unit"; then
  rm -rf "$ROOT/.vercel/output.next"
  echo "Could not stop $unit. Existing build was not replaced." >&2
  exit 1
fi

if ! mv "$ROOT/.vercel/output" "$rollback_dir"; then
  systemctl start "$unit" || true
  rm -rf "$ROOT/.vercel/output.next"
  echo "Could not move the old build; service start was attempted. No replacement made." >&2
  exit 1
fi

if ! mv "$ROOT/.vercel/output.next" "$ROOT/.vercel/output"; then
  mv "$rollback_dir" "$ROOT/.vercel/output"
  systemctl start "$unit" || true
  echo "Could not activate new build; old build restored." >&2
  exit 1
fi

if ! systemctl start "$unit"; then
  echo "New build failed to start; restoring previous build." >&2
  systemctl stop "$unit" || true
  mv "$ROOT/.vercel/output" "$failed_dir" || true
  mv "$rollback_dir" "$ROOT/.vercel/output"
  systemctl start "$unit" || true
  echo "Previous build restored. Failed build retained at $failed_dir." >&2
  exit 1
fi

sleep 3
session_json="$(curl --silent --show-error --max-time 8 "http://127.0.0.1:${PORT}/api/session" || true)"
if [[ "$session_json" != *'"enabled":true'* ]]; then
  echo "New session route did not respond with enabled:true; restoring previous build." >&2
  systemctl stop "$unit" || true
  mv "$ROOT/.vercel/output" "$failed_dir" || true
  mv "$rollback_dir" "$ROOT/.vercel/output"
  systemctl start "$unit" || true
  echo "Previous build restored. Failed build retained at $failed_dir." >&2
  exit 1
fi

echo "New build is responding. Configuring password/session and Nginx media protection."
if ! bash "$work/source/scripts/configure-vps-session-auth.sh"; then
  echo "Application build is deployed, but session/Nginx setup reported an error." >&2
  echo "Do not rerun blindly; inspect the error and service/Nginx state first." >&2
  echo "Previous build retained at $rollback_dir; archive: $output_backup" >&2
  exit 1
fi

echo "Installing bounded VPS health/latency sampling."
install -m 0750 "$work/source/scripts/shtora-host-diagnostics.sh" /usr/local/sbin/shtora-host-diagnostics
cat > /etc/systemd/system/shtora-diagnostics.service <<'UNIT'
[Unit]
Description=Shtora lightweight VPS diagnostics sample

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/shtora-host-diagnostics
UNIT
cat > /etc/systemd/system/shtora-diagnostics.timer <<'UNIT'
[Unit]
Description=Sample Shtora health and latency every minute

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
AccuracySec=5s
Unit=shtora-diagnostics.service

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now shtora-diagnostics.timer
systemctl start shtora-diagnostics.service

echo
echo "Deployment, session configuration, and VPS diagnostics setup completed."
echo "Open https://${DOMAIN}/login on your phone."
echo "Host logs: $ROOT/data/diagnostics/host.jsonl (rotates at 3 MB; keeps 3 backups)."
echo "Application logs: $ROOT/data/diagnostics/server.jsonl (rotates at 3 MB; keeps 3 backups)."
echo "Previous build directory: $rollback_dir"
echo "Rollback archive: $output_backup"
