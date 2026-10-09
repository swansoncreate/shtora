#!/usr/bin/env bash
set -Eeuo pipefail

# Configure the signed-session environment and Nginx media protection.
# Run as root only AFTER the updated Shtora build is already running on port 8080.
DOMAIN="81-200-157-181.sslip.io"
APP_PORT="8080"
NGINX_LINK="/etc/nginx/sites-enabled/shtora"
ENV_DIR="/etc/shtora"
ENV_FILE="${ENV_DIR}/session-auth.env"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/configure-vps-session-auth.sh" >&2
  exit 1
fi
for cmd in python3 openssl systemctl nginx curl ss; do
  command -v "$cmd" >/dev/null || { echo "Missing required command: $cmd" >&2; exit 1; }
done
[[ -e "$NGINX_LINK" ]] || { echo "Nginx config not found: $NGINX_LINK" >&2; exit 1; }

# Refuse to configure a legacy build: the new session endpoint must already exist.
session_json="$(curl --silent --show-error --max-time 5 "http://127.0.0.1:${APP_PORT}/api/session" || true)"
if [[ "$session_json" != *'"enabled":true'* ]]; then
  echo "The updated app is not running on port ${APP_PORT} (GET /api/session did not report enabled:true)." >&2
  echo "Deploy/build the branch containing src/routes/api/session.ts first. No files were changed." >&2
  exit 1
fi

pid="$(ss -ltnp "sport = :${APP_PORT}" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -n1)"
[[ -n "$pid" ]] || { echo "Could not identify the process listening on port ${APP_PORT}." >&2; exit 1; }
unit="$(grep -oE '[^/[:space:]]+\.service' "/proc/${pid}/cgroup" 2>/dev/null | tail -n1 || true)"
[[ -n "$unit" ]] || { echo "Could not identify the systemd service for PID ${pid}; no files were changed." >&2; exit 1; }

mkdir -p "$ENV_DIR"
chmod 700 "$ENV_DIR"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Create the Shtora app password (at least 16 characters; letters, numbers, dot, underscore, tilde, and hyphen only)."
  while true; do
    read -r -s -p "New Shtora password: " password; echo
    if [[ "${#password}" -lt 16 || ! "$password" =~ ^[A-Za-z0-9._~-]+$ ]]; then
      echo "Password must be at least 16 characters and use only A-Z, a-z, 0-9, . _ ~ -."
      continue
    fi
    read -r -s -p "Repeat password: " confirm; echo
    [[ "$password" == "$confirm" ]] && break
    echo "Passwords did not match."
  done
  secret="$(openssl rand -hex 32)"
  umask 077
  printf 'SHTORA_LOGIN_PASSWORD=%s\nSHTORA_SESSION_SECRET=%s\n' "$password" "$secret" > "$ENV_FILE"
  unset password confirm secret
  chmod 600 "$ENV_FILE"
else
  echo "Using existing protected env file: $ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

dropin_dir="/etc/systemd/system/${unit}.d"
dropin="${dropin_dir}/90-shtora-session-auth.conf"
mkdir -p "$dropin_dir"
if [[ ! -f "$dropin" ]]; then
  printf '[Service]\nEnvironmentFile=%s\n' "$ENV_FILE" > "$dropin"
  chmod 600 "$dropin"
fi
systemctl daemon-reload
systemctl restart "$unit"
sleep 2
session_json="$(curl --silent --show-error --max-time 5 "http://127.0.0.1:${APP_PORT}/api/session" || true)"
if [[ "$session_json" != *'"configured":true'* ]]; then
  echo "App restarted, but session auth is not configured. Check ${unit} logs; Nginx was not changed." >&2
  exit 1
fi

# Edit the real target, preserving the sites-enabled symlink if one exists.
nginx_file="$(readlink -f "$NGINX_LINK")"
backup="/root/shtora-nginx-session-auth-$(date +%Y%m%d%H%M%S).bak"
cp -a "$nginx_file" "$backup"
export NGINX_FILE="$nginx_file" DOMAIN
python3 <<'PY'
import os, re, pathlib, sys

path = pathlib.Path(os.environ["NGINX_FILE"])
domain = os.environ["DOMAIN"]
text = path.read_text()

def block_end(source, open_brace):
    depth = 0
    quote = None
    escaped = False
    comment = False
    for i in range(open_brace, len(source)):
        ch = source[i]
        if comment:
            if ch == "\n": comment = False
            continue
        if quote:
            if escaped: escaped = False
            elif ch == "\\": escaped = True
            elif ch == quote: quote = None
            continue
        if ch == "#": comment = True
        elif ch in ("'", '"'): quote = ch
        elif ch == "{": depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0: return i
    raise ValueError("Unbalanced braces in Nginx config")

servers = []
for match in re.finditer(r"\bserver\s*\{", text):
    end = block_end(text, text.find("{", match.start()))
    block = text[match.start():end + 1]
    if re.search(r"\bserver_name\b[^;]*" + re.escape(domain), block):
        servers.append((match.start(), end))
if len(servers) != 1:
    sys.exit(f"Expected exactly one server block for {domain}; found {len(servers)}. No Nginx changes written.")
start, end = servers[0]
server = text[start:end + 1]

if "location = /_shtora_session_check" not in server:
    insert = '''
    # Private media: verify the HttpOnly Shtora session before serving disk files.
    location = /_shtora_session_check {
        internal;
        proxy_pass http://127.0.0.1:8080/api/session?check=1;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header Cookie $http_cookie;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
'''
    server = server[:-1] + insert + "\n}"
else:
    # Ensure the existing check uses the correct internal endpoint.
    if "proxy_pass http://127.0.0.1:8080/api/session?check=1;" not in server:
        sys.exit("An existing /_shtora_session_check location points elsewhere; refusing to overwrite it.")

matches = list(re.finditer(r"(?m)^\s*location\b[^\n{}]*(?:/chat-media/|/ig-media/)[^\n{}]*\{", server))
if not matches:
    sys.exit("No direct /chat-media/ or /ig-media/ Nginx location found. No Nginx changes written.")
for m in reversed(matches):
    open_brace = server.find("{", m.start(), m.end())
    close_brace = block_end(server, open_brace)
    block = server[m.start():close_brace + 1]
    if "auth_request /_shtora_session_check;" not in block:
        block = block[:-1].rstrip() + "\n        auth_request /_shtora_session_check;\n    }"
        server = server[:m.start()] + block + server[close_brace + 1:]

text = text[:start] + server + text[end + 1:]
path.write_text(text)
PY

if ! nginx -t; then
  cp -a "$backup" "$nginx_file"
  nginx -t || true
  echo "Nginx test failed; original config restored from $backup." >&2
  exit 1
fi
systemctl reload nginx
sleep 1

status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "https://${DOMAIN}/api/state" || true)"
if [[ "$status" != "401" ]]; then
  echo "Warning: unauthenticated /api/state returned HTTP ${status} (expected 401). Check app logs and Nginx." >&2
  echo "Nginx backup: $backup" >&2
  exit 1
fi
media_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "https://${DOMAIN}/chat-media/__shtora_auth_probe__" || true)"
if [[ "$media_status" != "401" ]]; then
  echo "Warning: unauthenticated /chat-media/ returned HTTP ${media_status} (expected 401). Review media locations." >&2
  echo "Nginx backup: $backup" >&2
  exit 1
fi

echo
echo "Shtora session login configured."
echo "Service: $unit"
echo "Env file: $ENV_FILE (mode 600)"
echo "Nginx backup: $backup"
echo "Open https://${DOMAIN}/login and use the password you entered."
echo "Existing /opt/shtora/data files were not modified."
