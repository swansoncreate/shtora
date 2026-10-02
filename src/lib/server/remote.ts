import { timingSafeEqual } from "node:crypto";

export function runningOnVps() {
  if (typeof process === "undefined") return false;
  return process.env.SHTORA_SELF === "1" || process.env.SHTORA_DATA_DIR === "/opt/shtora/data";
}

export function vpsOrigin() {
  const raw = typeof process !== "undefined" ? process.env.SHTORA_VPS_ORIGIN : "";
  return (raw || "").replace(/\/$/, "");
}

export function publicOrigin() {
  const raw =
    (typeof process !== "undefined" &&
      (process.env.SHTORA_PUBLIC_ORIGIN || process.env.SHTORA_FRONT_ORIGIN || process.env.SHTORA_VPS_ORIGIN)) ||
    "";
  return raw.replace(/\/$/, "");
}

export function publicationOrigin() {
  const raw =
    (typeof process !== "undefined" && (process.env.SHTORA_FRONT_ORIGIN || process.env.SHTORA_PUBLIC_ORIGIN)) || "";
  return raw.replace(/\/$/, "");
}

export function rpcKey() {
  const key = typeof process !== "undefined" ? process.env.SHTORA_RPC_KEY : "";
  return typeof key === "string" ? key : "";
}

function safeEqual(got: string, expected: string) {
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  const len = Math.max(a.length, b.length, 1);
  const aa = Buffer.alloc(len);
  const bb = Buffer.alloc(len);
  a.copy(aa);
  b.copy(bb);
  const sameBytes = timingSafeEqual(aa, bb);
  return sameBytes && a.length === b.length;
}

/** null means the request may proceed. No env key is 503, a mismatch is 401. */
export function assertRpc(request: Request): Response | null {
  const expected = rpcKey();
  if (!expected) {
    return Response.json({ error: "rpc key not configured" }, { status: 503 });
  }
  const got = request.headers.get("x-shtora-key") ?? "";
  if (!safeEqual(got, expected)) {
    return Response.json({ error: "no rpc key" }, { status: 401 });
  }
  return null;
}

export function corsHeaders(request: Request, methods: string) {
  const headers = new Headers();
  const allow = publicationOrigin();
  const origin = request.headers.get("origin") || "";
  if (allow && origin === allow) {
    headers.set("Access-Control-Allow-Origin", allow);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", methods);
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Shtora-Key");
  return headers;
}

export function withCors(response: Response, request: Request, methods: string) {
  const headers = new Headers(response.headers);
  corsHeaders(request, methods).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

function missingServerConfig(): Response | null {
  if (!rpcKey()) return Response.json({ ok: false, error: "rpc key not configured" }, { status: 503 });
  if (!vpsOrigin()) return Response.json({ ok: false, error: "vps origin not configured" }, { status: 503 });
  return null;
}

export async function vpsFetch(path: string, init?: RequestInit) {
  const origin = vpsOrigin();
  if (!origin) throw new Error("vps origin not configured");
  const headers = new Headers(init?.headers);
  headers.set("X-Shtora-Key", rpcKey());
  headers.delete("host");
  if (!headers.has("Accept")) headers.set("Accept", "*/*");
  return fetch(`${origin}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
  });
}

export async function forwardToVps(request: Request): Promise<Response> {
  const blocked = missingServerConfig();
  if (blocked) return blocked;
  const url = new URL(request.url);
  const headers = new Headers();
  headers.set("X-Shtora-Key", rpcKey());
  const ct = request.headers.get("content-type");
  if (ct) headers.set("Content-Type", ct);
  const range = request.headers.get("range");
  if (range) headers.set("Range", range);
  const init: RequestInit = {
    method: request.method,
    headers,
    signal: AbortSignal.timeout(120_000),
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = Buffer.from(await request.arrayBuffer());
  }
  const res = await vpsFetch(`${url.pathname}${url.search}`, init);
  const out = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"]) {
    const value = res.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(res.body, { status: res.status, headers: out });
}

function isHealth(request: Request) {
  try {
    return new URL(request.url).pathname === "/api/health";
  } catch {
    return false;
  }
}

export async function vpsOrLocal(request: Request, local: () => Promise<Response>) {
  if (runningOnVps()) {
    if (!isHealth(request)) {
      const denied = assertRpc(request);
      if (denied) return denied;
    }
    return local();
  }
  const blocked = missingServerConfig();
  if (blocked) return blocked;
  try {
    return await forwardToVps(request);
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "vps down" },
      { status: 502 },
    );
  }
}

export async function proxyOr<T>(name: string, data: unknown, local: () => Promise<T>): Promise<T> {
  if (runningOnVps()) return local();
  if (!rpcKey() || !vpsOrigin()) {
    throw new Error(!rpcKey() ? "rpc key not configured" : "vps origin not configured");
  }
  const res = await vpsFetch("/api/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, data }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  if (!res.ok) {
    if (/unknown rpc/i.test(text)) return local();
    throw new Error(text.slice(0, 220) || `VPS ${name} HTTP ${res.status}`);
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
