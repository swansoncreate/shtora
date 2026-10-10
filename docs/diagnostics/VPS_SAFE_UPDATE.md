# Safe VPS update plan for Shtora

## Current status

- Target application checkout used by the existing deployment scripts: `/opt/shtora`.
- Expected deployed branch in the existing scripts: `release/grok-build-functional`.
- Existing build directory: `/opt/shtora/.vercel/output`.
- Persistent application data is expected under `/opt/shtora/data`.
- The diagnostics work is developed in PR #44 on `feat/vps-comprehensive-diagnostics`, targeting `release/grok-build-functional`.
- **Do not deploy this PR branch directly to the live VPS.** First merge/release it to the expected deployment branch after review and CI.
- **Do not run either existing `deploy-vps-session-auth*.sh` script as a routine update.** They also configure session authentication, Nginx media protection, and/or a diagnostics timer; that is broader than a code-only update.

This document is a procedure, not evidence that the live VPS has been inspected. No VPS command has been run by this document's authoring.

## Safety rules

1. Do not change `main`, the live VPS, Nginx, systemd units, environment files, or DNS as part of preparation.
2. Never delete or replace `/opt/shtora/data`.
3. Never copy secrets into shell history, GitHub issues, chat, or logs.
4. Stop if the observed branch, paths, service name, or working tree differ from the expected values below.
5. Preserve both a filesystem backup and the exact previous build. Do not rely on Git alone for rollback.
6. Do not proceed if there is no free disk space for backups or if the backup cannot be listed/read.

## Phase A — read-only preflight on the VPS

Run these commands one at a time in a shell. They only inspect state.

```bash
cd /opt/shtora || exit 1
printf '\n-- branch and commit --\n'
git branch --show-current
git rev-parse HEAD
git status --short
printf '\n-- required paths --\n'
test -d .git && echo 'git checkout: OK' || echo 'STOP: no .git'
test -d .vercel/output && echo 'current build: OK' || echo 'STOP: no current build'
test -d data && echo 'persistent data: OK' || echo 'STOP: no data directory'
printf '\n-- disk space --\n'
df -h /opt /root
printf '\n-- app listener --\n'
sudo ss -ltnp 'sport = :8080'
printf '\n-- systemd services --\n'
systemctl --no-pager --type=service --state=running | grep -i shtora || true
```

Expected branch is `release/grok-build-functional`, and `git status --short` should be empty. If not, stop and inspect before any update. Do not paste secrets or the contents of environment files into chat.

## Phase B — capture a baseline

Before deploying, record the current commit, service name, local health response, and current app behavior. Do not include session cookies or secrets in the record.

```bash
cd /opt/shtora || exit 1
git rev-parse HEAD
curl --silent --show-error --max-time 8 http://127.0.0.1:8080/api/session
```

The `/api/session` endpoint is only a health/configuration hint, not a complete application health check. If it fails or behaves differently from what the installed version expects, stop rather than guessing.

Identify the systemd unit from the PID listening on port 8080 and inspect its name/status before proceeding:

```bash
PID="$(sudo ss -ltnp 'sport = :8080' | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -n1)"
test -n "$PID" || { echo 'STOP: no listener PID'; exit 1; }
cat "/proc/$PID/cgroup"
```

Do not guess the unit name or restart a similarly named service.

## Phase C — backup before any write

Only after Phase A and B match expectations, make a timestamped backup. Run as root or use `sudo` as appropriate. Confirm the resulting files exist and can be listed before proceeding.

```bash
STAMP="$(date +%Y%m%d%H%M%S)"
sudo tar -czf "/root/shtora-data-before-update-$STAMP.tar.gz" -C /opt/shtora data
sudo tar -czf "/root/shtora-output-before-update-$STAMP.tar.gz" -C /opt/shtora .vercel/output
sudo tar -tzf "/root/shtora-data-before-update-$STAMP.tar.gz" | head
sudo tar -tzf "/root/shtora-output-before-update-$STAMP.tar.gz" | head
```

Record the timestamp and old commit privately. Do not continue if either archive fails. If the project uses external databases or object storage not contained in `/opt/shtora/data`, those need a separate verified backup before updating.

## Phase D — release gate

Before a deployment is approved:

- PR #44 is reviewed and merged into `release/grok-build-functional`.
- CI is green on the exact resulting base-branch commit.
- The deployment source commit is recorded.
- The live branch and working tree still match the preflight.
- Backups from Phase C are present and readable.
- A maintenance window is acceptable, because the existing build switch may briefly stop the app.

Do not deploy from the feature branch by changing the branch name inside an existing script. Do not merge into `main` as a shortcut.

## Phase E — deployment and verification

Use a dedicated code-only deployment procedure after the release gate. It must build in a temporary directory, leave `/opt/shtora/data` untouched, preserve the existing build until the replacement has built successfully, switch builds atomically, restart only the verified service, and automatically restore the old build if health checks fail.

The existing `deploy-vps-session-auth-prebuilt.sh` is **not** this code-only procedure: it also configures session auth/Nginx and installs a host diagnostics timer. Do not use it for this PR without separately reviewing those side effects.

After the code-only switch, check:

- local app health and external login page;
- feed load and opening a post/photo;
- DM text reply (must not unexpectedly invoke Imagine);
- DM photo request followed by a pose/camera continuation;
- explicit scene change to a different place/outfit;
- Dropbox selection and recent-source rotation;
- Imagine generation and the returned image still loads after refresh;
- restart persistence of messages, visual memory, world state, and media;
- logs correlate by `traceId` and do not contain raw messages, prompts, image URLs/data, cookies, or tokens.

A green CI alone is not proof of these live checks.

## Rollback

Rollback immediately if the service fails to start, health checks fail, photos cannot be loaded, or the app cannot read existing data. Stop the service, preserve the failed build for diagnosis, restore the exact old `.vercel/output` from its archive or preserved directory, then restart the verified service and check health again. Do not roll back by deleting or restoring over `/opt/shtora/data`.

The actual rollback commands must use the service name and backup timestamp recorded during the deployment; never use a guessed unit name or wildcard deletion. Keep both backups until the owner confirms feed, DM, Dropbox, Imagine, login, and persisted media work.

## Current decision

**Prepared, not deployed.** The next engineering task is to create and test a dedicated code-only VPS updater/rollback script, then perform a live preflight with the owner. No VPS state is changed by following the preparation stage alone.
