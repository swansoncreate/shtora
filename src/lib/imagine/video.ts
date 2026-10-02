import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { keepPreset, videoPrompt } from "./prompt";

function apiKey() {
  return typeof process === "undefined" ? "" : process.env.XAI_API_KEY || "";
}

function imagineError(body: unknown, status: number) {
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const err = rec?.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  if (status === 401 || status === 403) return "Нет доступа к Imagine Video.";
  if (status === 429) return "Imagine Video просит подождать.";
  return `Imagine Video HTTP ${status}`;
}

export const startImagineVideo = createServerFn({ method: "POST" })
  .validator(
    z.object({
      imageDataUrl: z.string().min(32).max(8_000_000),
      prompt: z.string().min(1).max(800).optional(),
      duration: z.number().min(4).max(15).optional(),
      aspectRatio: z.enum(["9:16", "1:1"]).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const key = apiKey();
    if (!key) return { ok: false as const, error: "Imagine Video сейчас недоступен." };
    const image = data.imageDataUrl.trim();
    if (!image.startsWith("data:image/")) return { ok: false as const, error: "Нужен кадр." };
    const prompt = keepPreset(data.prompt?.trim() || videoPrompt("live")).slice(0, 800);
    return postVideoStart(key, "https://api.x.ai/v1/videos/generations", {
      model: "grok-imagine-video-1.5",
      prompt,
      duration: data.duration ?? 6,
      aspect_ratio: data.aspectRatio || "9:16",
      image: { url: image },
    });
  });

export const startImagineClip = createServerFn({ method: "POST" })
  .validator(
    z.object({
      mode: z.enum(["edit", "extend"]),
      prompt: z.string().min(1).max(800).optional(),
      videoUrl: z.string().min(8).max(8000).optional(),
      videoDataUrl: z.string().min(32).max(16_000_000).optional(),
      dropboxToken: z.string().min(8).max(8000).optional(),
      dropboxPath: z.string().min(1).max(1000).optional(),
      duration: z.number().min(2).max(10).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const key = apiKey();
    if (!key) return { ok: false as const, error: "Imagine Video сейчас недоступен." };
    const source = await resolveVideoSource(data);
    if (!source.ok) return source;
    const prompt = keepPreset(
      data.prompt?.trim() || videoPrompt(data.mode === "extend" ? "extend" : "edit"),
    ).slice(0, 800);
    const endpoint =
      data.mode === "extend" ? "https://api.x.ai/v1/videos/extensions" : "https://api.x.ai/v1/videos/edits";
    const models = ["grok-imagine-video-1.5", "grok-imagine-video"];
    let last = "Imagine Video не ответил";
    for (const model of models) {
      const body: Record<string, unknown> = {
        model,
        prompt,
        video: { url: source.url },
      };
      if (data.mode === "extend") body.duration = data.duration ?? 6;
      const hit = await postVideoStart(key, endpoint, body);
      if (hit.ok) return hit;
      last = hit.error;
      if (/credit|spend|quota|Нет доступа/i.test(last)) return hit;
    }
    return { ok: false as const, error: last };
  });

export const pollImagineVideo = createServerFn({ method: "POST" })
  .validator(z.object({ requestId: z.string().min(4).max(200) }))
  .handler(async ({ data }) => {
    const key = apiKey();
    if (!key) return { ok: false as const, error: "Imagine Video сейчас недоступен." };
    try {
      const res = await fetch(`https://api.x.ai/v1/videos/${encodeURIComponent(data.requestId)}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20_000),
      });
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      if (!res.ok) return { ok: false as const, error: imagineError(parsed, res.status) };
      const rec = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      const status = typeof rec?.status === "string" ? rec.status.toLowerCase() : "";
      const video = rec?.video && typeof rec.video === "object" ? (rec.video as Record<string, unknown>) : null;
      const url =
        (typeof video?.url === "string" && video.url) ||
        (typeof rec?.video_url === "string" && rec.video_url) ||
        (typeof rec?.url === "string" && rec.url) ||
        "";
      if (status === "failed" || status === "expired") {
        return { ok: false as const, error: "Видео не собралось. Попробуй другой кадр." };
      }
      if (url && (status === "done" || status === "completed" || status === "succeeded" || !status)) {
        try {
          const { persistRemoteVideo } = await import("./persist.server");
          const stored = await persistRemoteVideo(url);
          const { slog } = await import("@/lib/server/log.server");
          slog("imagine", "video-done", { stored: Boolean(stored) });
          if (stored) return { ok: true as const, status: "done" as const, url: stored };
        } catch {
          /* keep remote */
        }
        return { ok: true as const, status: "done" as const, url: `/api/media?u=${encodeURIComponent(url)}` };
      }
      return { ok: true as const, status: "running" as const };
    } catch {
      return { ok: false as const, error: "Не дождались статус видео." };
    }
  });

async function postVideoStart(key: string, endpoint: string, body: unknown) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const err = imagineError(parsed, res.status);
      const { slog } = await import("@/lib/server/log.server");
      slog("imagine", "video-fail", { http: res.status, err });
      return { ok: false as const, error: err };
    }
    const rec = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    const id =
      (typeof rec?.request_id === "string" && rec.request_id) || (typeof rec?.id === "string" && rec.id) || "";
    if (!id) return { ok: false as const, error: "Imagine Video не дал задачу." };
    const { slog } = await import("@/lib/server/log.server");
    slog("imagine", "video-start", { id: id.slice(0, 12) });
    return { ok: true as const, requestId: id };
  } catch {
    return { ok: false as const, error: "Сеть до Imagine Video оборвалась." };
  }
}

async function resolveVideoSource(data: {
  videoUrl?: string;
  videoDataUrl?: string;
  dropboxToken?: string;
  dropboxPath?: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (data.dropboxPath && data.dropboxToken) {
    try {
      const { getDropboxTemporaryLink, downloadDropboxFile } = await import("@/lib/dropbox/dropbox.server");
      try {
        const { link } = await getDropboxTemporaryLink(data.dropboxToken, data.dropboxPath);
        if (link) return { ok: true, url: link };
      } catch {
        /* download */
      }
      const file = await downloadDropboxFile(data.dropboxToken, data.dropboxPath);
      return bytesToDataUrl(file.bytes, file.contentType);
    } catch {
      return { ok: false, error: "Не прочитался ролик из Dropbox." };
    }
  }
  const raw = data.videoUrl?.trim() || "";
  if (raw.startsWith("/api/chat-media")) {
    try {
      const id = new URL(raw, "https://shtora.local").searchParams.get("id") || "";
      const { readPersistedImage } = await import("./persist.server");
      const file = await readPersistedImage(id);
      if (!file) return { ok: false, error: "Ролик не найден." };
      return bytesToDataUrl(file.buf, file.mime);
    } catch {
      return { ok: false, error: "Ролик не открылся." };
    }
  }
  if (/^https?:\/\//i.test(raw)) return { ok: true, url: raw };
  if (data.videoDataUrl?.startsWith("data:video")) return { ok: true, url: data.videoDataUrl };
  return { ok: false, error: "Нужен ролик." };
}

function bytesToDataUrl(bytes: Buffer | ArrayBuffer, mime: string): { ok: true; url: string } | { ok: false; error: string } {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buf.byteLength < 64) return { ok: false, error: "Пустой ролик." };
  if (buf.byteLength > 12_000_000) return { ok: false, error: "Ролик слишком тяжёлый для Imagine." };
  const type = mime.startsWith("video/") ? mime : "video/mp4";
  return { ok: true, url: `data:${type};base64,${buf.toString("base64")}` };
}
