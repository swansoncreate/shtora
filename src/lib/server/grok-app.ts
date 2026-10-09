import { rpcKey, runningOnVps } from "./remote";
import { dataRoot } from "./data-dir.server";
import { serverDiagnostic } from "./diagnostics";

const FILE = "grok-origin.txt";
let cached = "";

export async function readGrokOrigin(): Promise<string> {
  if (cached) return cached;
  const env = (typeof process !== "undefined" && process.env.SHTORA_GROK_ORIGIN) || "";
  if (env) {
    cached = env.replace(/\/+$/, "");
    return cached;
  }
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const raw = (await readFile(join(await dataRoot(), FILE), "utf8")).trim();
    if (/^https:\/\/[a-z0-9.-]+\.grok\.me$/i.test(raw)) cached = raw.replace(/\/+$/, "");
  } catch {
    /* none yet */
  }
  return cached;
}

export async function readGrokOriginStatus() {
  const origin = await readGrokOrigin();
  if (!origin) return { origin: "", fresh: false };
  try {
    const { stat } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const st = await stat(join(await dataRoot(), FILE));
    return { origin, fresh: Date.now() - st.mtimeMs < 24 * 60 * 60 * 1000 };
  } catch {
    return { origin, fresh: true };
  }
}

export async function writeGrokOrigin(origin: string) {
  const clean = origin.trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+\.grok\.me$/i.test(clean)) return false;
  cached = clean;
  try {
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await writeFile(join(await dataRoot(), FILE), `${clean}\n`, "utf8");
  } catch {
    /* keep memory */
  }
  return true;
}

export async function callGrokApp<T>(op: "reply" | "ping" | "imagine", data: unknown): Promise<T> {
  const startedAt = Date.now();
  const input = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const payload = input.payload && typeof input.payload === "object" ? input.payload as Record<string, unknown> : {};
  const prompt = op === "imagine" && typeof payload.prompt === "string" ? payload.prompt : undefined;
  await serverDiagnostic("info", "grok", "upstream request started", {
    operation: op,
    ...(prompt ? { promptPreview: prompt } : {}),
    ...(op === "imagine" ? {
      model: typeof payload.model === "string" ? payload.model.slice(0, 120) : "unknown",
      aspectRatio: typeof payload.aspect_ratio === "string" ? payload.aspect_ratio.slice(0, 20) : "default",
      hasImageReference: Boolean(payload.image),
      imageReferenceCount: Array.isArray(payload.images) ? payload.images.length : 0,
    } : {}),
  });
  const origin = await readGrokOrigin();
  if (!origin) {
    await serverDiagnostic("error", "grok", "upstream origin missing", { operation: op }, Date.now() - startedAt);
    return {
      ok: false,
      error: "Shtora не видит опубликованный Grok Build. Укажи SHTORA_GROK_ORIGIN.",
    } as T;
  }
  try {
    const res = await fetch(`${origin}/api/grok-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shtora-Key": rpcKey(),
      },
      body: JSON.stringify({ op, data, engine: "grok" }),
      signal: AbortSignal.timeout(90_000),
    });
    const text = await res.text();
    await serverDiagnostic(res.ok ? "info" : "warn", "grok", "upstream response received", { operation: op, status: res.status, responseBytes: Buffer.byteLength(text) }, Date.now() - startedAt);
    if (!res.ok) {
      return { ok: false, error: text.slice(0, 220) || `Grok app HTTP ${res.status}` } as T;
    }
    return (text ? JSON.parse(text) : { ok: false, error: "пустой ответ Grok" }) as T;
  } catch (err) {
    await serverDiagnostic("error", "grok", "upstream request failed", { operation: op, error: err instanceof Error ? err : String(err) }, Date.now() - startedAt);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Публикация Grok не ответила",
    } as T;
  }
}

export function shouldRunChatHere() {
  return !runningOnVps();
}
