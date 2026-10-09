import { composeChatPhoto } from "./photo";
import { photoAllowed, photoTier, maybeOfferPhoto, type ChatBond } from "./bond";
import { persistChatImage, stashChatPhoto } from "@/lib/instagram/media-cache";
import { pollImagineVideo, startImagineVideo } from "@/lib/imagine/video";
import { videoPrompt } from "@/lib/imagine/prompt";
import { worldPrompt } from "./world";
import { looksLikeCameraAsk } from "./functions";
import type { PhotoIntent, CameraMode } from "@/lib/visual/types";
import { deterministicPhotoIntent } from "@/lib/visual/intent";
import { listVisualMemoryFn } from "@/lib/visual/functions";
import { getThread, patchThread } from "./store";
import { diagnosticLog } from "@/lib/diagnostics";

export type MediaPlan = {
  ready: boolean;
  kind: string;
  circle: boolean;
  gallery: boolean;
  reason: string;
};

export type MediaAsk = MediaPlan & {
  clothes?: string;
  place?: string;
  hair?: string;
  activity?: string;
  timeContext?: string;
  weather?: string;
  userText?: string;
  dropboxToken?: string;
  dropboxFolder?: string;
  dropboxSkip?: number;
  dropboxSeed?: string;
  instagramUrls?: string[];
  lastPhotoUrl?: string;
  username?: string;
  visualIntent?: PhotoIntent;
};

