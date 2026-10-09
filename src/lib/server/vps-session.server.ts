import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "shtora_session";
const SESSION_SECONDS = 60 * 60 * 24 * 14;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  const length = Math.max(left.length, right.length, 1);
  const paddedLeft = Buffer.alloc(length);
  const paddedRight = Buffer.alloc(length);
  left.copy(paddedLeft);
  right.copy(paddedRight);
  return timingSafeEqual(paddedLeft, paddedRight) && left.length === right.length;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function configReady(): boolean {
  return Boolean(env("SHTORA_LOGIN_PASSWORD") && env("SHTORA_SESSION_SECRET").length >= 32);
}

function tokenIsValid(token: string): boolean {
  if (!configReady()) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const supplied = token.slice(dot + 1);
  const expected = signature(payload, env("SHTORA_SESSION_SECRET"));
  if (!safeEqual(supplied, expected)) return false;
  const expiresAt = Number(payload);
  return Number.isSafeInteger(expiresAt) && expiresAt > Math.floor(Date.now() / 1000);
}

export function hasValidSession(request: Request): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp("(?:^|;\\s*)" + SESSION_COOKIE + "=([^;]*)"));
  if (!match) return false;
  try {
    return tokenIsValid(decodeURIComponent(match[1] ?? ""));
  } catch {
    return false;
  }
}

export function sessionStatus(request: Request) {
  return {
    enabled: true,
    configured: configReady(),
    authenticated: hasValidSession(request),
  };
}

function clientKey(request: Request): string {
  return (request.headers.get("x-real-ip") || "unknown").slice(0, 80);
}

function tooManyAttempts(request: Request): boolean {
  const now = Date.now();
  if (loginAttempts.size > 5000) {
    for (const [key, value] of loginAttempts) if (value.resetAt <= now) loginAttempts.delete(key);
  }
  const key = clientKey(request);
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  return current.count >= LOGIN_MAX_ATTEMPTS;
}

function recordFailedAttempt(request: Request): void {
  const now = Date.now();
  const key = clientKey(request);
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  else current.count += 1;
}

export function createSessionResponse(request: Request, body: unknown): Response {
  if (!configReady()) {
    return Response.json(
      { ok: false, error: "Вход не настроен: задайте SHTORA_LOGIN_PASSWORD и SHTORA_SESSION_SECRET на VPS." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ ok: false, error: "Недопустимый источник запроса." }, { status: 403 });
  }
  if (tooManyAttempts(request)) {
    return Response.json(
      { ok: false, error: "Слишком много попыток. Подождите 15 минут и попробуйте снова." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "900" } },
    );
  }
  const password = body && typeof body === "object"
    ? String((body as Record<string, unknown>).password ?? "")
    : "";
  if (password.length > 512 || !safeEqual(password, env("SHTORA_LOGIN_PASSWORD"))) {
    recordFailedAttempt(request);
    return Response.json({ ok: false, error: "Неверный пароль." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  loginAttempts.delete(clientKey(request));
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = String(expiresAt);
  const token = payload + "." + signature(payload, env("SHTORA_SESSION_SECRET"));
  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
      },
    },
  );
}

export function clearSessionResponse(): Response {
  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      },
    },
  );
}
