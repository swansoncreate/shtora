import { useEffect, useState } from "react";
import { getCachedProfile, getCachedStories, liveStories, notifyCache, subscribeCache } from "./cache";
import { canonHighlightId } from "./normalize";
import type { IgProfile, IgStories } from "./types";

const SEEN_KEY = "shtora-seen-v1";

type SeenMap = Record<string, string[]>;

function readSeen(): SeenMap {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: SeenMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) out[key] = value.filter((id): id is string => typeof id === "string");
    }
    return out;
  } catch {
    return {};
  }
}

function writeSeen(map: SeenMap) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
  notifyCache();
}

export function collectContentIds(profile?: IgProfile | null, stories?: IgStories | null): string[] {
  const ids: string[] = [];
  for (const post of profile?.posts ?? []) {
    ids.push(`p:${post.id}`);
    if (post.shortCode) ids.push(`p:${post.shortCode}`);
  }
  for (const story of liveStories(stories?.stories)) ids.push(`s:${story.id}`);
  for (const hl of stories?.highlights ?? []) ids.push(`h:${canonHighlightId(hl.id)}`);
  return ids;
}

function altHighlightKeys(id: string): string[] {
  const raw = id.replace(/^h:/, "");
  const canon = canonHighlightId(raw);
  return [`h:${canon}`, `h:highlight:${canon}`, `h:${raw}`];
}

export function migrateHighlightSeen(username: string) {
  const clean = username.trim().toLowerCase();
  if (!clean) return;
  const map = readSeen();
  const seen = map[clean];
  if (!seen) return;
  const current = collectContentIds(getCachedProfile(clean)?.data, getCachedStories(clean)?.data);
  const hlNow = current.filter((id) => id.startsWith("h:") || id.startsWith("hi:"));
  if (!hlNow.length) return;
  const seenSet = new Set(seen);
  const overlap = hlNow.some((id) => {
    if (seenSet.has(id)) return true;
    if (id.startsWith("h:")) return altHighlightKeys(id).some((k) => seenSet.has(k));
    return false;
  });
  const hadHighlights = seen.some((id) => id.startsWith("h:") || id.startsWith("hi:"));
  const hadAccount = seen.some((id) => id.startsWith("p:") || id.startsWith("s:"));
  if (overlap) return;
  if (!hadHighlights && !hadAccount) return;
  map[clean] = [...seen, ...hlNow.filter((id) => !seenSet.has(id))];
  writeSeen(map);
}

export function ensureSeenBaseline(username: string) {
  const clean = username.trim().toLowerCase();
  if (!clean) return;
  const map = readSeen();
  if (map[clean]?.length) return;
  const ids = collectContentIds(getCachedProfile(clean)?.data, getCachedStories(clean)?.data);
  if (!ids.length) return;
  map[clean] = ids;
  writeSeen(map);
}

export function unseenCount(username: string): number {
  const clean = username.trim().toLowerCase();
  if (!clean) return 0;
  migrateHighlightSeen(clean);
  const current = collectContentIds(getCachedProfile(clean)?.data, getCachedStories(clean)?.data);
  const seen = readSeen()[clean];
  if (!seen?.length) return 0;
  const known = new Set(seen);
  for (const id of seen) {
    if (id.startsWith("h:")) {
      for (const k of altHighlightKeys(id)) known.add(k);
    }
  }
  let n = 0;
  const profile = getCachedProfile(clean)?.data;
  const stories = getCachedStories(clean)?.data;
  for (const post of profile?.posts ?? []) {
    if (known.has(`p:${post.id}`) || (post.shortCode && known.has(`p:${post.shortCode}`))) continue;
    n += 1;
  }
  for (const story of liveStories(stories?.stories)) {
    if (!known.has(`s:${story.id}`)) n += 1;
  }
  for (const hl of stories?.highlights ?? []) {
    const keys = altHighlightKeys(hl.id);
    if (!keys.some((k) => known.has(k)) && !known.has(`h:${canonHighlightId(hl.id)}`)) n += 1;
  }
  return n;
}

export function markAccountSeen(
  username: string,
  profile?: IgProfile | null,
  stories?: IgStories | null,
) {
  const clean = username.trim().toLowerCase();
  if (!clean) return;
  const ids = collectContentIds(
    profile ?? getCachedProfile(clean)?.data,
    stories ?? getCachedStories(clean)?.data,
  );
  const map = readSeen();
  const prev = map[clean];
  if (prev && prev.length === ids.length && prev.every((id, i) => id === ids[i])) return;
  map[clean] = ids;
  writeSeen(map);
}

export function markStoriesViewed(username: string, ids: string[]) {
  const clean = username.trim().toLowerCase();
  const nextIds = ids.map((id) => String(id || "").trim()).filter(Boolean);
  if (!clean || !nextIds.length) return;
  const map = readStorySeen();
  const keep = seenStoryIds(map[clean]);
  map[clean] = [...new Set([...keep, ...nextIds])].slice(-240);
  writeStorySeen(map);
}

export function storiesUnseen(username: string) {
  return unseenStoryCount(username) > 0;
}

export function unseenStoryCount(username: string, items?: { id: string }[]) {
  const live = items ?? liveStories(getCachedStories(username)?.data.stories);
  if (!live.length) return 0;
  const known = new Set(seenStoryIds(readStorySeen()[username.trim().toLowerCase()]));
  return live.filter((story) => story.id && !known.has(story.id)).length;
}

type StorySeenEntry = string[] | { day?: string; ids?: string[] };
type StorySeenMap = Record<string, StorySeenEntry>;
const STORY_SEEN_KEY = "shtora-story-seen-v1";

function seenStoryIds(entry: StorySeenEntry | undefined) {
  if (!entry) return [];
  if (Array.isArray(entry)) return entry.filter((id) => typeof id === "string" && id);
  return (entry.ids ?? []).filter((id) => typeof id === "string" && id);
}

function readStorySeen(): StorySeenMap {
  try {
    const raw = localStorage.getItem(STORY_SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StorySeenMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorySeen(map: StorySeenMap) {
  try {
    localStorage.setItem(STORY_SEEN_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
  notifyCache();
}

export function clearSeen() {
  try {
    localStorage.removeItem(SEEN_KEY);
    localStorage.removeItem(STORY_SEEN_KEY);
  } catch {
    /* ignore */
  }
  notifyCache();
}

export function useUnseenTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    return subscribeCache(() => setTick((n) => n + 1));
  }, []);
  return tick;
}
