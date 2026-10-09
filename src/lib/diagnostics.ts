type DiagnosticLevel = "info" | "warn" | "error";
type DiagnosticEntry = { at: string; level: DiagnosticLevel; area: string; event: string; durationMs?: number; details?: Record<string, string | number | boolean | null> };

const STORAGE_KEY = "shtora-diagnostics-v1";
const MAX_ENTRIES = 250;

function safeDetails(input?: Record<string, unknown>): Record<string, string | number | boolean | null> | undefined {
  if (!input) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input).slice(0, 20)) {
    if (/token|secret|password|prompt|message|text|url|image|cookie|auth/i.test(key)) continue;
    if (typeof value === "string") out[key] = value.slice(0, 180);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) out[key] = value;
    else if (value instanceof Error) out[ key ] = value.name;
    else out[key] = String(value).slice(0, 100);
  }
  return out;
}

export function diagnosticLog(
  level: DiagnosticLevel,
  area: string,
  event: string,
  details?: Record<string, unknown>,
  durationMs?: number,
) {
  const entry: DiagnosticEntry = {
    at: new Date().toISOString(),
    level,
    area: area.slice(0, 40),
    event: event.slice(0, 120),
    ...(Number.isFinite(durationMs) ? { durationMs: Math.max(0, Math.round(durationMs!)) } : {}),
    ...(safeDetails(details) ? { details: safeDetails(details) } : {}),
  };
  try {
    const old = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const rows = Array.isArray(old) ? old : [];
    rows.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-MAX_ENTRIES)));
  } catch {
    /* diagnostics must never break app functionality */
  }
  if (level === "error") console.error("[shtora:diag]", entry);
  else if (level === "warn") console.warn("[shtora:diag]", entry);
  else console.info("[shtora:diag]", entry);
}

export function exportDiagnostics(): string {
  try {
    const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return JSON.stringify({
      app: "Shtora",
      exportedAt: new Date().toISOString(),
      userAgent: typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
      online: typeof navigator === "undefined" ? null : navigator.onLine,
      entries: Array.isArray(rows) ? rows.slice(-MAX_ENTRIES) : [],
    }, null, 2);
  } catch {
    return JSON.stringify({ app: "Shtora", exportedAt: new Date().toISOString(), entries: [], error: "local diagnostics unavailable" }, null, 2);
  }
}

export function clearDiagnostics() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
