import { dataRoot } from "./data-dir.server";

type Level = "info" | "warn" | "error";
type SafeValue = string | number | boolean | null;
const MAX_BYTES = 5 * 1024 * 1024;
const KEEP_ROTATED = 3;
let writeQueue: Promise<void> = Promise.resolve();

function safeDetails(input?: Record<string, unknown>) {
  if (!input) return undefined;
  const output: Record<string, SafeValue> = {};
  for (const [key, value] of Object.entries(input).slice(0, 30)) {
    // Only the explicitly named preview field may contain prompt text.
    if (key === "promptPreview" && typeof value === "string") {
      output.promptPreview = value
        .replace(/https?:\/\/\S+/gi, "[url]")
        .replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
        .replace(/[\r\n\t]/g, " ")
        .slice(0, 1800);
      continue;
    }
    if (/token|secret|password|prompt|message|text|url|image|cookie|auth|body|content|email|username|path|origin/i.test(key)) continue;
    if (typeof value === "number" || typeof value === "boolean" || value === null) output[key] = value;
    else if (value instanceof Error) {
      output[`${key}Type`] = value.name.slice(0, 80);
      const code = (value as Error & { code?: unknown }).code;
      if (typeof code === "string" && /^[A-Z0-9_-]{1,40}$/i.test(code)) output[`${key}Code`] = code;
    } else if (typeof value === "string") {
      if (/https?:\/\//i.test(value)) output[key] = value.replace(/https?:\/\/\S+/gi, "[url]").slice(0, 100);
      else output[key] = value.replace(/[\r\n\t]/g, " ").slice(0, 120);
    }
  }
  return Object.keys(output).length ? output : undefined;
}

export async function serverDiagnostic(level: Level, area: string, event: string, details?: Record<string, unknown>, durationMs?: number) {
  const safe = safeDetails(details);
  const entry = {
    at: new Date().toISOString(), level, source: "server",
    area: area.slice(0, 40), event: event.slice(0, 100),
    ...(Number.isFinite(durationMs) ? { durationMs: Math.max(0, Math.round(durationMs!)) } : {}),
    ...(safe ? { details: safe } : {}),
  };
  const line = JSON.stringify(entry) + "\n";
  const task = writeQueue.then(async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(await dataRoot(), "diagnostics");
    const file = path.join(dir, "server.jsonl");
    await fs.mkdir(dir, { recursive: true, mode: 0o750 });
    try {
      const stat = await fs.stat(file);
      if (stat.size + Buffer.byteLength(line) > MAX_BYTES) {
        for (let index = KEEP_ROTATED; index >= 1; index -= 1) {
          const from = index === 1 ? file : `${file}.${index - 1}`;
          const to = `${file}.${index}`;
          if (index === KEEP_ROTATED) await fs.rm(to, { force: true });
          try { await fs.rename(from, to); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await fs.appendFile(file, line, { encoding: "utf8", mode: 0o640 });
  });
  writeQueue = task.catch(() => undefined);
  try { await task; } catch (error) { console.error("[shtora:server-diagnostics] write failed", error instanceof Error ? error.name : "unknown"); }
  if (level === "error") console.error("[shtora:server]", entry);
  else if (level === "warn") console.warn("[shtora:server]", entry);
  else console.info("[shtora:server]", entry);
}
