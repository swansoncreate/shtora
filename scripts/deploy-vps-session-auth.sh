#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="/opt/shtora"
BRANCH="release/grok-build-functional"
PORT="8080"
DOMAIN="81-200-157-181.sslip.io"

if [[ ! -d "$ROOT/.git" ]]; then
  echo "Expected Git checkout at $ROOT; refusing to guess the deployment directory." >&2
  exit 1
fi
cd "$ROOT"
current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$BRANCH" ]]; then
  echo "Current VPS checkout is on '$current_branch', not '$BRANCH'." >&2
  echo "No changes made. Confirm the deployed branch before switching anything." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree has local changes. No changes made; save/inspect them first." >&2
  git status --short
  exit 1
fi
if [[ ! -d .vercel/output ]]; then
  echo "Expected existing build at $ROOT/.vercel/output; refusing to deploy without a rollback snapshot." >&2
  exit 1
fi
for cmd in git npm curl sudo tar ss; do
  command -v "$cmd" >/dev/null || { echo "Missing required command: $cmd" >&2; exit 1; }
done

pid="$(ss -ltnp "sport = :${PORT}" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -n1)"
[[ -n "$pid" ]] || { echo "No process found listening on port ${PORT}; no changes made." >&2; exit 1; }
unit="$(grep -oE '[^/[:space:]]+\.service' "/proc/${pid}/cgroup" 2>/dev/null | tail -n1 || true)"
[[ -n "$unit" ]] || { echo "Could not identify the systemd service for PID ${pid}; no changes made." >&2; exit 1; }

stamp="$(date +%Y%m%d%H%M%S)"
old_sha="$(git rev-parse HEAD)"
output_backup="/root/shtora-output-before-session-auth-${stamp}.tar.gz"
sudo tar -czf "$output_backup" -C "$ROOT" .vercel/output
echo "Rollback snapshot saved to $output_backup"
echo "Updating $BRANCH and building; /opt/shtora/data will not be changed."

restore_old_build() {
  echo "Restoring previous source/build after deployment failure..." >&2
  git reset --hard "$old_sha" || true
  sudo rm -rf "$ROOT/.vercel/output"
  sudo tar -xzf "$output_backup" -C "$ROOT"
  npm ci || true
  sudo systemctl restart "$unit" || true
}
git fetch origin "$BRANCH"
git merge --ff-only "origin/$BRANCH"
sudo systemctl stop "$unit"
if ! npm ci; then
  restore_old_build
  exit 1
fi
if ! npm run build; then
  restore_old_build
  exit 1
fi
if ! sudo systemctl restart "$unit"; then
  restore_old_build
  exit 1
fi
sleep 2
session_json="$(curl --silent --show-error --max-time 8 "http://127.0.0.1:${PORT}/api/session" || true)"
if [[ "$session_json" != *'"enabled":true'* ]]; then
  echo "New session route did not come up. Rolling back." >&2
  restore_old_build
  exit 1
fi

echo "App code deployed successfully. Now configuring password and Nginx session protection."
sudo bash "$ROOT/scripts/configure-vps-session-auth.sh"

echo
echo "Deployment/configuration script finished."
echo "Open https://${DOMAIN}/login on your phone."
echo "Keep rollback snapshot until you have checked feed, chats, Dropbox, Imagine, and media."
echo "Snapshot: $output_backup"
