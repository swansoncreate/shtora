import { runningOnVps } from "@/lib/server/remote";

export type ImageGatewayResult =
  | { ok: true; url: string; provider: "grok-publication" | "xai-api" }
  | { ok: false; error: string; provider?: "grok-publication" | "xai-api" };

export type ImageGatewayPayload = {
  model: string;
  prompt: string;
  image?: { url: string; type: "image_url" };
  images?: Array<{ url: string; type: "image_url" }>;
  aspect_ratio?: string;
};

export async function generateImage(payload: ImageGatewayPayload): Promise<ImageGatewayResult> {
  if (runningOnVps()) {
    const { callGrokApp } = await import("@/lib/server/grok-app");
    const remote = await callGrokApp<{ ok?: boolean; url?: string; error?: string }>("imagine", {
      payload,
      source: "shtora-vps",
    });
    if (remote?.ok && remote.url) {
      return { ok: true, url: remote.url, provider: "grok-publication" };
    }
    return {
      ok: false,
      error: remote?.error || "Публикация Grok не вернула картинку.",
      provider: "grok-publication",
    };
  }

  const apiKey = typeof process === "undefined" ? "" : process.env.XAI_API_KEY || "";
  if (!apiKey) return { ok: false, error: "Imagine сейчас недоступен в этой среде.", provider: "xai-api" };

  return postXai(apiKey, payload);
}

async function postXai(apiKey: string, payload: ImageGatewayPayload): Promise<ImageGatewayResult> {
  let last = "Imagine не ответил";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 900));
    try {
      const res = await fetch("https://api.x.ai/v1/images/edits", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
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
      if (res.status >= 500) {
        last = imagineError(parsed, res.status);
        continue;
      }
      if (res.status === 429) return { ok: false, error: imagineError(parsed, res.status), provider: "xai-api" };
      if (!res.ok) return { ok: false, error: imagineError(parsed, res.status), provider: "xai-api" };
      const url = imageUrlFrom(parsed);
      if (!url) {
        last = "Imagine вернул пустую картинку.";
        continue;
      }
      return { ok: true, url, provider: "xai-api" };
    } catch (err) {
      last = err instanceof Error && /timeout|abort/i.test(err.message) ? "Imagine не успел. Ещё раз." : "Сеть до Imagine оборвалась.";
    }
  }
  return { ok: false, error: last, provider: "xai-api" };
}

function imageUrlFrom(body: unknown) {
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
  return b64 ? "data:image/jpeg;base64," + b64 : "";
}

function imagineError(body: unknown, status: number) {
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const err = rec?.error;
  const msg =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && typeof (err as Record<string, unknown>).message === "string"
        ? String((err as Record<string, unknown>).message)
        : "";
  const low = msg.toLowerCase();
  if (status === 401 || status === 403) return "Нет доступа к Imagine.";
  if (status === 429 || low.includes("rate limit")) return "Imagine просит подождать — слишком часто.";
  if (status === 413 || low.includes("too large") || low.includes("payload")) return "Кадр слишком большой.";
  if (status === 422 || low.includes("unprocessable") || low.includes("invalid type")) return "Imagine не принял формат кадра.";
  if (low.includes("moderat") || low.includes("safety") || low.includes("content policy") || low.includes("not allowed")) return "Фильтр Imagine срезал кадр.";
  return msg && msg.length <= 160 ? msg : "Imagine HTTP " + status;
}
