#!/usr/bin/env bash
set -Eeuo pipefail

# Code-only Shtora updater. Does NOT configure login, Nginx, systemd units,
# diagnostics timers, DNS, or database migrations. Run only after the release
# branch has passed CI and the owner has confirmed the VPS preflight.
ROOT="/opt/shtora"
REPO_URL="https://github.com/swansoncreate/shtora.git"
BRANCH="release/grok-build-functional"
PORT="8080"
EXPECTED_SERVICE="shtora.service"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/deploy-vps-code-only.sh [expected-commit-sha]" >&2
  exit 1
fi

EXPECTED_SHA="${1:-}"
for cmd in git npm node curl tar ss systemctl cp mv date mktemp df du; do
  command -v "$cmd" >/dev/null || { echo "Missing required command: $cmd" >&2; exit 1; }
done

# The live VPS may intentionally be a prebuilt-output deployment, not a Git checkout.
# Fetch/build the release in a temporary clone; do not require or alter live Git state.
[[ -d "$ROOT/.vercel/output" ]] || { echo "Current build missing; no changes made." >&2; exit 1; }
[[ -d "$ROOT/data" ]] || { echo "Persistent data directory missing; refusing to update." >&2; exit 1; }

pid="$(ss -ltnp "sport = :${PORT}" 2>/dev/null | sed -n 's/.*pid=\\([0-9][0-9]*\\).*/\\1/p' | head -n1)"
[[ -n "$pid" ]] || { echo "No process listening on port $PORT; no changes made." >&2; exit 1; }
unit="$(grep -oE '[^/[:space:]]+\\.service' "/proc/$pid/cgroup" 2>/dev/null | tail -n1 || true)"
[[ -n "$unit" ]] || { echo "Could not identify the systemd service for PID $pid; no changes made." >&2; exit 1; }
[[ "$unit" == "$EXPECTED_SERVICE" ]] || {
  echo "Expected service '$EXPECTED_SERVICE', found '$unit'. Stop and inspect the host before updating." >&2
  exit 1
}
systemctl is-active --quiet "$unit" || { echo "$unit is not active; no changes made." >&2; exit 1; }

STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/shtora-code-update.XXXXXX)"
OUTPUT_BACKUP="/root/shtora-output-before-code-update-$STAMP.tar.gz"
DATA_BACKUP="/root/shtora-data-before-code-update-$STAMP.tar.gz"
ROLLBACK_DIR="$ROOT/.vercel/output.rollback-$STAMP"
FAILED_DIR="$ROOT/.vercel/output.failed-$STAMP"
OLD_SHA="unavailable: current VPS build is prebuilt and has no verified source SHA"
NEW_STAGED="$ROOT/.vercel/output.next"

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

[[ ! -e "$NEW_STAGED" ]] || { echo "$NEW_STAGED already exists; inspect it first." >&2; exit 1; }
[[ ! -e "$ROLLBACK_DIR" && ! -e "$FAILED_DIR" ]] || { echo "Timestamp collision; rerun later." >&2; exit 1; }

echo "Preparing release source in a temporary directory. The live app is untouched."
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$WORK/source"
cd "$WORK/source"
NEW_SHA="$(git rev-parse HEAD)"
if [[ -n "$EXPECTED_SHA" && "$NEW_SHA" != "$EXPECTED_SHA" ]]; then
  echo "Expected release commit $EXPECTED_SHA but fetched $NEW_SHA; no live changes made." >&2
  exit 1
fi
echo "Candidate release commit: $NEW_SHA"

echo "Installing dependencies and building static/server output without database migrations."
# Do not invoke npm run build: it also runs db:migrate. Build the Vite output
# directly and preserve the current production data/schema.
env -u DATABASE_URL -u PGHOST -u PGUSER -u PGPASSWORD -u PGDATABASE VITE_AUTH_ENABLED=true npm ci
env -u DATABASE_URL -u PGHOST -u PGUSER -u PGPASSWORD -u PGDATABASE VITE_AUTH_ENABLED=true node scripts/with-app-env.mjs vite build

NEW_OUTPUT="$WORK/source/.vercel/output"
[[ -f "$NEW_OUTPUT/functions/__server.func/index.mjs" ]] || {
  echo "Build missing server function output; live app was not changed." >&2
  exit 1
}
[[ -d "$NEW_OUTPUT/static" ]] || {
  echo "Build missing static output; live app was not changed." >&2
  exit 1
}

