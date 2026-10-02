import { toast } from "sonner";
import { getCachedProfile, getCachedStories } from "@/lib/instagram/cache";
import { getMediaBlob } from "@/lib/instagram/media-cache";
import { characterCanon, folderForAccount, getShtoraSettings } from "@/lib/shtora-settings";
import { liveDropboxToken } from "@/lib/dropbox/token";
import { chatReply, stripChatMeta } from "@/lib/chat/functions";
import { asBond } from "@/lib/chat/bond";
import { appendMessage, asWarmth, getThread, markThreadRead } from "@/lib/chat/store";
import { sendChatMedia } from "@/lib/chat/media";
import { commitBubbles, nextSeq } from "./commit";

export async function runLiveTurn(username: string, messageId: string, viewing: boolean, stamp?: number) {
  const live = getThread(username);
  const last = live?.messages.find((m) => m.id === messageId) || live?.messages.at(-1);
  if (!live || !last || last.role !== "user") return false;
  let userImageDataUrl: string | undefined;
  if (last.imageUrl) {
    try {
      userImageDataUrl = last.imageUrl.startsWith("data:image/jpeg") ? last.imageUrl : await jpeg(last.imageUrl);
    } catch {
      userImageDataUrl = undefined;
    }
  }
  const kinds = new Set(["text", "photo", "story", "post", "heart", "action", "circle"]);
  const history = live.messages.slice(-80).map((item) => ({
    role: item.role,
    text: stripChatMeta(item.text || "").slice(0, 2000),
    kind: item.kind && kinds.has(item.kind) ? item.kind : undefined,
    at: typeof item.at === "number" && Number.isFinite(item.at) ? item.at : undefined,
    heartByUser: Boolean(item.heartByUser),
    heartByHer: Boolean(item.heartByHer),
  }));
  const profile = getCachedProfile(username)?.data;
  const bond = asBond(live.bond, asWarmth(live.warmth));
  const engine = getShtoraSettings().chatEngine;
  const selfie = userImageDataUrl && userImageDataUrl.length >= 32 && userImageDataUrl.length <= 8_000_000 ? userImageDataUrl : undefined;
  let out;
  try {
    out = await chatReply({
      data: {
        username: username.slice(0, 40),
        fullName: (profile?.fullName || live.fullName || "").slice(0, 80) || undefined,
        history,
        persona: (live.persona || "").slice(0, 1400) || undefined,
        mood: (live.mood || "").slice(0, 40) || undefined,
        memory: (live.memory || "").slice(0, 900) || undefined,
        backstory: (characterCanon(username) || "").slice(0, 4000) || undefined,
        warmth: clamp100(bond.warmth),
        trust: clamp100(bond.trust),
        heat: clamp100(bond.heat),
        irrit: clamp100(bond.irrit),
        guilt: clamp100(bond.guilt),
        spark: clamp100(bond.spark),
        userImageDataUrl: selfie,
        hour: moscowClock(),
        silentHours: Math.min(10000, Math.max(0, last.at ? (Date.now() - last.at) / 3_600_000 : 0)),
        world: wireWorld(live.world),
        chatApiKey: getShtoraSettings().chatApiKey || undefined,
        chatModel: getShtoraSettings().chatModel || undefined,
        chatEngine: engine === "claude" || engine === "grok" ? engine : "grok",
        brainId: live.brainId,
      },
    });
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Чат не ответил");
    return false;
  }
  if (!out.ok) {
    toast.error(out.error);
    return false;
  }
  if (!out.dm || !out.log) {
    toast.error("Ответ не записался");
    return false;
  }
  const saved = await commitBubbles(username, out, viewing, stamp);
  if (out.photoKind && out.photoKind !== "none" && out.log) {
    void commitPhoto(
      username,
      out.photoKind,
      out.scene,
      out.clothes || saved.world?.clothes || "",
      out.place || saved.world?.place || "",
      out.hair || "",
      Boolean(out.once),
      out.log,
      viewing,
    ).catch((err) => {
      toast.error(err instanceof Error ? err.message : "Кадр не собрался");
    });
  }
  if (!viewing && saved.bubbles[0]) toast.message(`@${username}`, { description: saved.bubbles[0].slice(0, 90) });
  return true;
}

async function commitPhoto(
  username: string,
  photoKind: string,
  _scene: string,
  clothes: string,
  place: string,
  hair: string,
  once: boolean,
  log: string,
  viewing: boolean,
) {
  let dropboxToken: string | undefined;
  let dropboxFolder: string | undefined;
  try {
    dropboxFolder = folderForAccount(username, getShtoraSettings());
    dropboxToken = await liveDropboxToken();
  } catch {
    dropboxToken = undefined;
  }
  const angle = photoKind === "back" || photoKind === "side" || photoKind === "full";
  const lastPic = [...(getThread(username)?.messages ?? [])].reverse().find((item) => item.role === "assistant" && item.imageUrl);
  const media = await sendChatMedia({
    ready: true,
    kind: photoKind === "circle" ? "selfie" : photoKind,
    circle: photoKind === "circle",
    gallery: photoKind === "gallery",
    reason: "dm",
    clothes,
    place,
    hair,
    userText: "",
    dropboxToken,
    dropboxFolder,
    dropboxSeed: `${username}-${Date.now()}`,
    instagramUrls: identityUrls(username),
    lastPhotoUrl: angle ? lastPic?.imageUrl : undefined,
  });
  if (!media.ok) {
    if (!media.skipped) toast.error(media.error);
    return;
  }
  await appendMessage(
    username,
    {
      role: "assistant",
      text: "",
      imageUrl: media.url,
      kind: media.kind,
      once,
      seq: nextSeq(username),
      debug: { imaginePrompt: media.prompt.slice(0, 900), imagineKind: media.kind, want: log },
    },
    { incrementUnread: !viewing },
  );
  if (viewing) await markThreadRead(username);
}

function clamp100(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function cut(v: unknown, max: number) {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s ? s.slice(0, max) : undefined;
}

function wireWorld(world: { place?: string; clothes?: string; hair?: string; placeRu?: string; clothesRu?: string; hairRu?: string; clothesNamed?: boolean; memAbout?: string; memOpen?: string; memDodged?: string } | null | undefined) {
  if (!world || typeof world !== "object") return undefined;
  return {
    place: cut(world.place, 160),
    clothes: cut(world.clothes, 160),
    hair: cut(world.hair, 160),
    placeRu: cut(world.placeRu, 160),
    clothesRu: cut(world.clothesRu, 160),
    hairRu: cut(world.hairRu, 160),
    clothesNamed: Boolean(world.clothesNamed),
    memAbout: cut(world.memAbout, 160),
    memOpen: cut(world.memOpen, 160),
    memDodged: cut(world.memDodged, 140),
  };
}

function moscowClock() {
  return new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Moscow",
  });
}

function identityUrls(username: string) {
  const profile = getCachedProfile(username)?.data;
  const stories = getCachedStories(username)?.data;
  const ig: string[] = [];
  if (profile?.profilePicUrl) ig.push(profile.profilePicUrl);
  for (const p of profile?.posts ?? []) if (p.displayUrl) ig.push(p.displayUrl);
  for (const s of stories?.stories ?? []) if (s.imageUrl) ig.push(s.imageUrl);
  return ig.slice(0, 12);
}

async function jpeg(url: string) {
  const blob = url.startsWith("blob:") ? await fetch(url).then((r) => r.blob()) : await getMediaBlob(url);
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext("2d")?.drawImage(bmp, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.85);
}
