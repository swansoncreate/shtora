import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { deterministicPhotoIntent, photoIntentSchema } from "@/lib/visual/intent";
import type { VisualContext } from "@/lib/visual/types";
import { latestVisualMemory, listVisualMemory, saveVisualMemory } from "@/lib/visual/memory.server";
import { createGenerationJob, updateGenerationJob } from "@/lib/visual/jobs.server";
import { planLifeScene, planPrompt } from "@/lib/visual/planner";
import { makeSceneId, resolveScene } from "@/lib/visual/scene";
import { recentSourcePaths, rememberSourcePath } from "@/lib/visual/source-history.server";

function trimDataImage(raw?: string) {
  const s = (raw || "").trim();
  if (!s.startsWith("data:image/")) return "";
  if (s.length < 80) return "";
  return s.slice(0, 8_000_000);
}

export async function makePhoto(
  selfie: string | undefined,
  kind: string,
  userText = "",
  context = "",
  sceneLine = "",
  worldLine = "",
  identity?: string,
  prompt?: string,
) {
  if (!selfie || kind === "none") return { ok: false as const, url: undefined, error: "Нет кадра.", prompt: "" };
  const { runStill } = await import("@/lib/imagine/jobs");
  return runStill({
    kind,
    source: selfie,
    identity,
    userText: `${userText} ${context}`.trim(),
    scene: sceneLine,
    world: worldLine,
    prompt,
  });
}

async function sourceReferenceJpeg(raw?: string) {
  const value = (raw || "").trim();
  const direct = trimDataImage(value);
  if (direct) return direct;
  if (!value) return "";
  try {
    const { readPersistedImage } = await import("@/lib/imagine/persist.server");
    if (value.startsWith("/chat-media/")) {
      const name = decodeURIComponent(value.split("/").pop() || "");
      const hit = await readPersistedImage(name);
      if (hit) return "data:" + hit.mime + ";base64," + hit.buf.toString("base64");
    }
    const parsed = new URL(value);
    if (parsed.pathname.startsWith("/chat-media/")) {
      const name = decodeURIComponent(parsed.pathname.split("/").pop() || "");
      const hit = await readPersistedImage(name);
      if (hit) return "data:" + hit.mime + ";base64," + hit.buf.toString("base64");
    }
  } catch {
    /* continue with network fetch */
  }
  try {
    const { fetchSourceImage } = await import("@/lib/imagine/functions");
    const hit = await fetchSourceImage(value);
    return hit.ok ? hit.url : "";
  } catch {
    return "";
  }
}

