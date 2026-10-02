import { getShtoraSettings, patchShtoraSettings } from "@/lib/shtora-settings";
import { refreshDropboxOauth } from "./functions";
import { persistBackgroundPayload } from "./background";

let inflight: Promise<string> | null = null;

export async function liveDropboxToken(accessToken?: string): Promise<string> {
  if (inflight) return inflight;
  inflight = (async () => {
    const settings = getShtoraSettings();
    const access = (accessToken ?? settings.dropboxToken).trim();
    const refresh = settings.dropboxRefreshToken.trim();
    const appKey = settings.dropboxAppKey.trim();
    const appSecret = settings.dropboxAppSecret.trim();
    const expiresAt = settings.dropboxTokenExpiresAt || 0;
    const clockExpired = Boolean(expiresAt) && expiresAt < Date.now() + 60_000;
    const unknownExpiry = !expiresAt;
    const shouldRefresh = refresh && appKey && appSecret && (clockExpired || !access || unknownExpiry);

    if (shouldRefresh) {
      try {
        const next = await refreshDropboxOauth({
          data: { refreshToken: refresh, appKey, appSecret },
        });
        patchShtoraSettings({
          dropboxToken: next.accessToken,
          dropboxRefreshToken: next.refreshToken || refresh,
          dropboxTokenExpiresAt: next.expiresAt,
        });
        void persistBackgroundPayload({
          ...getShtoraSettings(),
          dropboxToken: next.accessToken,
          dropboxRefreshToken: next.refreshToken || refresh,
          dropboxTokenExpiresAt: next.expiresAt,
        }).catch(() => undefined);
        return next.accessToken;
      } catch (err) {
        if (access && !clockExpired) return access;
        throw err;
      }
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

export function dropboxAuthorizeUrl(appKey: string, redirectUri: string) {
  const url = new URL("https://www.dropbox.com/oauth2/authorize");
  url.searchParams.set("client_id", appKey.trim());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("token_access_type", "offline");
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

export function dropboxRedirectUri() {
  if (typeof window !== "undefined" && window.location?.origin && window.location.origin !== "null") {
    return `${window.location.origin}/dropbox-oauth`;
  }
  const origin =
    (typeof process !== "undefined" &&
      (process.env.SHTORA_PUBLIC_ORIGIN || process.env.SHTORA_FRONT_ORIGIN || process.env.SHTORA_VPS_ORIGIN)) ||
    "";
  return origin ? `${origin.replace(/\/$/, "")}/dropbox-oauth` : "/dropbox-oauth";
}
