import { getMediaBlob } from "@/lib/instagram/media-cache";
import { isVideoMediaUrl } from "@/lib/instagram/media-url";
import { mediaSrc } from "@/lib/utils";
import { explainDropboxError, parseDropboxJson } from "./errors";
import { ensureFolder } from "./functions";
import { apiFetch } from "@/lib/shtora-origin";
import {
  DROPBOX_MAX_BYTES,
  encodeDropboxArg,
  extFromType,
  normalizeDropboxToken,
  parentDropboxPath,
  withExt,
} from "./paths";

const CONTENT = "https://content.dropboxapi.com/2";
const DROPBOX_CONTENT_TYPE = "text/plain; charset=dropbox-cors-hack";

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("cors") ||
    m.includes("load failed")
  );
}

async function uploadDirect(
  token: string,
  destPath: string,
  blob: Blob,
): Promise<{ path: string; bytes: number }> {
  const res = await fetch(CONTENT + "/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": DROPBOX_CONTENT_TYPE,
      "Dropbox-API-Arg": encodeDropboxArg({
        path: destPath,
        mode: { ".tag": "overwrite" },
        mute: true,
      }),
    },
    body: blob,
  });
  const text = await res.text();
  const parsed = parseDropboxJson(text);
  if (!res.ok) throw new Error(explainDropboxError(parsed, res.status));
  const rec = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  const path =
    typeof rec?.path_display === "string"
      ? rec.path_display
      : typeof rec?.path_lower === "string"
        ? rec.path_lower
        : destPath;
  return { path, bytes: blob.size };
}

async function uploadViaApp(
  token: string,
  destPath: string,
  blob: Blob,
  sourceUrl: string,
): Promise<{ path: string; bytes: number }> {
  const form = new FormData();
  form.set("token", token);
  form.set("destPath", destPath);
  form.set("sourceUrl", sourceUrl);
  form.set("file", blob, "media");
  const res = await apiFetch("/api/dropbox-upload", { method: "POST", body: form });
  const parsed = (await res.json().catch(() => null)) as
    | { path?: string; bytes?: number; error?: string }
    | null;
  if (!res.ok || !parsed?.path) {
    throw new Error(parsed?.error || "Не удалось сохранить в Dropbox.");
  }
  return { path: parsed.path, bytes: parsed.bytes ?? blob.size };
}

async function posterFromVideo(url: string): Promise<Blob | undefined> {
  if (typeof document === "undefined") return undefined;
  const src = mediaSrc(url) || url;
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;
  try {
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error("poster timeout")), 12_000);
      video.onloadeddata = () => {
        window.clearTimeout(t);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(t);
        reject(new Error("poster fail"));
      };
    });
    video.currentTime = Math.min(0.2, (video.duration || 1) * 0.05);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      window.setTimeout(() => resolve(), 1500);
    });
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 1280;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, w, h);
    return await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b || undefined), "image/jpeg", 0.86);
    });
  } catch {
    return undefined;
  } finally {
    video.src = "";
  }
}

export async function uploadMediaJob(opts: {
  token: string;
  destPath: string;
  mediaUrl: string;
  posterFrom?: boolean;
}): Promise<{ path: string; bytes: number }> {
  const token = normalizeDropboxToken(opts.token);
  const blob = opts.posterFrom || (opts.destPath.includes("_cover") && isVideoMediaUrl(opts.mediaUrl))
    ? (await posterFromVideo(opts.mediaUrl)) || (await getMediaBlob(opts.mediaUrl))
    : await getMediaBlob(opts.mediaUrl);
  if (blob.size > DROPBOX_MAX_BYTES) {
    throw new Error("Файл слишком большой для загрузки в Dropbox.");
  }
  const dest = withExt(opts.destPath, extFromType(blob.type, opts.mediaUrl));

  try {
    return await uploadViaApp(token, dest, blob, opts.mediaUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const needsFolder =
      message.includes("Папки нет") ||
      message.includes("not_found") ||
      message.includes("path/not_found");
    if (needsFolder) {
      await ensureFolder({ data: { token, path: parentDropboxPath(dest) } });
      return await uploadViaApp(token, dest, blob, opts.mediaUrl);
    }
    if (isNetworkError(err)) {
      return await uploadDirect(token, dest, blob);
    }
    throw err;
  }
}