async function identityJpeg(data: {
  dropboxToken?: string;
  dropboxFolder?: string;
  dropboxSkip?: number;
  dropboxSeed?: string;
  username?: string;
  visualIntent?: import("@/lib/visual/types").PhotoIntent;
  sceneId?: string;
  parentId?: string;
  instagramUrls?: string[];
  identityUrl?: string;
  sourceDataUrl?: string;
  noIdentity?: boolean;
}) {
  const skip = data.dropboxSkip ?? 0;
  const portrait = data.noIdentity
    ? { image: "", error: "" }
    : await firstInstagram([data.identityUrl, ...(data.instagramUrls ?? [])].filter(Boolean) as string[], 0);
  const reuse = await sourceReferenceJpeg(data.sourceDataUrl);
  if (reuse) return { image: reuse, identity: portrait.image || reuse, error: "", sourcePath: "" };
  if (data.dropboxToken && data.dropboxFolder) {
    try {
      const { pickDropboxImageSource } = await import("@/lib/dropbox/dropbox.server");
      const excluded = data.username ? await recentSourcePaths(data.username) : [];
      const dbx = await pickDropboxImageSource(data.dropboxToken, data.dropboxFolder, {
        skip,
        seed: data.dropboxSeed,
        excludePaths: excluded,
      });
      if (dbx) return { image: dbx.image, identity: portrait.image, error: "", sourcePath: dbx.path };
      return {
        image: "",
        identity: portrait.image,
        error: "Нет фото с меткой shtora. В Dropbox отметь кадры для ленты и лички.",
        sourcePath: "",
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Dropbox не отдал кадр.";
      return { image: "", identity: portrait.image, error, sourcePath: "" };
    }
  }
  const ig = await firstInstagram(data.instagramUrls, skip);
  if (ig.image) return { image: ig.image, identity: portrait.image || ig.image, error: "", sourcePath: "" };
  if (portrait.image) return { image: portrait.image, identity: portrait.image, error: "", sourcePath: "" };
  return { image: "", identity: "", error: ig.error || portrait.error || "Нет исходного кадра.", sourcePath: "" };
}

async function firstInstagram(urls: string[] | undefined, skip: number) {
  const list = [...new Set((urls ?? []).filter((u) => /^https?:\/\//i.test(u)))];
  if (!list.length) return { image: "", error: "Нет исходного кадра. Открой профиль." };
  const start = Math.abs(skip) % list.length;
  let lastErr = "";
  for (let i = 0; i < Math.min(list.length, 4); i += 1) {
    const url = list[(start + i) % list.length];
    if (!url) continue;
    const { fetchSourceImage } = await import("@/lib/imagine/functions");
    const fetched = await fetchSourceImage(url);
    if (fetched.ok) return { image: fetched.url, error: "" };
    lastErr = fetched.error;
  }
  return { image: "", error: lastErr || "Instagram не отдал кадр." };
}

export const composeChatPhoto = createServerFn({ method: "POST" })
  .validator(
    z.object({
      kind: z.string().min(1).max(20),
      userText: z.string().max(400).optional(),
      context: z.string().max(500).optional(),
      scene: z.string().max(300).optional(),
      dropboxToken: z.string().min(8).max(8000).optional(),
      dropboxFolder: z.string().max(1000).optional(),
      dropboxSkip: z.number().min(0).max(400).optional(),
      dropboxSeed: z.string().max(80).optional(),
      instagramUrls: z.array(z.string().max(2000)).max(12).optional(),
      identityUrl: z.string().max(2000).optional(),
      world: z.string().max(400).optional(),
      sourceDataUrl: z.string().min(32).max(8_000_000).optional(),
      prompt: z.string().max(1200).optional(),
      noIdentity: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    let job: { id: string } | undefined;
    try {
      const username = data.username?.trim().toLowerCase();
      const previous = username ? await latestVisualMemory(username) : undefined;
      const baseContext: VisualContext = {
        place: data.scene || undefined,
        sceneId: data.sceneId || previous?.sceneId || undefined,
      };
      const intent =
        data.visualIntent ||
        (data.kind === "feed"
          ? { mode: "new_scene" as const, camera: "candid" as const, reference: "identity" as const }
          : deterministicPhotoIntent(data.userText || data.kind, Boolean(data.sourceDataUrl)));
      let plan = undefined;
      let finalPrompt = data.prompt;
      if (data.kind === "feed" && username && !data.sourceDataUrl) {
        const memories = await listVisualMemory(username);
        plan = planLifeScene({
          username,
          world: baseContext,
          recentPlaces: memories.map((m) => m.scene.place).filter((v): v is string => Boolean(v)).slice(0, 10),
          recentOutfits: memories.map((m) => m.scene.clothes).filter((v): v is string => Boolean(v)).slice(0, 10),
        });
        finalPrompt = planPrompt(data.prompt || "", plan);
      }

      if (username) {
        job = await createGenerationJob({
          username,
          status: "queued",
          intent,
          sceneId: data.sceneId,
          scenePlan: plan,
          worldSnapshot: baseContext,
          parentId: data.parentId || previous?.id,
          provider: "pending",
        });
        await updateGenerationJob(username, job.id, { status: plan ? "planning" : "source_selected" });
      }

      const found = await identityJpeg({ ...data, username });
      if (!found.image) {
        if (username && job) await updateGenerationJob(username, job.id, { status: "failed", error: found.error || "Нет кадра.", retryable: true });
        return { ok: false as const, url: undefined, error: found.error || "Нет кадра.", prompt: "", kind: data.kind };
      }

      if (username && job) {
        await updateGenerationJob(username, job.id, {
          status: "source_selected",
          sourcePath: found.sourcePath || undefined,
          sourceImageUrl: found.image,
        });
        await updateGenerationJob(username, job.id, { status: "generating", finalPrompt: finalPrompt || undefined });
      }

      const out = await makePhoto(
        found.image,
        data.kind,
        data.userText || "",
        data.context || "",
        data.scene || "",
        data.world || "",
        data.noIdentity ? undefined : found.identity || undefined,
        finalPrompt,
      );
      if (!out.ok || !out.url) {
        if (username && job) await updateGenerationJob(username, job.id, { status: "failed", error: out.error || "Imagine не собрал кадр.", retryable: true });
        return { ok: out.ok, url: out.url, error: out.error, prompt: out.prompt, kind: data.kind };
      }

      const { persistRemoteImage } = await import("@/lib/imagine/persist.server");
      const url = (await persistRemoteImage(out.url)) || out.url;
      if (found.sourcePath && username) await rememberSourcePath(username, found.sourcePath);

      let sceneId = data.sceneId || previous?.sceneId;
      if (username) {
        const current: VisualContext = {
          ...baseContext,
          place: plan?.place || data.scene || previous?.scene?.place,
          clothes: plan?.outfit || previous?.scene?.clothes,
          activity: plan?.activity || previous?.scene?.activity,
          timeContext: plan?.timeContext || previous?.scene?.timeContext,
          weather: plan?.weather,
          sceneId,
        };
        const scene = resolveScene({
          username,
          intent,
          previous: previous
            ? {
                id: previous.sceneId || makeSceneId(username, previous.createdAt),
                username,
                createdAt: previous.createdAt,
                ...previous.scene,
              }
            : undefined,
          current,
        });
        sceneId = scene.id;
        if (job) await updateGenerationJob(username, job.id, { sceneId, worldSnapshot: current });
        await saveVisualMemory({
          id: (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function" ? globalThis.crypto.randomUUID() : makeSceneId(username, Date.now())),
          username,
          imageUrl: url,
          createdAt: Date.now(),
          scene: { ...current, sceneId },
          camera: {
            mode: cameraModeFromKind(data.visualIntent?.camera || plan?.camera || data.kind || "selfie"),
          },
          source: "generated",
          parentId: data.parentId || previous?.id,
          sceneId,
          prompt: out.prompt || finalPrompt,
          worldSnapshot: current,
          sourcePath: found.sourcePath || undefined,
          tags: [data.kind, plan?.place, plan?.outfit].filter((v): v is string => Boolean(v)).slice(0, 20),
        });
        if (job) await updateGenerationJob(username, job.id, { status: "persisted", finalPrompt: out.prompt || finalPrompt, provider: "image-gateway" });
      }

      return { ok: true as const, url, prompt: out.prompt || finalPrompt || "", kind: data.kind, jobId: job?.id, sceneId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Imagine не собрал кадр.";
      const clean = /var\/task|EACCES|EROFS|ENOENT|permission/i.test(msg)
        ? "Не удалось сохранить кадр. Попробуй ещё раз."
        : msg;
      try {
        if (data.username && job) await updateGenerationJob(data.username, job.id, { status: "failed", error: clean, retryable: true });
      } catch {
        /* best effort */
      }
      return { ok: false as const, url: undefined, error: clean, prompt: "", kind: data.kind };
    }
  });

function cameraModeFromKind(raw: string): import("@/lib/visual/types").CameraMode {
  const value = raw.toLowerCase();
  if (value === "mirror") return "mirror";
  if (value === "side") return "side";
  if (value === "back") return "back";
  if (value === "full") return "full";
  if (value === "pov") return "pov";
  if (value === "candid") return "candid";
  if (value === "gallery") return "gallery";
  return "selfie";
}
