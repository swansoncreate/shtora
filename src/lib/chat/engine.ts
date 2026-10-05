import { useEffect } from "react";
import { toast } from "sonner";
import { getCachedProfile, getCachedStories } from "@/lib/instagram/cache";
import { getMediaBlob } from "@/lib/instagram/media-cache";
import { characterCanon, chatBackstoryFor, folderForAccount, getShtoraSettings } from "@/lib/shtora-settings";
import { liveDropboxToken } from "@/lib/dropbox/token";
import {
  looksLikePhotoAsk,
  looksLikeRefuse,
  looksLikeGalleryAsk,
  looksLikeCircleAsk,
  looksLikeCameraAsk,
  chatReply,
  stripChatMeta,
  stripChatTic,
  storyFacts,
  sheOffersPhoto,
} from "./functions";
import { asBond, beatFromBond, scoreTurn, stageFrom } from "./bond";
import { turnPolicy } from "./policy";
import { dayNow, isHeatNight } from "./day";
import { runLiveTurn } from "@/lib/dm/turn";
import { marksFromTurn } from "./life";
import { decideChatMedia, sendChatMedia } from "./media";
import {
  appendMessage,
  applyBond,
  asWarmth,
  getThread,
  hydrateChats,
  listThreads,
  markThreadRead,
  patchThread,
  setMessageHeart,
  subscribeChats,
} from "./store";
import { advanceWorld, cameraKindFromText, clothesFromBlob, isAtWorkNow, rebuildWorld, sceneCard, specificClothes } from "./world";
import { rememberPlot } from "./plot";

const handled = new Set<string>();
const timers = new Map<string, number>();
const typing = new Set<string>();
const inflight = new Set<string>();
const typeListeners = new Set<() => void>();
const failedAt = new Map<string, number>();
let activeUser: string | null = null;
let catchingUp = false;

export function resetChatEngine(username?: string) {
  if (username) {
    const key = username.trim().toLowerCase();
    const t = timers.get(key);
    if (t) window.clearTimeout(t);
    timers.delete(key);
    typing.delete(key);
    const last = getThread(key)?.messages.at(-1);
    if (last) {
      handled.delete(last.id);
      failedAt.delete(last.id);
    }
    emitTyping();
    return;
  }
  for (const t of timers.values()) window.clearTimeout(t);
  timers.clear();
  typing.clear();
  handled.clear();
  emitTyping();
}

export function isChatTyping(username: string) {
  return typing.has(username.trim().toLowerCase());
}

export function subscribeTyping(fn: () => void) {
  typeListeners.add(fn);
  return () => {
    typeListeners.delete(fn);
  };
}

function emitTyping() {
  typeListeners.forEach((fn) => fn());
}

function setTyping(username: string, on: boolean) {
  const key = username.trim().toLowerCase();
  if (on) typing.add(key);
  else typing.delete(key);
  emitTyping();
}

function clock() {
  return new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Moscow",
  });
}

