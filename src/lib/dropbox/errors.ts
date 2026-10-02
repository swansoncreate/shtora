function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function nestedMessage(body: unknown): string {
  if (typeof body === "string" && body.trim()) return body.trim();
  const rec = asRecord(body);
  if (!rec) return "";
  if (typeof rec.error === "string" && rec.error.trim()) return rec.error.trim();
  const user = asRecord(rec.user_message);
  if (typeof user?.text === "string" && user.text.trim()) {
    const inner = parseDropboxJson(user.text);
    const nested = nestedMessage(inner);
    if (nested) return nested;
    return user.text.trim();
  }
  if (typeof rec.error_summary === "string") return rec.error_summary;
  return "";
}

export function explainDropboxError(body: unknown, status: number): string {
  const raw = nestedMessage(body).replace(/\s+/g, " ");
  const blob = raw.toLowerCase();

  if (blob.includes("files.metadata.write") || blob.includes("metadata.write")) {
    return "Чтобы ставить метку, в приложении Dropbox включите Permission files.metadata.write, нажмите Submit и в Шторе ещё раз «Подключить навсегда».";
  }
  if (
    blob.includes("files.content.write") ||
    blob.includes("insufficient_scope") ||
    blob.includes("missing_scope") ||
    blob.includes("required scope") ||
    blob.includes("not permitted to access this endpoint")
  ) {
    return "У приложения Dropbox нет нужных прав. Permissions: files.content.write, files.content.read, files.metadata.read, account_info.read → Submit → Generate новый токен.";
  }
  if (blob.includes("content-type") || blob.includes("charset")) {
    return "Dropbox отклонил заголовок загрузки. Попробуйте ещё раз.";
  }
  if (blob.includes("expired_access_token") || blob.includes("invalid_access_token")) {
    return "Токен Dropbox истёк — обновляю доступ. Если ошибка повторится, в настройках нажмите «Подключить навсегда».";
  }
  if (
    status === 401 ||
    status === 403 ||
    blob.includes("invalid_access_token")
  ) {
    return "Dropbox не принял токен. Generate новый (после Submit прав), вставьте целиком одной вставкой и нажмите «Сохранить токен».";
  }
  if (blob.includes("malformed")) {
    return "Некорректный путь папки в Dropbox.";
  }
  if (blob.includes("not_found")) {
    return "Папки нет или приложение создано как App folder. Нужен Full Dropbox и существующий путь.";
  }
  if (blob.includes("conflict") || blob.includes("already exists")) {
    return "В Dropbox уже есть объект с таким путём.";
  }
  if (blob.includes("too_many_write")) {
    return "Dropbox просит подождать — слишком много записей подряд.";
  }
  if (raw && !blob.startsWith("{")) {
    return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
  }
  if (raw) return raw.length > 180 ? `${raw.slice(0, 180)}…` : raw;
  return `Dropbox HTTP ${status}`;
}

export function parseDropboxJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
