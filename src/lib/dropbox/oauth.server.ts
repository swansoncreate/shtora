const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";

export type DropboxOauthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

function form(data: Record<string, string>) {
  return new URLSearchParams(data).toString();
}

async function parseTokenResponse(res: Response): Promise<DropboxOauthTokens> {
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }
  if (!res.ok) {
    const err =
      (typeof parsed.error_description === "string" && parsed.error_description) ||
      (typeof parsed.error === "string" && parsed.error) ||
      `Dropbox OAuth HTTP ${res.status}`;
    throw new Error(err);
  }
  const access = typeof parsed.access_token === "string" ? parsed.access_token : "";
  const refresh = typeof parsed.refresh_token === "string" ? parsed.refresh_token : "";
  const expiresIn = typeof parsed.expires_in === "number" ? parsed.expires_in : 14400;
  if (!access) throw new Error("Dropbox не вернул access token.");
  return {
    accessToken: access,
    refreshToken: refresh,
    expiresAt: Date.now() + Math.max(60, expiresIn - 120) * 1000,
  };
}

export async function exchangeDropboxCode(opts: {
  code: string;
  redirectUri: string;
  appKey: string;
  appSecret: string;
}): Promise<DropboxOauthTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form({
      code: opts.code.trim(),
      grant_type: "authorization_code",
      redirect_uri: opts.redirectUri,
      client_id: opts.appKey.trim(),
      client_secret: opts.appSecret.trim(),
    }),
  });
  const tokens = await parseTokenResponse(res);
  if (!tokens.refreshToken) {
    throw new Error("Dropbox не дал refresh token. В ссылке должен быть token_access_type=offline.");
  }
  return tokens;
}

export async function refreshDropboxAccess(opts: {
  refreshToken: string;
  appKey: string;
  appSecret: string;
}): Promise<DropboxOauthTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form({
      refresh_token: opts.refreshToken.trim(),
      grant_type: "refresh_token",
      client_id: opts.appKey.trim(),
      client_secret: opts.appSecret.trim(),
    }),
  });
  const tokens = await parseTokenResponse(res);
  const { slog } = await import("@/lib/server/log.server");
  slog("dropbox", "refresh", { http: res.status, ok: Boolean(tokens.accessToken) });
  return {
    ...tokens,
    refreshToken: tokens.refreshToken || opts.refreshToken.trim(),
  };
}