async function jpeg(url: string) {
  if (url.startsWith("data:image")) return url;
  try {
    const blob = await getMediaBlob(url);
    if (!blob?.size) return "";
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
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

async function deliverDm(
  username: string,
  out: {
    bubbles?: string[];
    photoKind: string;
    scene: string;
    mood?: string;
    memory?: string;
    place?: string;
    clothes?: string;
    hair?: string;
    placeRu?: string;
    clothesRu?: string;
    hairRu?: string;
    clothesNamed?: boolean;
    memAbout?: string;
    memOpen?: string;
    memDodged?: string;
    bondDelta?: { warmth?: number; trust?: number; heat?: number; irrit?: number; guilt?: number; spark?: number };
    log?: string;
    once?: boolean;
  },
  stamp: number | undefined,
  stillViewing: boolean,
) {
  const live = getThread(username);
  const world = {
    ...(live?.world || {}),
    place: out.place,
    clothes: out.clothes,
    hair: out.hair,
    placeRu: out.placeRu,
    clothesRu: out.clothesRu,
    hairRu: out.hairRu,
    clothesNamed: out.clothesNamed,
    memAbout: out.memAbout ?? live?.world?.memAbout,
    memOpen: out.memOpen ?? live?.world?.memOpen,
    memDodged: out.memDodged ?? live?.world?.memDodged,
  };
  await patchThread(username, { world, mood: out.mood, memory: out.memory || live?.memory });
  if (out.bondDelta) await applyBond(username, out.bondDelta);
  const bubbles = (out.bubbles || []).map((part) => stripChatTic(part)).filter(Boolean).slice(0, 3);
  const day = dayNow();
  const base = stamp || Date.now();
  let unreadOnce = !stillViewing;
  for (const [i, part] of bubbles.entries()) {
    await appendMessage(
      username,
      {
        role: "assistant",
        text: part,
        kind: "text",
        at: base + i * 1000,
        debug: {
          place: world.placeRu || world.place,
          clothes: world.clothesRu || world.clothes,
          hair: world.hairRu || world.hair,
          mood: out.mood,
          want: out.log,
        },
      },
      { incrementUnread: unreadOnce },
    );
    unreadOnce = false;
  }
  if (out.photoKind && out.photoKind !== "none") {
    setTyping(username, true);
    let dropboxToken: string | undefined;
    let dropboxFolder: string | undefined;
    try {
      const settings = getShtoraSettings();
      dropboxFolder = folderForAccount(username, settings);
      dropboxToken = await liveDropboxToken();
    } catch {
      dropboxToken = undefined;
    }
    const angle = out.photoKind === "back" || out.photoKind === "side" || out.photoKind === "full";
    const lastPic = [...(getThread(username)?.messages ?? [])].reverse().find((item) => item.role === "assistant" && item.imageUrl);
    const media = await sendChatMedia({
      ready: true,
      kind: out.photoKind === "circle" ? "selfie" : out.photoKind,
      circle: out.photoKind === "circle",
      gallery: out.photoKind === "gallery",
      reason: "dm",
      clothes: world.clothes,
      place: world.place,
      hair: world.hair,
      userText: "",
      dropboxToken,
      dropboxFolder,
      dropboxSeed: `${username}-${Date.now()}`,
      instagramUrls: identityUrls(username),
      lastPhotoUrl: angle ? lastPic?.imageUrl : undefined,
    });
    if (media.ok) {
      await appendMessage(
        username,
        {
          role: "assistant",
          text: "",
          imageUrl: media.url,
          kind: media.kind,
          once: out.once,
          debug: { imaginePrompt: media.prompt.slice(0, 900), imagineKind: media.kind, warmth: 0, trust: 0, heat: 0, irrit: 0 },
        },
        { incrementUnread: unreadOnce },
      );
    } else if (!media.skipped) toast.error(media.error);
  }
  if (stillViewing) await markThreadRead(username);
  else if (bubbles[0]) toast.message(`@${username}`, { description: bubbles[0].slice(0, 90) });
  void day;
}

async function reply(username: string, lastId: string, stamp?: number) {
  const live = getThread(username);
  const last = live?.messages.find((m) => m.id === lastId) || live?.messages.at(-1);
  if (!live || !last || last.role !== "user") return;
  if (handled.has(last.id) && !failedAt.has(last.id)) return;
  const failAgo = failedAt.get(last.id);
  if (failAgo && Date.now() - failAgo < 12_000) return;
  handled.add(last.id);
  failedAt.delete(last.id);
  const profile = getCachedProfile(username)?.data;
  setTyping(username, true);
  try {
    const { runOneTurn } = await import("./turn");
    const bond = asBond(live.bond, asWarmth(live.warmth));
    const turned = await runOneTurn({
      data: {
        username,
        text: (last.text || "").slice(0, 2000),
        canon: (characterCanon(username) || "").slice(0, 1200),
        bond: `тепло ${bond.warmth > 60 ? "есть" : "ещё нет"}, доверие ${bond.trust > 50 ? "есть" : "осторожно"}`.slice(0, 240),
        history: live.messages.slice(-16).map((item) => ({
          role: item.role === "assistant" ? "assistant" as const : "user" as const,
          text: stripChatMeta(item.text || "").slice(0, 2000),
        })),
      },
    });
    if (!turned.legacy) {
      if (turned.reply) {
        await appendMessage(username, { role: "assistant", text: turned.reply, kind: "text" }, { incrementUnread: activeUser !== username });
      }
      if (activeUser === username) await markThreadRead(username);
      return;
    }
    let userImageDataUrl: string | undefined;
    if (last.imageUrl) {
      try {
        userImageDataUrl = last.imageUrl.startsWith("data:image/jpeg")
          ? last.imageUrl
          : await jpeg(last.imageUrl);
      } catch {
        userImageDataUrl = undefined;
      }
    }
    const silentHours = Math.min(10000, Math.max(0, last.at ? (Date.now() - last.at) / 3_600_000 : 0));
    const history = live.messages.slice(-80).map((item) => ({
      role: item.role,
      text: stripChatMeta(item.text || "").slice(0, 2000),
      kind:
        item.kind === "text" ||
        item.kind === "photo" ||
        item.kind === "story" ||
        item.kind === "post" ||
        item.kind === "heart" ||
        item.kind === "action" ||
        item.kind === "circle"
          ? item.kind
          : undefined,
      at: item.at,
      heartByUser: Boolean(item.heartByUser),
      heartByHer: Boolean(item.heartByHer),
    }));
    const lastHerAt = [...(live.messages ?? [])].reverse().find((m) => m.role === "assistant")?.at;
    const day = dayNow();
    const nowWorld = rebuildWorld(live.messages, Date.now(), live.world);
    const factsGf = storyFacts(characterCanon(username)).girlfriend;
    const selfie =
      userImageDataUrl && userImageDataUrl.length >= 32 && userImageDataUrl.length <= 8_000_000
        ? userImageDataUrl
        : undefined;
    const out = await chatReply({
      data: {
        username,
        fullName: profile?.fullName || live.fullName,
        history,
        persona: (live.persona || "").slice(0, 1400) || undefined,
        mood: (live.mood || "").slice(0, 40) || undefined,
        memory: (live.memory || "").slice(0, 900) || undefined,
        backstory: (characterCanon(username) || "").slice(0, 4000) || undefined,
        warmth: asWarmth(live.warmth),
        trust: asBond(live.bond, asWarmth(live.warmth)).trust,
        heat: asBond(live.bond, asWarmth(live.warmth)).heat,
        irrit: asBond(live.bond, asWarmth(live.warmth)).irrit,
        guilt: asBond(live.bond, asWarmth(live.warmth)).guilt,
        spark: asBond(live.bond, asWarmth(live.warmth)).spark,
        userImageDataUrl: selfie,
        hour: clock(),
        silentHours,
        worldLine: sceneCard(nowWorld).slice(0, 420),
        world: nowWorld,
        arc: live.arc,
        chatApiKey: getShtoraSettings().chatApiKey || undefined,
        chatModel: getShtoraSettings().chatModel || undefined,
        chatEngine: getShtoraSettings().chatEngine,
        brainId: live.brainId,
      },
    });
    if (!out.ok) {
      handled.delete(last.id);
      failedAt.set(last.id, Date.now());
      toast.error(out.error);
      return;
    }
    if (out.dm) {
      await deliverDm(username, out, stamp, activeUser === username);
      return;
    }
    if (out.mood || out.memory || out.brainId) {
      await patchThread(username, { mood: out.mood, memory: out.memory || live.memory, brainId: out.brainId || live.brainId });
    }
    await patchThread(username, {
      memory: rememberPlot([...(live.messages ?? []), last], out.memory || live.memory || ""),
    });
    const marks = marksFromTurn(live.marks, last.text, chatBackstoryFor(username) || "");
    await patchThread(username, { marks, heldUntil: 0, heldMsgId: undefined, seenAt: Date.now() });
    if (out.arc) {
      const bondNow = asBond(getThread(username)?.bond, asWarmth(getThread(username)?.warmth));
      await patchThread(username, { arc: { ...out.arc, beat: beatFromBond(bondNow) } });
    }
    const world = advanceWorld({
      prev: nowWorld,
      herText: out.text || "",
      userText: last.text || "",
      model: { place: out.place, clothes: out.clothes, hair: out.hair },
      lastAt: lastHerAt,
      slot: day.slot,
      slotWorld: day.world,
      history: [...(live.messages ?? []), { role: "user" as const, text: last.text || "", at: last.at }, { role: "assistant" as const, text: out.text || "", at: Date.now() }],
    });
    await patchThread(username, { world });
    const scored = scoreTurn({
      userText: last.text,
      kind: last.kind,
      herText: out.text,
      girlfriend: factsGf,
    });
    if (out.warmthDelta) scored.warmth = (scored.warmth || 0) + out.warmthDelta * 2;
    await applyBond(username, scored);
    if (out.reactHeart) {
      const lastUser = [...(getThread(username)?.messages ?? [])].reverse().find((m) => m.role === "user");
      if (lastUser) await setMessageHeart(username, lastUser.id, "assistant", true);
    }
    const clean = stripChatMeta(out.text);
    const parts = (out.bubbles?.length ? out.bubbles : clean.split(/\n{2,}/))
      .map((p) => stripChatTic(stripChatMeta(p)))
      .filter(Boolean)
      .slice(0, 3);
    const namedClothes = Boolean(
      specificClothes(world.clothes) ||
        clothesFromBlob(
          (live.messages ?? [])
            .filter((m) => m.role === "assistant")
            .slice(-6)
            .map((m) => m.text || "")
            .join("\n"),
        ),
    );
    const recentAsk = (live.messages ?? [])
      .filter((m) => m.role === "user" && last.at - m.at < 45_000)
      .map((m) => m.text || "")
      .join(" ");
    const busy = isAtWorkNow(world.place);
    const bondLive = asBond(getThread(username)?.bond, asWarmth(getThread(username)?.warmth));
    const cameraAsk = looksLikeCameraAsk(last.text) || looksLikeCameraAsk(recentAsk);
    const cam = cameraKindFromText(last.text) || cameraKindFromText(recentAsk);
    const alreadySent = (live.messages ?? []).filter(
      (item) => item.role === "assistant" && (item.kind === "photo" || item.kind === "circle") && Date.now() - item.at < 8 * 60_000,
    ).length;
    const policy = turnPolicy({
      bond: bondLive,
      girlfriend: factsGf,
      text: `${last.text} ${recentAsk}`,
      namedClothes,
      busy,
      night: isHeatNight(),
      alreadySent: alreadySent > 0,
    });
    const forceLook = policy.force;
    let bubbles = parts.length ? parts : [clean || "ну"];
    bubbles = bubbles.map((p) => stripChatTic(p)).filter(Boolean);
    bubbles = bubbles.filter((p) => !/^\s*ты (отправил|скинул|кинул)/i.test(p));
    if (forceLook) {
      const kept = bubbles.filter(
        (p) => !looksLikeRefuse(p) && !/не,? не могу|сильно устала|иди уже|поздно уже|не хочу|не надо$/.test(p.toLowerCase()),
      );
      bubbles = kept.length ? kept : ["ну держи"];
    }
    if (!bubbles.length) bubbles = policy.photo === "none" ? ["не"] : ["ну"];
    const stillViewing = activeUser === username;
    const shown =
      last.kind === "action" || policy.tone === "ice" || policy.tone === "snap"
        ? bubbles.slice(0, 1)
        : bubbles.slice(0, policy.bubbles);
    let unreadOnce = !stillViewing;
    for (const [i, part] of shown.entries()) {
      const at = stamp ? stamp + i * 12_000 : Date.now();
      await appendMessage(
        username,
        { role: "assistant", text: part, kind: "text", at, debug: { place: world.place, clothes: world.clothes, hair: world.hair, mood: policy.tone, want: policy.reason } },
        { incrementUnread: unreadOnce },
      );
      unreadOnce = false;
      if (!stamp && i < shown.length - 1) await new Promise((r) => window.setTimeout(r, 350));
    }
    setTyping(username, false);
    const refused = !forceLook && (policy.photo === "none" || looksLikeRefuse(bubbles.join(" ")) || looksLikeRefuse(out.text || ""));
    const offered = forceLook || sheOffersPhoto(bubbles.join(" ")) || sheOffersPhoto(out.text || "");
    const burst = (getThread(username)?.messages ?? []).filter(
      (item) => item.role === "assistant" && (item.kind === "photo" || item.kind === "circle") && Date.now() - item.at < 8 * 60_000,
    ).length;
    const plan = decideChatMedia({
      refused,
      offered,
      askedPhoto: looksLikePhotoAsk(last.text) || looksLikePhotoAsk(recentAsk),
      askedCircle: looksLikeCircleAsk(last.text) || looksLikeCircleAsk(recentAsk),
      askedGallery: looksLikeGalleryAsk(last.text) || looksLikeGalleryAsk(recentAsk),
      action: last.kind === "action",
      busy,
      burst,
      bond: bondLive,
      girlfriend: factsGf,
      night: isHeatNight(),
      canPhoto: dayNow().canPhoto,
      modelKind: forceLook ? policy.photo : policy.photo === "none" ? "none" : cam && out.photoKind !== "none" ? cam : out.photoKind,
      force: forceLook,
    });
    if (plan.ready) {
      setTyping(username, true);
      const sentPhotos = (getThread(username)?.messages ?? []).filter(
        (item) => item.role === "assistant" && (item.kind === "photo" || item.kind === "circle"),
      ).length;
      let dropboxToken: string | undefined;
      let dropboxFolder: string | undefined;
      try {
        const settings = getShtoraSettings();
        dropboxFolder = folderForAccount(username, settings);
        dropboxToken = await liveDropboxToken();
      } catch {
        dropboxToken = undefined;
      }
      const here = getThread(username)?.world || world;
      const lastPic = [...(getThread(username)?.messages ?? [])]
        .reverse()
        .find((item) => item.role === "assistant" && item.imageUrl && (item.kind === "photo" || item.kind === "circle"));
      const media = await sendChatMedia({
        ...plan,
        clothes: here.clothes,
        place: here.place,
        hair: here.hair,
        userText: last.text,
        dropboxToken,
        dropboxFolder,
        dropboxSkip: cameraAsk && lastPic ? 0 : sentPhotos,
        dropboxSeed: `${username}-${Date.now()}-${sentPhotos}`,
        instagramUrls: identityUrls(username),
        lastPhotoUrl: cameraAsk ? lastPic?.imageUrl : undefined,
      });
      if (media.ok) {
        const lastOnce = getThread(username)?.onceSentAt || 0;
        const stage = stageFrom(bondLive, factsGf);
        const makeOnce =
          Date.now() - lastOnce > 8 * 3600_000 &&
          (stage === "secret" || stage === "fall") &&
          (plan.kind === "spicy" || Boolean(out.once) || (isHeatNight() && Math.random() < 0.55));
        await appendMessage(
          username,
          {
            role: "assistant",
            text: plan.gallery ? "вот это?" : "",
            imageUrl: media.url,
            kind: media.kind,
            once: media.kind === "photo" ? makeOnce || Boolean(out.once) : undefined,
            debug: { imaginePrompt: media.prompt.slice(0, 900), imagineKind: media.kind },
          },
          { incrementUnread: unreadOnce },
        );
        if (makeOnce) await patchThread(username, { onceSentAt: Date.now(), onceDeleteAsked: false });
        if (plan.kind === "spicy" || plan.kind === "pov") await applyBond(username, { heat: 3, spark: 2, guilt: factsGf ? 2 : 0 });
      } else if (!media.skipped && !refused) {
        toast.error(media.error);
      }
    }
    if (stillViewing) await markThreadRead(username);
    else toast.message(profile?.fullName || `@${username}`, { description: bubbles[0]?.slice(0, 90) });
  } catch (err) {
    handled.delete(last.id);
    failedAt.set(last.id, Date.now());
    toast.error(err instanceof Error ? err.message : "Чат не ответил");
  } finally {
    setTyping(username, false);
    catchUp(activeUser);
  }
}

function scheduleReply(username: string, messageId: string, alreadyAway = false) {
  const key = username.trim().toLowerCase();
  if (handled.has(messageId)) return;
  if (typing.has(key)) return;
  const prev = timers.get(key);
  if (prev) window.clearTimeout(prev);
  const viewing = activeUser === key;
  const thread = getThread(key);
  const last = thread?.messages.at(-1);
  const likeNudge = last?.kind === "heart" || (last?.kind === "post" && !(last.text || "").trim());
  if (likeNudge && !viewing && Math.random() < 0.18) {
    handled.add(messageId);
    void patchThread(key, { seenAt: Date.now() });
    if (Math.random() < 0.45 && last) void setMessageHeart(key, last.id, "assistant", true);
    window.setTimeout(() => {
      handled.delete(messageId);
      const still = getThread(key)?.messages.at(-1);
      if (still?.id === messageId && still.role === "user") scheduleReply(key, messageId, false);
    }, 40_000 + Math.random() * 50_000);
    return;
  }
  const wait = viewing ? Math.min(900, dayNow().replyMs(true)) : dayNow().replyMs(false);
  if (viewing && wait > 200) setTyping(key, true);
  const id = window.setTimeout(() => {
    timers.delete(key);
    inflight.add(messageId);
    handled.add(messageId);
    void runLiveTurn(key, messageId, activeUser === key)
      .then((ok) => {
        if (!ok) {
          handled.delete(messageId);
          failedAt.set(messageId, Date.now());
        }
      })
      .catch((err) => {
        handled.delete(messageId);
        failedAt.set(messageId, Date.now());
        toast.error(err instanceof Error ? err.message : "Чат не ответил");
      })
      .finally(() => {
        inflight.delete(messageId);
        setTyping(key, false);
      });
  }, wait);
  timers.set(key, id);
}

export function catchUpChats(viewing?: string | null) {
  catchUp(viewing ?? activeUser);
}

function waitingId(thread: { username: string; messages: { id: string; role: string }[] }) {
  const last = thread.messages.at(-1);
  if (!last || last.role !== "user") return "";
  if (typing.has(thread.username) || timers.has(thread.username) || inflight.has(last.id)) return "";
  const failAgo = failedAt.get(last.id);
  if (failAgo && Date.now() - failAgo < 12_000) return "";
  if (handled.has(last.id)) return "";
  return last.id;
}

function catchUp(viewing: string | null) {
  if (catchingUp) return;
  catchingUp = true;
  for (const thread of listThreads()) {
    const id = waitingId(thread);
    if (!id) continue;
    if (viewing === thread.username) scheduleReply(thread.username, id, false);
    else scheduleReply(thread.username, id, true);
  }
  catchingUp = false;
}

export function useChatEngine(enabled: boolean, viewing: string | null) {
  useEffect(() => {
    if (!enabled) return;
    activeUser = viewing ? viewing.trim().toLowerCase() : null;
    let cancelled = false;
    const unsub = subscribeChats(() => {
      if (cancelled) return;
      for (const thread of listThreads()) {
        const last = thread.messages.at(-1);
        if (!last || last.role !== "user") continue;
        if (typing.has(thread.username) || timers.has(thread.username) || inflight.has(last.id)) continue;
        const failAgo = failedAt.get(last.id);
        if (failAgo && Date.now() - failAgo < 12_000) continue;
        if (handled.has(last.id)) continue;
        scheduleReply(thread.username, last.id, activeUser !== thread.username);
      }
    });
    void hydrateChats()
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) catchUp(activeUser);
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [enabled, viewing]);
}
