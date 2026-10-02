import type { SaveKind } from "./saved";

export const DROPBOX_MAX_BYTES = 80 * 1024 * 1024;
export const VIDEO_DIR = "видео";
export const SHARED_DIR = "общее";

export function safeName(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.slice(0, 80) || "file";
}

export function normalizeDropboxPath(raw: string): string {
  const trimmed = raw.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed === "/") return "/";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
}

export function parentDropboxPath(path: string): string {
  const clean = normalizeDropboxPath(path);
  const idx = clean.lastIndexOf("/");
  if (idx <= 0) return "/";
  return clean.slice(0, idx) || "/";
}

export function encodeDropboxArg(arg: unknown): string {
  return JSON.stringify(arg).replace(/[\u007f-\uffff]/g, (ch) => {
    return `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
  });
}

export function personRoot(folder: string): string {
  const clean = normalizeDropboxPath(folder);
  const last = (clean.split("/").pop() || "").toLowerCase();
  if (last === VIDEO_DIR || last === "video") return parentDropboxPath(clean);
  return clean;
}

export function sharedFolder(defaultFolder: string): string {
  return normalizeDropboxPath(`${defaultFolder || "/Штора"}/${SHARED_DIR}`);
}

export function destFor(folder: string, name: string, video = false): string {
  const base = personRoot(folder);
  const raw = video ? `${base}/${VIDEO_DIR}/${name}` : `${base}/${name}`;
  return normalizeDropboxPath(raw);
}

export function folderKind(kind: SaveKind): "posts" | "stories" | "highlights" | "profile" {
  if (kind === "post") return "posts";
  if (kind === "highlight") return "highlights";
  if (kind === "profile") return "profile";
  return "stories";
}

export function extFromType(contentType: string, url: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("image/jpeg") || ct.includes("image/jpg")) return "jpg";
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/webp")) return "webp";
  if (ct.includes("image/gif")) return "gif";
  if (ct.includes("video/mp4")) return "mp4";
  if (ct.includes("video/quicktime")) return "mov";
  if (ct.includes("video/webm")) return "webm";
  try {
    const path = new URL(url, "https://dummy.local").pathname.toLowerCase();
    const m = path.match(/\.(jpe?g|png|webp|gif|mp4|mov|webm)$/i);
    if (m?.[1]) return m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
  } catch {
    /* ignore */
  }
  return ct.startsWith("video/") ? "mp4" : "jpg";
}

export function withExt(destPath: string, ext: string): string {
  const clean = normalizeDropboxPath(destPath);
  if (/\.[a-z0-9]{2,5}$/i.test(clean)) return clean;
  return `${clean}.${ext}`;
}

export function normalizeDropboxToken(raw: string): string {
  return raw.trim().replace(/^Bearer\s+/i, "").replace(/\s+/g, "");
}
