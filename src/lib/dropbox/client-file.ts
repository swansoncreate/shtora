import { liveDropboxToken } from "./token";
import { apiFetch } from "@/lib/shtora-origin";

function friendlyDropboxError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const lower = raw.toLowerCase();
  if (lower.includes("load failed") || lower.includes("failed to fetch") || lower.includes("network")) {
    return new Error("Dropbox не открыл файл. Проверь интернет или подключи заново в настройках.");
  }
  return err instanceof Error ? err : new Error(raw || "Не удалось открыть файл Dropbox.");
}

export async function fetchDropboxBlob(token: string, path: string): Promise<Blob> {
  const live = await liveDropboxToken(token);
  let res: Response;
  try {
    res = await apiFetch("/api/dropbox-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: live, path }),
    });
  } catch (err) {
    throw friendlyDropboxError(err);
  }
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    const parsed = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(parsed?.error || "Не удалось открыть файл Dropbox.");
  }
  const blob = await res.blob();
  if (!blob.size) throw new Error("Пустой файл Dropbox.");
  if (type.includes("application/json")) {
    throw new Error("Dropbox не отдал файл. Проверьте files.content.read и подключите заново.");
  }
  return blob;
}
