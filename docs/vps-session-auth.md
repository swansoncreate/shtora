# VPS session authentication

This change adds a password login for the self-hosted Shtora instance. It does not move, rewrite, or migrate anything in `/opt/shtora/data`.

## Required environment on the VPS service

Set these values in the existing systemd service environment (do not commit them, put them in browser code, or paste them into chat):

- `SHTORA_LOGIN_PASSWORD`: a long, unique password for Shtora.
- `SHTORA_SESSION_SECRET`: at least 32 characters of random secret material. Generate one on the VPS with `openssl rand -hex 32`.

Keep the existing `SHTORA_RPC_KEY`, `SHTORA_GROK_ORIGIN`, `SHTORA_SELF=1`, and `SHTORA_DATA_DIR=/opt/shtora/data` unchanged. Restart the existing service after adding the two new variables. Do not change the data directory.

The app login creates a signed, expiring, `HttpOnly; Secure; SameSite=Lax` cookie. The RPC key remains a server-to-server credential and is not sent to the browser.

## One-command deployment on the VPS

From the VPS terminal, run the deployment helper from the published release branch:

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/swansoncreate/shtora/release/grok-build-functional/scripts/deploy-vps-session-auth.sh)"
```

It proceeds only if `/opt/shtora` is a clean Git checkout already on `release/grok-build-functional`. It saves the current build under `/root`, fast-forwards that branch, rebuilds, restarts the detected systemd service, then invokes the setup below. If the current branch differs or the working tree has local changes, it stops without switching branches or overwriting them. The helper does not touch `/opt/shtora/data`.

## Automated setup on the VPS

After the updated application build is running on port 8080, copy/run the repository script as root:

```bash
sudo bash scripts/configure-vps-session-auth.sh
```

The script identifies the systemd unit behind port 8080, asks for an app password without echoing it, creates a protected env file, restarts the service, adds the session check to the existing Nginx server, runs `nginx -t`, reloads Nginx, and verifies that unauthenticated API/media requests return 401. It backs up the Nginx config outside `sites-enabled`. It does not change or delete `/opt/shtora/data`.

The script intentionally stops if the new `/api/session` route is not already present in the running app. It configures the server and Nginx only; it does not fetch/build/deploy application code automatically.

## Static media must use the same session check

The application API and server functions check the session in code. Static files served directly by Nginx do not pass through that code, so any existing Nginx location that serves private files such as `/chat-media/` (and `/ig-media/`, if it is served directly) must also use Nginx `auth_request`.

Add this internal check location to the existing HTTPS server block. Keep the existing media aliases and paths; do not create a second server block:

```nginx
location = /_shtora_session_check {
    internal;
    proxy_pass http://127.0.0.1:8080/api/session?check=1;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header Cookie $http_cookie;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Then add this one directive inside each existing Nginx location that serves private media from disk, without replacing its current `alias`, cache, or content-type directives:

```nginx
auth_request /_shtora_session_check;
```

Do not apply this directive to the login route, `/api/session`, or `/api/health`; otherwise login or health checks can become inaccessible. Keep `/dropbox-oauth`'s existing protection unless its flow is deliberately redesigned.

Before reloading Nginx, run `nginx -t`. Keep the existing backup outside `sites-enabled`.

## Acceptance checks

1. Without a session, `GET /api/session` reports unauthenticated and `GET /api/state` is denied.
2. A wrong password does not create a cookie.
3. A correct password sets the session cookie; reload then allows `/api/state`, Dropbox operations, and app server functions.
4. Logout clears the cookie and protected API calls return 401 again.
5. Direct requests to private media paths return 401 when signed out and work when signed in.
6. The Grok publication's server-to-server RPC flow continues using `X-Shtora-Key`.
7. Existing `feed.json`, chat files, and media files remain untouched.
