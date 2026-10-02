import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataRoot } from "./data-dir.server";

const MAX_BYTES = 1_500_000;
const KEEP_BYTES = 400_000;

function scrub(value: unknown): unknown {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 12).map(scrub);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 16)) {
      const key = k.toLowerCase();
      if (/token|secret|key|authorization|password|prompt|image|base64/.test(key)) continue;
      out[k] = scrub(v);
    }
    return out;
  }
  const text = String(value).slice(0, 220);
  return text
    .replace(/apify_api_[A-Za-z0-9]+/gi, "apify_***")
    .replace(/xai-[A-Za-z0-9_-]+/gi, "xai_***")
    .replace(/sk-or-[A-Za-z0-9-]+/gi, "sk_***")
    .replace(/sl\.[A-Za-z0-9._-]+/gi, "sl.***")
    .replace(/Bearer\s+\S+/gi, "Bearer ***");
}

async function logPath() {
  const dir = join(await dataRoot(), "logs");
  await mkdir(dir, { recursive: true });
  return join(dir, "shtora.log");
}

async function rotate(path: string) {
  try {
    const info = await stat(path);
    if (info.size < MAX_BYTES) return;
    const raw = await readFile(path, "utf8");
    await writeFile(path, raw.slice(-KEEP_BYTES), "utf8");
  } catch {
    /* first write */
  }
}

export function slog(area: string, event: string, extra?: Record<string, unknown>) {
  void (async () => {
    const { runningOnVps, vpsFetch } = await import("./remote");
    if (!runningOnVps()) {
      await vpsFetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, event, extra }),
        signal: AbortSignal.timeout(8_000),
      });
      return;
    }
    const path = await logPath();
    await rotate(path);
    const line = JSON.stringify({
      t: new Date().toISOString(),
      area,
      event: String(event).slice(0, 120),
      ...(extra ? (scrub(extra) as Record<string, unknown>) : {}),
    });
    await appendFile(path, `${line}\n`, "utf8");
  })().catch(() => undefined);
}

export async function readShtoraLog(n = 200) {
  try {
    const raw = await readFile(await logPath(), "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const take = Math.max(20, Math.min(800, n));
    return lines.slice(-take);
  } catch {
    return [];
  }
}
