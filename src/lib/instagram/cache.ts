import type { IgProfile, IgStories, IgStoryItem } from "./types";
import { igCache, unionProfile, unionStories, type Cached } from "./store";

export type { Cached };
export { igCache, unionProfile, unionStories };
export { InstagramCache } from "./store";

export function notifyCache() {
  igCache.notify();
}

export function subscribeCache(fn: () => void) {
  return igCache.subscribe(fn);
}

export function evictOldestIgCache(count = 2) {
  igCache.evict(count);
}

export function isSameLocalDay(ts: number, now = Date.now()) {
  const a = new Date(ts);
  const b = new Date(now);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function staleTimeUntilTomorrow(cachedAt: number) {
  const d = new Date(cachedAt);
  d.setHours(24, 0, 0, 0);
  return Math.max(0, d.getTime() - cachedAt);
}

export function getCachedProfile(username: string) {
  return igCache.profile(username);
}

export function listCachedProfiles() {
  return igCache.listProfiles();
}

export function getCachedStories(username: string) {
  return igCache.stories(username);
}

export function setCachedProfile(username: string, data: IgProfile, at = Date.now()) {
  igCache.writeProfile(username, data, at);
}

export function setCachedStories(username: string, data: IgStories, at = Date.now()) {
  igCache.writeStories(username, data, at);
}

export function isStoryLive(story: IgStoryItem, now = Date.now()) {
  return igCache.isStoryLive(story, now);
}

export function liveStories(items: IgStoryItem[] | undefined, now = Date.now()) {
  return igCache.liveStories(items, now);
}

export function profileCacheFresh(username: string) {
  const hit = igCache.profile(username);
  if (!hit) return false;
  return igCache.freshEnough(username) && hit.data.posts.length > 0;
}

export function storiesCacheFresh(username: string) {
  return igCache.freshEnough(username);
}

export function richerStories(a?: IgStories | null, b?: IgStories | null): IgStories | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  const as = liveStories(a.stories).length;
  const bs = liveStories(b.stories).length;
  if (bs !== as) return bs > as ? b : a;
  const ah = a.highlights?.length ?? 0;
  const bh = b.highlights?.length ?? 0;
  if (bh !== ah) return bh > ah ? b : a;
  return b;
}

export const mergeProfile = unionProfile;
export const mergeStories = unionStories;

export function clearIgCache() {
  igCache.clear();
}
