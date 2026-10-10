import { dataRoot } from "./data-dir.server";

const LOG_NAME = "server.jsonl";
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_BACKUPS = 3;
let writeQueue: Promise<unknown> = Promise.resolve();

export function safeDiagnosticValue(key: string, value: unknown): string | number | boolean | null | undefined {
  // Preserve safe scalar telemetry (counts, durations, and hasX flags) even when the key mentions a sensitive field.
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (/password|secret|token|cookie|authorization|prompt|message|text|image|url|body|payload|content|email|username/i.test(key)) return undefined;
  if (value instanceof Error) return value.name;
  if (typeof value === "string") return value.slice(0, 160).replace(/https?:\/\/\S+/gi, "[url]");
  return undefined;
}

export function serverDiagnostic(
  level: "info" | "warn" | "error",
  area: string,
  event: string,
  details: Record<string, unknown> = {},
  durationMs?: number,
) {
  const clean: Record<string, string | number | boolean | null> = {};
  const traceId = typeof details.traceId === "string" ? details.traceId.slice(0, 100) : undefined;
  for (const [key, value] of Object.entries(details).slice(0, 30)) {
    if (key === "traceId") continue;
    const safe = safeDiagnosticValue(key, value);
    if (safe !== undefined) clean[key] = safe;
  }
  const entry = {
    at: new Date().toISOString(),
    level,
    ...(traceId ? { traceId } : {}),
    area: area.slice(0, 40),
    event: event.slice(0, 100),
    ...(Number.isFinite(durationMs) ? { durationMs: Math.max(0, Math.round(durationMs!)) } : {}),
    ...(Object.keys(clean).length ? { details: clean } : {}),
    pid: typeof process !== "undefined" ? process.pid : undefined,
  };
  const line = JSON.stringify(entry) + "\n";
  if (level === "error") console.error("[shtora:server]", entry);
  else if (level === "warn") console.warn("[shtora:server]", entry);
  else console.info("[shtora:server]", entry);

  writeQueue = writeQueue.then(async () => {
    const [{ appendFile, rename, stat, unlink }, { join }] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    const root = await dataRoot();
    const dir = join(root, "diagnostics");
    const file = join(dir, LOG_NAME);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    try {
      const info = await stat(file);
      if (info.size + Buffer.byteLength(line) > MAX_BYTES) {
        await unlink(join(dir, LOG_NAME + "." + MAX_BACKUPS)).catch(() => undefined);
        for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
          await rename(join(dir, LOG_NAME + "." + i), join(dir, LOG_NAME + "." + (i + 1))).catch(() => undefined);
        }
        await rename(file, join(dir, LOG_NAME + ".1"));
      }
    } catch { /* first log file */ }
    await appendFile(file, line, { encoding: "utf8", mode: 0o600 });
  }).catch((error) => {
    console.error("[shtora:server] failed to persist diagnostic log", error instanceof Error ? error.name : "unknown");
  });
}

export async function flushServerDiagnostics() {
  await writeQueue;
}
