import { asBond, beatFromBond } from "@/lib/chat/bond";
import { composeChatPhoto } from "@/lib/chat/photo";
import { asWarmth, getThread, hydrateChats } from "@/lib/chat/store";
import { moscowHour } from "@/lib/chat/world";
import { liveDropboxToken } from "@/lib/dropbox/token";
import { getCachedProfile, listCachedProfiles } from "@/lib/instagram/cache";
import { DEFAULT_VARIATION_PROMPT } from "@/lib/imagine/prompt";
import { folderForAccount, getShtoraSettings } from "@/lib/shtora-settings";
import { seedPostCrowd } from "./comments";
import { generatedLine } from "./simulate";
import type { FeedCard } from "./simulate";

const KEY = "shtora-feed-v7";
const LEGACY_KEY = "shtora-daily-feed-v6";
const MAX_POSTS = 160;

export type FeedSlot = "morning" | "evening";

export type DailyPost = {
  id: string;
  username: string;
  imageUrl: string;
  caption: string;
  at: number;
  liked?: boolean;
  kind?: "post" | "story";
  slot?: FeedSlot;
};

type DailyState = { date: string; posts: DailyPost[]; quiet?: Record<string, boolean> };

export function todayKey() {
  const hour = moscowHour();
  const key = moscowDay();
  if (hour >= 5) return key;
  const [y, m, d] = key.split("-").map(Number);
  const prev = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
  prev.setUTCDate(prev.getUTCDate() - 1);
  const mm = String(prev.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(prev.getUTCDate()).padStart(2, "0");
  return `${prev.getUTCFullYear()}-${mm}-${dd}`;
}

function moscowDay(at = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
}

export function dueSlots(hour = moscowHour()): FeedSlot[] {
  if (hour < 5) return ["morning", "evening"];
  if (hour < 17) return ["morning"];
  return ["morning", "evening"];
}

const STALE_CAPTIONS = new Set([
  "дома, ничего не снимала — просто так вышло",
  "сегодня тихо",
  "не спрашивай чем занята",
  "кофе и плед. всё.",
  "не ретушь, просто свет такой",
  "вышла на минуту",
  "это не для ленты, но пусть будет",
  "настроение странное и мне ок",
  "молчу, но вот",
  "вечером лучше",
  "сняла и забыла",
  "без подписи тоже можно",
  "ещё одно лето в телефоне",
  "не пиши «где это»",
  "просто кадр",
  "держу это здесь",
  "никуда не вышла",
  "ещё дома",
  "между сменами",
  "кофе и всё",
  "не для ленты",
  "без фильтра, как есть",
  "сегодня так",
  "не объясняю",
  "просто оставлю тут",
]);

function settleCaption(post: DailyPost): DailyPost {
  if (post.caption && !STALE_CAPTIONS.has(post.caption)) return post;
  return { ...post, caption: generatedLine(post.username, post.id, undefined, post.slot) };
}

export function loadDaily(): DailyState {
  const today = todayKey();
  const parsed = readFeed(KEY) || readFeed(LEGACY_KEY);
  const rawPosts = (parsed?.posts ?? []).filter((p) => p && p.imageUrl && p.kind !== "story");
  const posts = rawPosts.map(settleCaption);
  const rolled = !parsed || parsed.date !== today;
  const captionsChanged = rawPosts.some((p, i) => p.caption !== posts[i]?.caption);
  const state: DailyState = {
    date: today,
    posts: posts.sort((a, b) => b.at - a.at).slice(0, MAX_POSTS),
    quiet: rolled ? {} : parsed?.quiet && typeof parsed.quiet === "object" ? parsed.quiet : {},
  };
  if (!readFeed(KEY) || rolled || captionsChanged) saveDaily(state);
  return state;
}

function readFeed(key: string): DailyState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyState;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.posts)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDaily(state: DailyState) {
  try {
    const posts = [...(state.posts || [])]
      .filter((p) => p && p.imageUrl && p.kind !== "story")
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_POSTS);
    localStorage.setItem(
      KEY,
      JSON.stringify({ date: state.date || todayKey(), posts, quiet: state.quiet || {} }),
    );
  } catch {
    /* ignore */
  }
}

export function visibleGenerated(posts: DailyPost[]) {
  const due = new Set(dueSlots());
  const today = todayKey();
  return posts.filter((p) => {
    if (p.kind === "story") return false;
    if (!p.slot) return true;
    if (moscowDay(p.at) !== today) return true;
    return due.has(p.slot);
  });
}

export function dailyToCards(posts: DailyPost[]): FeedCard[] {
  return visibleGenerated(posts)
    .sort((a, b) => b.at - a.at)
    .map((post) => {
    const profile = getCachedProfile(post.username)?.data;
    return {
      id: post.id,
      username: post.username,
      fullName: profile?.fullName || post.username,
      avatar: profile?.profilePicUrl,
      verified: Boolean(profile?.verified),
      caption: post.caption,
      at: post.at,
      thumb: post.imageUrl,
      liked: post.liked,
      generated: true,
      story: post.kind === "story",
    };
  });
}

