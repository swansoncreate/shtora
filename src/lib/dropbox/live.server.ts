import { readServerConfig, patchServerConfig } from "@/lib/server/config";
import { refreshDropboxAccess } from "./oauth.server";

const SKEW_MS = 60_000;
let inflight: Promise<string> | null = null;

export async function ensureServerDropboxToken(provided?: string): Promise<string> {
  if (inflight) return inflight;
  inflight = (async () => {
    const config = await readServerConfig();
    const configAccess = (config?.dropboxToken || "").trim();
    const refresh = (config?.dropboxRefreshToken || "").trim();
    const appKey = (config?.dropboxAppKey || "").trim();
    const appSecret = (config?.dropboxAppSecret || "").trim();
    const expiresAt = config?.dropboxTokenExpiresAt || 0;
    const configFresh = Boolean(configAccess && expiresAt && expiresAt > Date.now() + SKEW_MS);
    const access = configFresh ? configAccess : (provided || configAccess).trim();
    const stale = !expiresAt || expiresAt < Date.now() + SKEW_MS;
    if (refresh && appKey && appSecret && (stale || !access)) {
      const next = await refreshDropboxAccess({ refreshToken: refresh, appKey, appSecret });
      await patchServerConfig({
        dropboxToken: next.accessToken,
        dropboxRefreshToken: next.refreshToken || refresh,
        dropboxTokenExpiresAt: next.expiresAt,
      });
      return next.accessToken;
    }
    if (!access) throw new Error("Подключите Dropbox в настройках — один раз через OAuth, не Generate.");
    return access;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export async function dropboxWithRefresh<T>(provided: string, fn: (token: string) => Promise<T>): Promise<T> {
  let token = (provided || "").trim();
  try {
    token = await ensureServerDropboxToken(token);
  } catch {
    if (!token) throw new Error("Подключите Dropbox в настройках — один раз через OAuth, не Generate.");
  }
  try {
    return await fn(token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/expired_access_token|invalid_access_token|истёк|истек/i.test(msg)) throw err;
    const fresh = await ensureServerDropboxToken("");
    if (!fresh || fresh === token) throw err;
    return fn(fresh);
  }
}