export type MediaOut =
  | { ok: true; kind: "photo" | "circle"; url: string; prompt: string; sceneId?: string; jobId?: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

export function decideChatMedia(input: {
  refused: boolean;
  offered: boolean;
  askedPhoto: boolean;
  askedCircle: boolean;
  askedGallery: boolean;
  action: boolean;
  busy: boolean;
  burst: number;
  bond: ChatBond;
  girlfriend: boolean;
  night: boolean;
  canPhoto: boolean;
  modelKind?: string;
  force?: boolean;
}): MediaPlan {
  const no: MediaPlan = { ready: false, kind: "none", circle: false, gallery: false, reason: "not-ready" };
  if (input.action) return { ...no, reason: "action" };
  if (input.force) {
    const circle = Boolean(input.askedCircle) || input.modelKind === "circle";
    const raw = input.modelKind && input.modelKind !== "none" && input.modelKind !== "circle" ? input.modelKind : "selfie";
    return {
      ready: true,
      kind: circle ? "selfie" : raw,
      circle,
      gallery: Boolean(input.askedGallery),
      reason: circle ? "circle" : "force-look",
    };
  }
  if (input.refused) return { ...no, reason: "refused" };
  if (input.modelKind === "none" && !input.offered) return { ...no, reason: "model-none" };
  if (input.burst >= 2 && !input.offered) return { ...no, reason: "burst" };
  const wants = input.askedPhoto || input.askedCircle || input.askedGallery || input.offered;
  if (!wants) return { ...no, reason: "no-ask" };
  if (input.busy && !input.offered && !input.askedGallery) return { ...no, reason: "busy" };
  const tier = photoTier(input.bond, input.girlfriend);
  if (input.askedCircle && tier >= 1 && input.modelKind !== "none") {
    return { ready: true, kind: "selfie", circle: true, gallery: input.askedGallery, reason: "circle" };
  }
  if (input.askedGallery && tier >= 1) {
    return { ready: true, kind: "gallery", circle: false, gallery: true, reason: "gallery" };
  }
  const preferred = input.modelKind && input.modelKind !== "none" ? input.modelKind : input.offered ? "selfie" : "selfie";
  const gated = photoAllowed(input.bond, preferred, input.girlfriend);
  if (gated === "none") {
    if (input.offered && !input.busy) {
      return { ready: true, kind: input.night ? "pov" : "selfie", circle: false, gallery: false, reason: "offered" };
    }
    return { ...no, reason: "tier" };
  }
  if (!input.askedPhoto && !input.offered && !maybeOfferPhoto(input.bond, true, input.girlfriend, input.burst, input.canPhoto || input.night, input.night)) {
    return { ...no, reason: "gate" };
  }
  return { ready: true, kind: gated, circle: false, gallery: false, reason: gated };
}

async function jpeg(url: string) {
  if (url.startsWith("data:image")) return url;
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return "";
  const blob = await res.blob();
  if (!blob.size || blob.type.includes("json")) return "";
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
}

const CHAT_IMAGE_TIMEOUT_MS = 90_000;

async function withChatImageDeadline<T>(work: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: время ожидания истекло. Попробуй ещё раз.`)), CHAT_IMAGE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function sendChatMedia(ask: MediaAsk): Promise<MediaOut> {
  if (!ask.ready || ask.kind === "none") return { ok: false, skipped: true, reason: ask.reason || "not-ready" };
  let imageUrl = "";
  let prompt = "";
  let sceneId: string | undefined;
  let jobId: string | undefined;
  if (ask.gallery && ask.username) {
    try {
      const query = (ask.userText || "").trim();
      const result = await listVisualMemoryFn({ data: { username: ask.username, query } });
      const rows = result.memories || [];
      const first = rows[0];
      if (first?.imageUrl) {
        return { ok: true, kind: "photo", url: first.imageUrl, prompt: first.prompt || "", sceneId: first.sceneId };
      }
    } catch {
      /* fall through to legacy generation if memory is unavailable */
    }
  }
  const startedAt = Date.now();
  diagnosticLog("info", "chat-photo", "generation started", { kind: ask.kind, hasPreviousPhoto: Boolean(ask.lastPhotoUrl), gallery: ask.gallery });
  try {
    let sourceDataUrl: string | undefined;
    const inferredIntent: PhotoIntent =
      ask.visualIntent ||
      (ask.kind === "back" || ask.kind === "side" || ask.kind === "full"
        ? { mode: "continue", camera: ask.kind as CameraMode, reference: "last_photo" }
        : deterministicPhotoIntent(ask.userText || "", Boolean(ask.lastPhotoUrl)));
    const reuse =
      Boolean(ask.lastPhotoUrl) &&
      !ask.gallery &&
      inferredIntent.mode === "continue" ||
      ("reference" in inferredIntent && inferredIntent.reference === "last_photo");
    if (reuse && ask.lastPhotoUrl) {
      const sourceStartedAt = Date.now();
      try {
        sourceDataUrl = (await withChatImageDeadline(jpeg(ask.lastPhotoUrl), "Загрузка исходного фото")) || undefined;
        diagnosticLog(sourceDataUrl ? "info" : "warn", "chat-photo", sourceDataUrl ? "source photo loaded" : "source photo unavailable", { reuse }, Date.now() - sourceStartedAt);
      } catch (error) {
        diagnosticLog("error", "chat-photo", "source photo download failed", { error: error instanceof Error ? error.message : String(error) }, Date.now() - sourceStartedAt);
        sourceDataUrl = undefined;
      }
      if (sourceDataUrl && !sourceDataUrl.startsWith("data:image")) sourceDataUrl = undefined;
    }
    const pic = await withChatImageDeadline(composeChatPhoto({
      data: {
        kind: ask.gallery ? "gallery" : ask.kind === "circle" ? "selfie" : ask.kind || "selfie",
        userText: (ask.userText || "").slice(0, 400),
        scene: ask.gallery ? "" : (ask.place || "").slice(0, 80),
        world: ask.gallery
          ? ""
          : worldPrompt({ clothes: ask.clothes, place: ask.place, hair: ask.hair }),
        dropboxToken: sourceDataUrl ? undefined : ask.dropboxToken,
        dropboxFolder: sourceDataUrl ? undefined : ask.dropboxFolder,
        dropboxSkip: sourceDataUrl ? 0 : ask.dropboxSkip,
        dropboxSeed: ask.dropboxSeed,
        instagramUrls: ask.instagramUrls,
        sourceDataUrl,
        username: ask.username,
        visualIntent: inferredIntent.mode === "none" ? undefined : inferredIntent,
        hair: ask.hair,
        activity: ask.activity,
        timeContext: ask.timeContext,
        weather: ask.weather,
      },
    }), "Imagine не вернул фото");
    prompt = pic.prompt || "";
    if (pic.ok && pic.url) {
      imageUrl = pic.url;
      sceneId = pic.sceneId;
      jobId = pic.jobId;
      if (ask.username && pic.sceneId) {
        const live = getThread(ask.username);
        if (live) {
          await patchThread(ask.username, {
            world: {
              ...(live.world || {}),
              sceneId: pic.sceneId,
            },
          });
        }
      }
    } else {
      diagnosticLog("error", "chat-photo", "Imagine returned no image", { error: pic.error || "empty result" }, Date.now() - startedAt);
      const raw = pic.error || "Imagine не собрал кадр";
      return {
        ok: false,
        skipped: false,
        error: /var\/task|EACCES|EROFS|ENOENT|permission/i.test(raw) ? "Не удалось сохранить кадр. Ещё раз." : raw,
      };
    }
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Imagine не собрал кадр";
    diagnosticLog("error", "chat-photo", "generation failed", { error: raw }, Date.now() - startedAt);
    return {
      ok: false,
      skipped: false,
      error: /load failed|failed to fetch|networkerror/i.test(raw) ? "Кадр не доехал. Ещё раз." : raw,
    };
  }
  if (ask.circle) {
    try {
      const still = await jpeg(imageUrl);
      if (still) {
        const start = await startImagineVideo({
          data: {
            imageDataUrl: still,
            duration: 6,
            aspectRatio: "9:16",
            prompt: videoPrompt("circle", prompt),
          },
        });
        if (start.ok) {
          for (let i = 0; i < 22; i += 1) {
            await new Promise((r) => window.setTimeout(r, 2200));
            const poll = await pollImagineVideo({ data: { requestId: start.requestId } });
            if (!poll.ok) break;
            if (poll.status === "done" && poll.url) {
              const id = crypto.randomUUID();
              const media = await stashChatPhoto(id, poll.url);
              return { ok: true, kind: "circle", url: media, prompt, sceneId, jobId };
            }
          }
        }
      }
    } catch {
      /* still falls through — never silent-skip a promised circle */
    }
    return persistStill(imageUrl, prompt, "photo", sceneId, jobId);
  }
  return persistStill(imageUrl, prompt, "photo", sceneId, jobId);
}

async function persistStill(imageUrl: string, prompt: string, kind: "photo" | "circle", sceneId?: string, jobId?: string): Promise<MediaOut> {
  const id = crypto.randomUUID();
  const stable = await persistChatImage(imageUrl);
  const cached = await stashChatPhoto(id, stable);
  diagnosticLog("info", "chat-photo", "image persisted", { kind, hasScene: Boolean(sceneId), hasJob: Boolean(jobId) });
  return { ok: true, kind, url: cached.startsWith("/") || cached.startsWith("blob:") ? cached : stable, prompt, sceneId, jobId };
}