export function toggleDailyLike(id: string) {
  const state = loadDaily();
  state.posts = state.posts.map((post) => (post.id === id ? { ...post, liked: !post.liked } : post));
  saveDaily(state);
  return state.posts.find((post) => post.id === id)?.liked ?? false;
}

function pickUsernames(prefer: string[]) {
  const names = [...new Set(prefer.map((n) => n.toLowerCase()).filter(Boolean))];
  if (names.length) return names;
  const cached = listCachedProfiles().map((p) => p.username.toLowerCase());
  return [...new Set(cached)].filter(Boolean).slice(0, 8);
}

function hash(s: string) {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return n;
}

function isQuiet(username: string, state: DailyState) {
  if (!state.posts.length) return false;
  const quiet = state.quiet ?? {};
  if (username in quiet) return Boolean(quiet[username]);
  const thread = getThread(username);
  const beat = beatFromBond(asBond(thread?.bond, asWarmth(thread?.warmth)));
  const roll = hash(`${todayKey()}:${username}`) % 10;
  const skip = beat === "pull" ? roll >= 6 : false;
  quiet[username] = skip;
  state.quiet = quiet;
  saveDaily(state);
  return skip;
}

function feedPrompt(base: string) {
  const text = (base || DEFAULT_VARIATION_PROMPT).replace(/\s+/g, " ").trim() || DEFAULT_VARIATION_PROMPT;
  return text.slice(0, 1200);
}

function stampFor(slot: FeedSlot) {
  const d = new Date();
  if (slot === "morning") d.setHours(9, 8 + (hash(String(d.getDate())) % 40), 0, 0);
  else d.setHours(18, 12 + (hash(String(d.getDate() + 3)) % 50), 0, 0);
  const t = d.getTime();
  return t > Date.now() ? Date.now() - 60_000 : t;
}

export function needsToday(state: DailyState, favorites: string[]) {
  const due = dueSlots();
  const today = todayKey();
  const quiet = state.quiet ?? {};
  for (const name of favorites.map((n) => n.toLowerCase()).filter(Boolean)) {
    if (quiet[name]) continue;
    for (const slot of due) {
      const has = state.posts.some(
        (p) => p.username.toLowerCase() === name && moscowDay(p.at) === today && (p.slot || "morning") === slot,
      );
      if (!has) return true;
    }
  }
  return false;
}

export function isSameFeedDay(at: number) {
  return moscowDay(at || 0) === todayKey();
}

export async function generateNextDaily(prefer: string[]): Promise<DailyPost | null> {
  await hydrateChats().catch(() => undefined);
  const state = loadDaily();
  const names = pickUsernames(prefer);
  const due = dueSlots();
  if (!names.length || !due.length) return null;
  for (const username of names) {
    if (isQuiet(username, state)) continue;
    for (const slot of due) {
      if (
        state.posts.some(
          (p) =>
            p.username.toLowerCase() === username &&
            moscowDay(p.at) === todayKey() &&
            (p.slot || "morning") === slot,
        )
      ) {
        continue;
      }
      try {
        const post = await generateFor(username, slot, prefer);
        if (post) return post;
      } catch {
        /* next account */
      }
    }
  }
  return null;
}

async function generateFor(
  username: string,
  slot: FeedSlot,
  favorites: string[],
  extra = false,
): Promise<DailyPost | null> {
  const settings = getShtoraSettings();
  let dropboxToken: string | undefined;
  try {
    dropboxToken = await liveDropboxToken();
  } catch {
    dropboxToken = undefined;
  }
  const folder = folderForAccount(username, settings);
  const ownFolder = /\/общее$/i.test(folder) ? undefined : folder;
  const pic = await composeChatPhoto({
    data: {
      kind: "feed",
      prompt: feedPrompt(settings.imaginePrompt),
      noIdentity: true,
      dropboxToken: ownFolder ? dropboxToken : undefined,
      dropboxFolder: ownFolder,
      dropboxSeed: `${username}-${slot}-${Date.now()}`,
    },
  });
  if (!pic.ok || !pic.url) return null;
  const id = extra ? `gen-post-${username}-${Date.now()}` : `gen-post-${username}-${slot}-${todayKey()}`;
  const post: DailyPost = {
    id,
    username,
    imageUrl: pic.url,
    caption: generatedLine(username, id, undefined, slot),
    at: extra ? Date.now() : stampFor(slot),
    kind: "post",
    slot: extra ? undefined : slot,
  };
  seedPostCrowd(post.id, username, favorites);
  return post;
}

export async function generateExtraPost(username: string, favorites: string[]): Promise<DailyPost | null> {
  const hour = moscowHour();
  const slot: FeedSlot = hour < 17 ? "morning" : "evening";
  return generateFor(username, slot, favorites, true);
}
