# VPS session authentication

This change adds a password login for the self-hosted Shtora instance. It does not move, rewrite, or migrate anything in `/opt/shtora/data`.

## Important: this VPS uses a prebuilt deployment directory

The live application runs from `/opt/shtora/.vercel/output`; `/opt/shtora` is **not** a Git checkout. User data lives separately in `/opt/shtora/data` (about 1 GB). Do not clone the repository over `/opt/shtora`, delete that directory, or replace `data/`.

Use the prebuilt deployment helper below. It clones the release source into a temporary directory, builds there, verifies the expected Vercel output files, archives the current output, stages the new output, and switches only `/opt/shtora/.vercel/output`. The existing service and data directory stay where they are. If the service or new session endpoint fails to start, the helper restores the previous output. It keeps rollback copies under `/opt/shtora/.vercel/` and `/root/`.

## One-command deployment on the VPS

From the VPS terminal, run:

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/swansoncreate/shtora/release/grok-build-functional/scripts/deploy-vps-session-auth-prebuilt.sh)"
```

The script requires the current `/opt/shtora/.vercel/output`, `/opt/shtora/data`, and a running systemd service detected from port 8080. It does not require Git metadata in `/opt/shtora`. It builds with `VITE_AUTH_ENABLED=true` and deliberately unsets database connection variables for the build, so it does not run deployment-time SQL migrations against an inherited database URL. It never removes or copies over `/opt/shtora/data`.

If app code deploys but the password/Nginx setup reports an error, **do not rerun the deployment command blindly**. Keep the rollback copies and share the exact error output (without secrets) so the failed step can be fixed safely.

## What the script changes

- Creates a temporary source checkout and builds a new `.vercel/output`.
- Saves the current build as a tar archive under `/root`.
- Stops the existing systemd service briefly, swaps only the `.vercel/output` directory, and starts the service again.
- Checks that `GET http://127.0.0.1:8080/api/session` reports `enabled:true`.
- Runs `configure-vps-session-auth.sh` from the same release source to configure the password/session and protect direct media paths in Nginx.

The setup script creates `/etc/shtora/session-auth.env` with mode 600, containing `SHTORA_LOGIN_PASSWORD` and a generated `SHTORA_SESSION_SECRET`. It adds a systemd drop-in to load that file, restarts the app, backs up the real Nginx config outside `sites-enabled`, adds the internal session check to existing media locations, tests Nginx config, reloads it, and verifies that unauthenticated API/media requests return 401.

Keep these existing environment values unchanged: `SHTORA_RPC_KEY`, `SHTORA_GROK_ORIGIN`, `SHTORA_SELF=1`, and `SHTORA_DATA_DIR=/opt/shtora/data`. The RPC key remains server-to-server only and is never sent to browser code.

## Manual setup script

`scripts/configure-vps-session-auth.sh` is also available if the updated app build is already running on port 8080 and you need to configure auth separately. It does not fetch or build application code.

## Static media must use the same session check

The application API and server functions check the session in code. Static files served directly by Nginx do not pass through that code, so any existing Nginx location serving private files such as `/chat-media/` or `/ig-media/` must use Nginx `auth_request`.

The setup script adds this internal check location to the existing HTTPS server block and adds `auth_request /_shtora_session_check;` to existing private media locations. It preserves the existing aliases and does not create a second server block. Before reloading Nginx, it runs `nginx -t`. Nginx backups are kept outside `sites-enabled`.

## Acceptance checks

1. Without a session, `GET /api/session` reports unauthenticated and `GET /api/state` is denied.
2. A wrong password does not create a cookie.
3. A correct password sets the session cookie; reload then allows `/api/state`, Dropbox operations, and app server functions.
4. Logout clears the cookie and protected API calls return 401 again.
5. Direct requests to private media paths return 401 when signed out and work when signed in.
6. The Grok publication's server-to-server RPC flow continues using `X-Shtora-Key`.
7. Existing `feed.json`, chat files, and media files remain untouched.
