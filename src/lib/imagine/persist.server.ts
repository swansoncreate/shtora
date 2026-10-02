import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { dataSubdir } from "@/lib/server/data-dir.server";
import { VPS_ORIGIN } from "@/lib/shtora-origin";

function publicAbs(path = "") {
  const origin = (typeof process !== "undefined" && process.env.SHTORA_PUBLIC_ORIGIN) || VPS_ORIGIN;
  return `${origin}${path}`;
}

function extOf(mime: string) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("quicktime") || mime.includes("mov")) return "mov";
  if (mime.includes("mp4") || mime.includes("video")) return "mp4";
  return "jpg";
}

function mimeOf(name: string) {
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".mp4")) return "video/mp4";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".mov")) return "video/quicktime";
  return "image/jpeg";
}

export async function persistRemoteImage(url: string) {
  try {
    if (url.startsWith("/api/chat-media") || url.startsWith("/chat-media") || url.includes("/chat-media/")) {
      return publicMediaUrl(url);
    }
    if (url.startsWith("data:image/")) {
      const match = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match?.[2]) return url;
      const buf = Buffer.from(match[2], "base64");
      if (buf.byteLength < 32) return url;
      return (await writeBuf(buf, match[1] || "image/jpeg")) || url;
    }
    if (!/^https?:\/\//i.test(url)) return url;
    const res = await fetch(url, {
      redirect: "follow",
      headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return url;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 32 || buf.byteLength > 8_000_000) return url;
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0]?.trim() || "image/jpeg";
    if (!type.startsWith("image/")) return url;
    return (await writeBuf(buf, type)) || url;
  } catch {
    return url;
  }
}

export async function persistRemoteVideo(url: string) {
  try {
    if (url.startsWith("/api/chat-media") || url.startsWith("/chat-media")) return publicMediaUrl(url);
    if (!/^https?:\/\//i.test(url)) return url;
    const headers: Record<string, string> = { Accept: "video/mp4,video/webm,video/*,*/*;q=0.8" };
    try {
      const host = new URL(url).hostname.toLowerCase();
      const key = process.env.XAI_API_KEY || "";
      if (key && (host.endsWith(".x.ai") || host === "x.ai" || host.endsWith(".grok.com"))) {
        headers.Authorization = `Bearer ${key}`;
      }
    } catch {
      /* ignore */
    }
    const res = await fetch(url, {
      redirect: "follow",
      headers,
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 64 || buf.byteLength > 50_000_000) return "";
    const type = (res.headers.get("content-type") || "video/mp4").split(";")[0]?.trim() || "video/mp4";
    if (type.startsWith("image/") || type.includes("json") || type.includes("html")) return "";
    const mime = type.startsWith("video/") ? type : "video/mp4";
    return (await writeBuf(buf, mime)) || "";
  } catch {
    return "";
  }
}

async function writeBuf(buf: Buffer, mime: string) {
  try {
    const { runningOnVps, vpsFetch } = await import("@/lib/server/remote");
    if (!runningOnVps()) {
      const res = await vpsFetch("/api/chat-media", {
        method: "POST",
        headers: { "Content-Type": mime || "application/octet-stream" },
        body: new Uint8Array(buf),
        signal: AbortSignal.timeout(90_000),
      });
      const json = (await res.json().catch(() => null)) as { url?: string } | null;
      return json?.url ? publicMediaUrl(json.url) : "";
    }
    const dir = await dataSubdir("chat-media");
    const name = `${randomUUID()}.${extOf(mime)}`;
    await writeFile(join(dir, name), buf);
    return publicAbs(`/chat-media/${encodeURIComponent(name)}`);
  } catch {
    return "";
  }
}

export async function persistBytes(buf: Buffer, mime: string) {
  return writeBuf(buf, mime);
}

export async function readPersistedImage(id: string) {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safe || safe !== id) return null;
  const roots = ["/workspace/data/chat-media", join(process.cwd(), "data", "chat-media"), join(process.env.TMPDIR || "/tmp", "shtora-data", "chat-media")];
  try {
    roots.unshift(join(await dataSubdir("chat-media")));
  } catch {
    /* ignore */
  }
  for (const dir of roots) {
    try {
      const buf = await readFile(join(dir, safe));
      if (buf.byteLength < 32) continue;
      return { buf, mime: mimeOf(safe) };
    } catch {
      /* next */
    }
  }
  return null;
}

export function publicMediaUrl(url: string) {
  const raw = (url || "").trim();
  if (!raw) return raw;
  if (raw.startsWith("/chat-media/")) return publicAbs(raw);
  if (raw.startsWith("http") && raw.includes("/chat-media/")) return raw;
  try {
    const parsed = new URL(raw, "http://shtora.local");
    if (parsed.pathname.includes("/api/chat-media")) {
      const id = parsed.searchParams.get("id");
      if (id) return `/chat-media/${encodeURIComponent(id)}`;
    }
  } catch {
    /* ignore */
  }
  const q = raw.match(/[?&]id=([^&]+)/);
  if (q?.[1]) return `/chat-media/${decodeURIComponent(q[1])}`;
  return raw;
}
