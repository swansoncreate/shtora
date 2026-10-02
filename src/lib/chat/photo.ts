import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

async function identityJpeg(data: {
  dropboxToken?: string;
  dropboxFolder?: string;
  dropboxSkip?: number;
  dropboxSeed?: string;
  instagramUrls?: string[];
  identityUrl?: string;
  sourceDataUrl?: string;
  noIdentity?: boolean;
}) {
  const skip = data.dropboxSkip ?? 0;
  const portrait = data.noIdentity
    ? { image: "", error: "" }
    : await firstInstagram([data.identityUrl, ...(data.instagramUrls ?? [])].filter(Boolean) as string[], 0);
  const reuse = trimDataImage(data.sourceDataUrl);
  if (reuse) return { image: reuse, identity: portrait.image || reuse, error: "" };
  if (data.dropboxToken && data.dropboxFolder) {
    try {
      const { latestDropboxImageDataUrl } = await import("@/lib/dropbox/dropbox.server");
      const dbx = await latestDropboxImageDataUrl(data.dropboxToken, data.dropboxFolder, skip, data.dropboxSeed);
      if (dbx) return { image: dbx, identity: portrait.image, error: "" };
      return {
        image: "",
        identity: portrait.image,
        error: "Нет фото с меткой shtora. В Dropbox отметь кадры для ленты и лички.",
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Dropbox не отдал кадр.";
      return { image: "", identity: portrait.image, error };
    }
  }
  const ig = await firstInstagram(data.instagramUrls, skip);
  if (ig.image) return { image: ig.image, identity: portrait.image || ig.image, error: "" };
  if (portrait.image) return { image: portrait.image, identity: portrait.image, error: "" };
  return { image: "", identity: "", error: ig.error || portrait.error || "Нет исходного кадра." };
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
    try {
      const found = await identityJpeg(data);
      if (!found.image) return { ok: false as const, url: undefined, error: found.error || "Нет кадра.", prompt: "", kind: data.kind };
      const out = await makePhoto(
        found.image,
        data.kind,
        data.userText || "",
        data.context || "",
        data.scene || "",
        data.world || "",
        data.noIdentity ? undefined : found.identity || undefined,
        data.prompt,
      );
      if (out.ok && out.url) {
        let url = out.url;
        if (data.kind === "feed") {
          const { persistRemoteImage } = await import("@/lib/imagine/persist.server");
          url = (await persistRemoteImage(out.url)) || out.url;
        }
        return { ok: true as const, url, prompt: out.prompt, kind: data.kind };
      }
      return { ok: out.ok, url: out.url, error: out.error, prompt: out.prompt, kind: data.kind };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Imagine не собрал кадр.";
      const clean = /var\/task|EACCES|EROFS|ENOENT|permission/i.test(msg)
        ? "Не удалось сохранить кадр. Попробуй ещё раз."
        : msg;
      return { ok: false as const, url: undefined, error: clean, prompt: "", kind: data.kind };
    }
  });
