import { SHTORA_RPC_KEY, VPS_ORIGIN } from "@/lib/shtora-origin";

export function runningOnVps() {
  if (typeof process === "undefined") return false;
  return process.env.SHTORA_SELF === "1" || process.env.SHTORA_DATA_DIR === "/opt/shtora/data";
}

export function publicOrigin() {
  return (typeof process !== "undefined" && process.env.SHTORA_PUBLIC_ORIGIN) || VPS_ORIGIN;
}

export function rpcKey() {
  return (typeof process !== "undefined" && process.env.SHTORA_RPC_KEY) || SHTORA_RPC_KEY;
}

export async function vpsFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("X-Shtora-Key", rpcKey());
  headers.delete("host");
  if (!headers.has("Accept")) headers.set("Accept", "*/*");
  return fetch(`${VPS_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
  });
}

export async function forwardToVps(request: Request): Promise<Response> {
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

export async function vpsOrLocal(request: Request, local: () => Promise<Response>) {
  if (runningOnVps()) return local();
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