echo "Checking available disk space before backup and staging."
data_bytes="$(du -sb "$ROOT/data" | awk '{print $1}')"
output_bytes="$(du -sb "$ROOT/.vercel/output" | awk '{print $1}')"
available_bytes="$(df -PB1 "$ROOT" | awk 'NR==2 {print $4}')"
needed_bytes=$((data_bytes + output_bytes + output_bytes + 104857600))
if (( available_bytes < needed_bytes )); then
  echo "Insufficient free disk for conservative backups/staging; live app was not changed." >&2
  echo "Need approximately $needed_bytes bytes, available $available_bytes bytes." >&2
  exit 1
fi

echo "Backing up persistent data and the current build."
tar -czf "$DATA_BACKUP" -C "$ROOT" data
tar -czf "$OUTPUT_BACKUP" -C "$ROOT" .vercel/output
tar -tzf "$DATA_BACKUP" >/dev/null
tar -tzf "$OUTPUT_BACKUP" >/dev/null
cp -a "$NEW_OUTPUT" "$NEW_STAGED"
[[ -f "$NEW_STAGED/functions/__server.func/index.mjs" && -d "$NEW_STAGED/static" ]] || {
  echo "Staged build verification failed; live app was not changed." >&2
  rm -rf "$NEW_STAGED"
  exit 1
}

echo "Backups ready:"
echo "  Data:   $DATA_BACKUP"
echo "  Build:  $OUTPUT_BACKUP"
echo "  Previous deployed source SHA: $OLD_SHA"
echo "  New SHA: $NEW_SHA"
echo "Stopping $unit for the artifact switch."
if ! systemctl stop "$unit"; then
  rm -rf "$NEW_STAGED"
  echo "Could not stop $unit; existing build was not replaced." >&2
  exit 1
fi

if ! mv "$ROOT/.vercel/output" "$ROLLBACK_DIR"; then
  systemctl start "$unit" || true
  rm -rf "$NEW_STAGED"
  echo "Could not move old output; existing build retained." >&2
  exit 1
fi

if ! mv "$NEW_STAGED" "$ROOT/.vercel/output"; then
  mv "$ROLLBACK_DIR" "$ROOT/.vercel/output"
  systemctl start "$unit" || true
  echo "Could not activate new output; previous build restored." >&2
  exit 1
fi

rollback() {
  echo "Health check failed; restoring previous build." >&2
  systemctl stop "$unit" || true
  if [[ -d "$ROOT/.vercel/output" ]]; then mv "$ROOT/.vercel/output" "$FAILED_DIR" || true; fi
  if [[ -d "$ROLLBACK_DIR" ]]; then mv "$ROLLBACK_DIR" "$ROOT/.vercel/output"; fi
  systemctl start "$unit" || true
  echo "Previous build restored. Failed build: $FAILED_DIR" >&2
  echo "Data was not changed by this script. Data backup retained: $DATA_BACKUP" >&2
}
if ! systemctl start "$unit"; then
  rollback
  exit 1
fi

sleep 3
health_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "http://127.0.0.1:$PORT/api/health" || true)"
if [[ "$health_status" != "200" ]]; then
  echo "Local /api/health returned HTTP '${health_status:-unknown}' (expected 200)." >&2
  rollback
  exit 1
fi

session_json="$(curl --silent --show-error --max-time 8 "http://127.0.0.1:$PORT/api/session" || true)"
if [[ "$session_json" != *'"enabled":true'* ]]; then
  echo "Session endpoint did not report enabled:true; rolling back." >&2
  rollback
  exit 1
fi

echo
echo "Code-only deployment passed local health checks."
echo "Release commit: $NEW_SHA"
echo "Previous deployed source SHA: $OLD_SHA"
echo "Previous build directory: $ROLLBACK_DIR"
echo "Build backup: $OUTPUT_BACKUP"
echo "Data backup: $DATA_BACKUP"
echo "Persistent data, Nginx, login configuration, systemd units, and diagnostics timer were not changed."
echo "Keep all backups until feed, DM, Dropbox, Imagine, login, and media are manually verified."
