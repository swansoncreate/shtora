import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isAllowedMediaHost, mediaFetchHeaders } from "@/lib/media-host";
import { DEFAULT_VARIATION_PROMPT } from "./prompt";

export { DEFAULT_VARIATION_PROMPT };

export async function fetchSourceImage(raw: string) {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return { ok: false as const, error: "Плохая ссылка на кадр." };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return { ok: false as const, error: "Плохая ссылка на кадр." };
  }
  if (!isAllowedMediaHost(target.hostname)) {
    return { ok: false as const, error: "Этот хост нельзя скачать." };
  }
  try {
    const res = await fetch(target.toString(), {
      headers: mediaFetchHeaders(target.hostname),
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false as const, error: `Фото HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 32) return { ok: false as const, error: "Пустой кадр." };
    if (buf.byteLength > 1_800_000) return { ok: false as const, error: "Кадр слишком большой." };
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0]?.trim() || "image/jpeg";
    if (!type.startsWith("image/")) return { ok: false as const, error: "Это не фото." };
    return { ok: true as const, url: `data:${type};base64,${buf.toString("base64")}` };
  } catch {
    return { ok: false as const, error: "Не скачался кадр для Imagine." };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let coolUntil = 0;
let imagineQueue: Promise<unknown> = Promise.resolve();

export function imagineCooling() {
  return Date.now() < coolUntil;
}

export function imagineRateMessage() {
  const sec = Math.max(1, Math.ceil((coolUntil - Date.now()) / 1000));
  return `Imagine просит подождать ${sec} сек — слишком часто.`;
}

function noteLimit(res?: Response) {
  const raw = res?.headers.get("retry-after");
  const sec = raw && /^\d+$/.test(raw) ? Number(raw) : 18;
  coolUntil = Date.now() + Math.min(60, Math.max(12, sec)) * 1000;
}

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = imagineQueue.then(work, work);
  imagineQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function runImageEdit(
  imageDataUrl: string,
  prompt?: string,
  extra?: string | string[],
  mode: "identity" | "compose" = "identity",
) {
  if (imagineCooling()) return { ok: false as const, error: imagineRateMessage() };
  return enqueue(() => runImageEditOnce(imageDataUrl, prompt, extra, mode));
}

async function runImageEditOnce(
  imageDataUrl: string,
  prompt?: string,
  extra?: string | string[],
  mode: "identity" | "compose" = "identity",
) {
  if (imagineCooling()) return { ok: false as const, error: imagineRateMessage() };
  const apiKey = typeof process === "undefined" ? "" : process.env.XAI_API_KEY;
  if (!apiKey) {
    return { ok: false as const, error: "Imagine сейчас недоступен в этой среде." };
  }

  const image = trimDataUrl(imageDataUrl);
  if (!image) return { ok: false as const, error: "Кадр слишком тяжёлый для Imagine." };
  const extras = (Array.isArray(extra) ? extra : extra ? [extra] : [])
    .map(trimDataUrl)
    .filter((url) => url && url !== image)
    .slice(0, 2);
  const compose = mode === "compose" && extras.length > 0;
  const refs =
    compose ? [image, ...extras].slice(0, 3) : extras[0] && mode === "identity" ? [image, extras[0]] : [image];
  const asked = prompt?.trim() || "";
  const bodyPrompt =
    asked ||
    (compose
      ? "One candid vertical phone photo of these people together. Keep every face. Not a collage, not two photos side by side."
      : DEFAULT_VARIATION_PROMPT);
  const tagged = refs.map((_, i) => `<IMAGE_${i}>`).join(" and ");
  const body =
    compose && refs.length > 1
      ? `${bodyPrompt} Use ${tagged}.`
      : mode === "identity" && refs.length > 1
        ? `${bodyPrompt} <IMAGE_1> same face.`
        : bodyPrompt;

  const aspect = /1:1|1080x1080/.test(bodyPrompt) ? "1:1" : "9:16";
  const payloads: Array<Record<string, unknown>> = [];
  if (refs.length > 1) {
    payloads.push({
      model: "grok-imagine-image-2.0",
      prompt: body,
      images: refs.map((url) => ({ url, type: "image_url" as const })),
      aspect_ratio: aspect,
    });
  } else {
    payloads.push({
      model: "grok-imagine-image-2.0",
      prompt: bodyPrompt,
      image: { url: refs[0], type: "image_url" },
      aspect_ratio: aspect,
    });
  }

  let last = "Imagine не ответил";
  for (const payload of payloads) {
    const hit = await postEdit(apiKey, payload);
    if (hit.ok) return hit;
    last = hit.error;
    if (/подождать|слишком часто|credit|spend|quota|Нет доступа/i.test(last)) return hit;
  }
  return { ok: false as const, error: last };
}

type EditHit = { ok: true; url: string } | { ok: false; error: string };

async function postEdit(apiKey: string, payload: unknown): Promise<EditHit> {
  let last = "Imagine не ответил";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (imagineCooling()) return { ok: false, error: imagineRateMessage() };
    if (attempt) await sleep(900);
    try {
      const res = await fetch("https://api.x.ai/v1/images/edits", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(55_000),
      });
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      if (res.status === 429) {
        noteLimit(res);
        const { slog } = await import("@/lib/server/log.server");
        slog("imagine", "image-fail", { http: 429 });
        return { ok: false, error: imagineRateMessage() };
      }
      if (res.status >= 500) {
        last = imagineError(parsed, res.status);
        continue;
      }
      if (!res.ok) {
        const err = imagineError(parsed, res.status);
        const { slog } = await import("@/lib/server/log.server");
        slog("imagine", "image-fail", { http: res.status, err });
        return { ok: false, error: err };
      }
      const url = imageUrlFrom(parsed);
      if (!url) {
        if (wasFiltered(parsed)) return { ok: false, error: "Imagine не принял этот кадр. Другое фото или промпт." };
        last = "Imagine вернул пустую картинку.";
        continue;
      }
      const { slog } = await import("@/lib/server/log.server");
      slog("imagine", "image-ok", { http: res.status });
      return { ok: true, url };
    } catch (err) {
      last =
        err instanceof Error && /timeout|abort/i.test(err.message)
          ? "Imagine не успел. Ещё раз."
          : "Сеть до Imagine оборвалась.";
    }
  }
  return { ok: false, error: last };
}

export const imagineVariation = createServerFn({ method: "POST" })
  .validator(
    z.object({
      imageDataUrl: z.string().min(32).max(8_000_000),
      prompt: z.string().min(1).max(1200).optional(),
      identityDataUrl: z.string().min(32).max(8_000_000).optional(),
      extraImages: z.array(z.string().min(32).max(8_000_000)).max(3).optional(),
      mode: z.enum(["identity", "compose"]).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { runningOnVps, proxyOr } = await import("@/lib/server/remote");
    if (runningOnVps()) {
      return { ok: false as const, error: "Imagine считается на публикации Grok, не на VPS." };
    }
    const extras = data.extraImages?.length ? data.extraImages : data.identityDataUrl;
    const mode = data.mode || (Array.isArray(extras) ? "compose" : "identity");
    const out = await runImageEdit(data.imageDataUrl, data.prompt, extras, mode);
    if (!out.ok) return out;
    const { persistRemoteImage } = await import("./persist.server");
    const stored = await persistRemoteImage(out.url);
    const url = browserMediaUrl(stored);
    if (!url) return { ok: false as const, error: "Не удалось положить файл на VPS." };
    const item = await proxyOr(
      "studio.save",
      { url, kind: "image" as const, prompt: data.prompt, from: "imagine" },
      async () => {
        const { saveStudioItem } = await import("./studio.server");
        return saveStudioItem({ url, kind: "image", prompt: data.prompt, from: "imagine" });
      },
    );
    return { ok: true as const, url: browserMediaUrl(item?.url) || url, id: item?.id };
  });

export const listStudio = createServerFn({ method: "POST" }).handler(async () => {
  const { proxyOr } = await import("@/lib/server/remote");
  return proxyOr("studio.list", {}, async () => {
    const { readStudioIndex } = await import("./studio.server");
    return readStudioIndex();
  });
});

export const saveStudio = createServerFn({ method: "POST" })
  .validator(
    z.object({
      url: z.string().min(8).max(8000),
      kind: z.enum(["image", "video"]),
      from: z.string().max(240).optional(),
      prompt: z.string().max(1200).optional(),
      id: z.string().max(80).optional(),
      urls: z.array(z.string().min(8).max(8000)).max(8).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { proxyOr } = await import("@/lib/server/remote");
    return proxyOr("studio.save", data, async () => {
      const { saveStudioItem } = await import("./studio.server");
      return saveStudioItem(data);
    });
  });

export const dropStudio = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1).max(80) }))
  .handler(async ({ data }) => {
    const { proxyOr } = await import("@/lib/server/remote");
    return proxyOr("studio.drop", data, async () => {
      const { dropStudioItem } = await import("./studio.server");
      await dropStudioItem(data.id);
      return { ok: true as const };
    });
  });

function browserMediaUrl(stored: string | undefined) {
  const raw = (stored || "").trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return "";
  if (raw.startsWith("/api/media?id=") || raw.startsWith("/api/chat-media?id=")) return raw;
  const named = raw.match(/\/chat-media\/([^/?#]+)/);
  if (named?.[1]) return `/api/chat-media?id=${named[1]}`;
  try {
    const parsed = new URL(raw, "http://shtora.local");
    const id = parsed.searchParams.get("id");
    if (id && parsed.pathname.includes("/api/media")) return `/api/media?id=${encodeURIComponent(id)}`;
    if (id && parsed.pathname.includes("chat-media")) return `/api/chat-media?id=${encodeURIComponent(id)}`;
  } catch {
    /* not a url */
  }
  return raw.length > 240 ? "" : raw;
}

function trimDataUrl(url: string) {
  const clean = url.trim();
  if (!clean.startsWith("data:image/")) return "";
  if (clean.length <= 6_500_000) return clean;
  return "";
}

async function embedImage(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < 32 || buf.byteLength > 8_000_000) continue;
      const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0]?.trim() || "image/jpeg";
      if (!type.startsWith("image/")) continue;
      return `data:${type};base64,${buf.toString("base64")}`;
    } catch {
      /* retry */
    }
  }
  return null;
}

function imageUrlFrom(body: unknown): string {
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (!rec) return "";
  const list = Array.isArray(rec.data) ? rec.data : [];
  const first = list[0] && typeof list[0] === "object" ? (list[0] as Record<string, unknown>) : rec;
  const raw =
    (typeof first.url === "string" && first.url) ||
    (typeof first.image_url === "string" && first.image_url) ||
    (typeof rec.url === "string" && rec.url) ||
    (typeof rec.image_url === "string" && rec.image_url) ||
    "";
  if (raw) return raw;
  const b64 = typeof first.b64_json === "string" ? first.b64_json : typeof rec.b64_json === "string" ? rec.b64_json : "";
  return b64 ? `data:image/jpeg;base64,${b64}` : "";
}

function wasFiltered(body: unknown) {
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (!rec) return false;
  const list = Array.isArray(rec.data) ? rec.data : [];
  const first = list[0] && typeof list[0] === "object" ? (list[0] as Record<string, unknown>) : rec;
  return first.respect_moderation === false;
}

function imagineError(body: unknown, status: number): string {
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const err = rec?.error;
  if (typeof err === "string" && err.trim()) return friendlyImagine(err.trim(), status);
  if (err && typeof err === "object") {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === "string" && msg.trim()) return friendlyImagine(msg.trim(), status);
  }
  if (status === 401 || status === 403) return "Нет доступа к Imagine.";
  if (status === 429) return "Imagine просит подождать — слишком часто.";
  if (status === 413) return "Кадр слишком большой.";
  if (status === 422) return "Imagine не принял формат кадра.";
  return `Imagine HTTP ${status}`;
}

function friendlyImagine(msg: string, status: number) {
  const low = msg.toLowerCase();
  if (status === 403 || low.includes("spending-limit") || low.includes("credits") || low.includes("quota")) {
    return "Закончились кредиты xAI — Imagine стоит. Пополни на grok.com/?_s=usage.";
  }
  if (status === 429 || /\brate[\s_-]?limit\b|too many requests|retry later/.test(low)) {
    return "Imagine просит подождать — слишком часто.";
  }
  if (low.includes("deserialize") || low.includes("invalid type") || low.includes("unprocessable") || status === 422) {
    return "Imagine не принял формат кадра.";
  }
  if (low.includes("moderat") || low.includes("content policy") || low.includes("safety") || low.includes("not allowed")) {
    return "Фильтр Imagine срезал кадр.";
  }
  if (low.includes("too large") || low.includes("payload") || low.includes("413")) return "Кадр слишком большой.";
  if (low.includes("timeout")) return "Imagine не успел. Ещё раз.";
  return msg.length > 140 ? "Imagine не смог обработать кадр." : msg;
}
