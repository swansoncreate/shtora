import { toast } from "sonner";
import { getCachedProfile, getCachedStories } from "@/lib/instagram/cache";
import { persistChatImage } from "@/lib/instagram/media-cache";
import { characterCanon, folderForAccount, getShtoraSettings } from "@/lib/shtora-settings";
import { liveDropboxToken } from "@/lib/dropbox/token";
import { composeChatPhoto } from "./photo";
import { chatPing, stripChatMeta, storyFacts, sheOffersPhoto } from "./functions";
import { appendMessage, applyBond, getThread, listThreads, patchThread } from "./store";
import { dayNow } from "./day";
import { noteMark, takeJealousDue, takePublicDmDue } from "./life";
import { asBond, stageFrom } from "./bond";
import { sendChatMedia } from "./media";
import { advanceWorld, looksLikeWorkStatus, rebuildWorld, sceneCard, worldPrompt } from "./world";

const STORY_PING_KEY = "shtora-story-pings-v1";
let sessionPings = 0;

function readStoryPings(): { username: string; at: number }[] {
  try {
    const raw = localStorage.getItem(STORY_PING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { username: string; at: number }[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoryPings(rows: { username: string; at: number }[]) {
  try {
    localStorage.setItem(STORY_PING_KEY, JSON.stringify(rows.slice(-20)));
  } catch {
    /* ignore */
  }
}

export function queueStoryWatchPing(username: string) {
  const name = username.trim().toLowerCase();
  const thread = getThread(name);
  if (!thread || thread.messages.length === 0) return;
  const last = thread.messages.at(-1);
  if (last?.role === "user") return;
  if (last?.kind === "story" && Date.now() - last.at < 2 * 60 * 60 * 1000) return;
  if (Math.random() > 0.42) return;
  const rows = readStoryPings().filter((r) => r.username !== name);
  rows.push({ username: name, at: Date.now() + 40_000 + Math.random() * 5 * 60_000 });
  writeStoryPings(rows);
}

async function flushStoryPings(viewing: string | null) {
  const due = readStoryPings();
  const rest: { username: string; at: number }[] = [];
  for (const row of due) {
    if (row.at > Date.now()) {
      rest.push(row);
      continue;
    }
    const thread = getThread(row.username);
    if (!thread || thread.messages.at(-1)?.role === "user") continue;
    await patchThread(row.username, {
      memory: `${thread.memory || ""}. он смотрел сторис и ничего не написал`.replace(/\s+/g, " ").slice(-900),
    });
    await maybePing(row.username, viewing === row.username);
  }
  writeStoryPings(rest);
}

export function resetPings() {
  sessionPings = 0;
}

function recapOf(username: string) {
  const thread = getThread(username);
  return (thread?.messages ?? [])
    .slice(-10)
    .map((item) => `${item.role === "user" ? "он" : "она"}: ${stripChatMeta(item.text || "").slice(0, 120)}`)
    .join("\n")
    .slice(0, 2500);
}

function lastTouchedName() {
  const ranked = listThreads()
    .map((t) => ({
      name: t.username,
      at: [...t.messages].reverse().find((m) => m.role === "user")?.at || 0,
    }))
    .filter((r) => r.at)
    .sort((a, b) => b.at - a.at);
  return ranked[0]?.name || "";
}

function pingHour() {
  return new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Moscow",
  });
}

function pingGap() {
  const slot = dayNow().slot;
  if (slot === "sleep") return 8 * 3600_000;
  if (slot === "work") return 2 * 3600_000;
  if (slot === "weekend") return 35 * 60_000;
  if (slot === "morning") return 55 * 60_000;
  if (slot === "evening") return 28 * 60_000;
  return 70 * 60_000;
}

async function maybePing(username: string, viewing: boolean, stamp?: number) {
  if (sessionPings >= 3) return false;
  if (!dayNow().canPing) return false;
  const thread = getThread(username);
  if (!thread || thread.messages.length === 0) return false;
  const last = thread.messages.at(-1);
  if (last?.role === "user") return false;
  const recent = [...(thread.messages ?? [])].reverse();
  let herStreak = 0;
  for (const m of recent) {
    if (m.role === "assistant") herStreak += 1;
    else break;
  }
  if (herStreak >= 3) return false;
  if (herStreak >= 2 && last && Date.now() - last.at < 25 * 60_000) return false;
  if (last && sheOffersPhoto(last.text || "") && Date.now() - last.at > 45_000) {
    try {
      const settings = getShtoraSettings();
      const profile = getCachedProfile(username)?.data;
      const ig: string[] = [];
      if (profile?.profilePicUrl) ig.push(profile.profilePicUrl);
      for (const p of profile?.posts ?? []) if (p.displayUrl) ig.push(p.displayUrl);
      const pic = await composeChatPhoto({
        data: {
          kind: "selfie",
          scene: "she finally sends the photo she promised a minute ago",
          world: worldPrompt(thread.world),
          dropboxToken: await liveDropboxToken().catch(() => undefined),
          dropboxFolder: folderForAccount(username, settings),
          instagramUrls: ig.slice(0, 12),
        },
      });
      if (pic.ok && pic.url) {
        const imageUrl = await persistChatImage(pic.url);
        await appendMessage(username, { role: "assistant", text: "", kind: "photo", imageUrl, at: stamp }, { incrementUnread: !viewing });
        sessionPings += 1;
        await patchThread(username, { lastPingAt: Date.now() });
        return true;
      }
    } catch {
      /* fall through to text ping */
    }
  }
  const lastTouched = lastTouchedName();
  const active = lastTouched === username;
  if (!active && Math.random() > 0.22) return false;
  const gap = pingGap() * (active ? 0.4 : 1.8);
  if (Date.now() - (thread.lastPingAt || 0) < gap * 0.7) return false;
  if (last && Date.now() - last.at < (active ? 8 * 60_000 : 25 * 60_000)) return false;
  if (/закрыть|не отвлек|удач/i.test(thread.arc?.want || "") && Date.now() - (last?.at || 0) < 3 * 3600_000) return false;
  const tail = thread.messages.slice(-5).map((m) => (m.text || "").toLowerCase()).join(" ");
  if (/споки|спокойной ночи|спи уже|я сплю|почти сплю/.test(tail) && dayNow().slot !== "morning") return false;
  if (/хватит|не надо уже|не проси/.test(tail) && Date.now() - (last?.at || 0) < 2 * 3600_000) return false;
  const gf = storyFacts(characterCanon(username)).girlfriend;
  const stage = stageFrom(asBond(thread.bond, thread.warmth), gf);
  if (stage === "ice" || stage === "snap") return false;
  if (stage === "test" && Math.random() < 0.55) return false;
  if (dayNow().slot === "work" && Math.random() < 0.3) return false;
  const profile = getCachedProfile(username)?.data;
  const persona = thread.persona || "коротко, как в инсте";
  const mood = thread.mood || "скучает";
  const hour = pingHour();
  const recap = recapOf(username);
  const bond = thread.bond;
  const day = dayNow();
  const lastHerAt = [...(thread.messages ?? [])].reverse().find((m) => m.role === "assistant")?.at;
  const nowWorld = rebuildWorld(thread.messages, Date.now(), thread.world);
  const history = (thread.messages ?? []).slice(-40).map((item) => ({
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
  }));
  const out = await chatPing({
    data: {
      username,
      fullName: profile?.fullName || thread.fullName,
      persona,
      mood,
      memory: thread.memory,
      backstory: characterCanon(username),
      hour,
      lastSnippet: recap || last?.text?.slice(0, 400),
      silentHours: last ? Math.max(0, (Date.now() - last.at) / 3_600_000) : 0,
      worldLine: sceneCard(nowWorld).slice(0, 700),
      world: nowWorld,
      history,
      warmth: thread.warmth,
      trust: bond?.trust,
      heat: bond?.heat,
      irrit: bond?.irrit,
      guilt: bond?.guilt,
      spark: bond?.spark,
      arc: thread.arc,
      chatApiKey: getShtoraSettings().chatApiKey || undefined,
      chatModel: getShtoraSettings().chatModel || undefined,
      chatEngine: getShtoraSettings().chatEngine,
      brainId: thread.brainId,
    },
  });
  if (!out.ok) return false;
  if (out.dm) {
    if (out.skipped || (!out.bubbles?.length && (!out.photoKind || out.photoKind === "none"))) return false;
    const world = {
      ...(thread.world || {}),
      place: out.place,
      clothes: out.clothes,
      hair: out.hair,
      placeRu: out.placeRu,
      clothesRu: out.clothesRu,
      hairRu: out.hairRu,
      clothesNamed: out.clothesNamed,
      memAbout: out.memAbout ?? thread.world?.memAbout,
      memOpen: out.memOpen ?? thread.world?.memOpen,
      memDodged: out.memDodged ?? thread.world?.memDodged,
    };
    await patchThread(username, { world, mood: out.mood || thread.mood, memory: out.memory || thread.memory, lastPingAt: Date.now() });
    if (out.bondDelta) await applyBond(username, out.bondDelta);
    const bubbles = (out.bubbles || []).map((part) => part.trim()).filter(Boolean).slice(0, 3);
    let unreadOnce = !viewing;
    for (const [i, part] of bubbles.entries()) {
      await appendMessage(
        username,
        { role: "assistant", text: part, kind: "text", at: stamp ? stamp + i * 15_000 : undefined },
        { incrementUnread: unreadOnce },
      );
      unreadOnce = false;
    }
    if (out.photoKind && out.photoKind !== "none") {
      try {
        const settings = getShtoraSettings();
        const media = await sendChatMedia({
          ready: true,
          kind: out.photoKind === "circle" ? "selfie" : out.photoKind,
          circle: out.photoKind === "circle",
          gallery: out.photoKind === "gallery",
          reason: "dm-ping",
          clothes: world.clothes,
          place: world.place,
          hair: world.hair,
          dropboxToken: await liveDropboxToken().catch(() => undefined),
          dropboxFolder: folderForAccount(username, settings),
          dropboxSeed: `${username}-ping-${Date.now()}`,
          instagramUrls: [],
        });
        if (media.ok) {
          await appendMessage(
            username,
            { role: "assistant", text: "", imageUrl: media.url, kind: media.kind, at: stamp },
            { incrementUnread: unreadOnce },
          );
        }
      } catch {
        /* text already sent */
      }
    }
    if (!viewing && bubbles[0]) toast.message(profile?.fullName || `@${username}`, { description: bubbles[0].slice(0, 90) });
    sessionPings += 1;
    return true;
  }
  const clean = stripChatMeta(out.text);
  const lastHer = (thread.messages ?? [])
    .filter((m) => m.role === "assistant")
    .slice(-2)
    .map((m) => (m.text || "").toLowerCase().replace(/\s+/g, " ").trim());
  if (lastHer.some((t) => t && clean.toLowerCase().replace(/\s+/g, " ").includes(t.slice(0, 18)))) return false;
  if (looksLikeWorkStatus(clean) && !/work|office/.test((nowWorld.place || "").toLowerCase())) return false;
  const world = advanceWorld({
    prev: nowWorld,
    herText: clean,
    model: { place: out.place, clothes: out.clothes, hair: out.hair },
    lastAt: lastHerAt,
    slot: day.slot,
    slotWorld: day.world,
    history: [...(thread.messages ?? []), { role: "assistant" as const, text: clean, at: Date.now() }],
  });
  const patch: { mood?: string; memory?: string; lastPingAt: number; arc?: typeof thread.arc; world?: typeof thread.world; brainId?: string } = {
    lastPingAt: Date.now(),
    world,
    brainId: out.brainId || thread.brainId,
  };
  if (out.mood) patch.mood = out.mood;
  if (out.memory) patch.memory = out.memory;
  if (out.arc) patch.arc = out.arc;
  await patchThread(username, patch);
  const parts = (out.bubbles?.length ? out.bubbles : clean.split(/\n{2,}/)).map((p) => p.trim()).filter(Boolean).slice(0, 2);
  let imageUrl = out.imageUrl ? await persistChatImage(out.imageUrl) : undefined;
  let once = Boolean(out.once);
  const kind = out.ok ? out.photoKind : undefined;
  if (!imageUrl && sheOffersPhoto(clean) && kind && kind !== "none" && sessionPings < 3) {
    try {
      const settings = getShtoraSettings();
      const profile = getCachedProfile(username)?.data;
      const stories = getCachedStories(username)?.data;
      const ig: string[] = [];
      if (profile?.profilePicUrl) ig.push(profile.profilePicUrl);
      for (const p of profile?.posts ?? []) if (p.displayUrl) ig.push(p.displayUrl);
      for (const s of stories?.stories ?? []) if (s.imageUrl) ig.push(s.imageUrl);
      const pic = await composeChatPhoto({
        data: {
          kind,
          scene: out.scene || "",
          world: worldPrompt(world),
          dropboxToken: await liveDropboxToken().catch(() => undefined),
          dropboxFolder: folderForAccount(username, settings),
          instagramUrls: ig.slice(0, 12),
        },
      });
      if (pic.ok && pic.url) {
        imageUrl = await persistChatImage(pic.url);
        if (kind === "spicy") once = true;
      }
    } catch {
      /* text still goes */
    }
  }
  const bubbles = parts.length ? parts : clean ? [clean] : imageUrl ? [""] : [];
  let unreadOnce = !viewing;
  for (const [i, part] of bubbles.entries()) {
    await appendMessage(
      username,
      {
        role: "assistant",
        text: part,
        imageUrl: i === bubbles.length - 1 ? imageUrl : undefined,
        kind: imageUrl && i === bubbles.length - 1 ? "photo" : "text",
        once: imageUrl && i === bubbles.length - 1 ? once : undefined,
        at: stamp ? stamp + i * 15_000 : undefined,
      },
      { incrementUnread: unreadOnce },
    );
    unreadOnce = false;
  }
  if (!viewing) {
    toast.message(profile?.fullName || `@${username}`, { description: bubbles[0]?.slice(0, 90) });
  }
  sessionPings += 1;
  return true;
}

async function flushLife(viewing: string | null) {
  for (const row of takeJealousDue()) {
    const thread = getThread(row.username);
    if (!thread || thread.messages.length === 0) continue;
    if (thread.messages.at(-1)?.role === "user") continue;
    await patchThread(row.username, {
      marks: noteMark(thread.marks, "wound", "лайкнул чужой пост"),
    });
    await maybePing(row.username, viewing === row.username);
  }
  for (const row of takePublicDmDue()) {
    const thread = getThread(row.username);
    if (!thread) continue;
    await appendMessage(
      row.username,
      { role: "assistant", text: "ты чего при всех", kind: "text" },
      { incrementUnread: viewing !== row.username },
    );
  }
}

export async function pingOne(username: string, viewing: boolean, stamp?: number) {
  return maybePing(username, viewing, stamp);
}

export function useChatPings(_usernames: string[], _enabled: boolean, _viewing: string | null) {
  return;
}
