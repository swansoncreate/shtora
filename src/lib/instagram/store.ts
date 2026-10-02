import type { IgHighlight, IgPost, IgPostSlide, IgProfile, IgStories, IgStoryItem } from "./types";
import { canonHighlightId, dedupeHighlights, isJunkHighlight } from "./normalize";

const PROFILE_PREFIX = "shtora-ig-profile:";
const STORIES_PREFIX = "shtora-ig-stories:";
const CACHE_EVENT = "shtora-cache";
const PROTECTED = new Set([
  "shtora-settings",
  "shtora-dropbox-token",
  "shtora-apify-token",
  "shtora-hiker-token",
  "shtora-saved-v1",
  "shtora-seen-v1",
]);

export type Cached<T> = { at: number; data: T };

export type CacheSyncResult = {
  profile: IgProfile | null;
  stories: IgStories | null;
  added: number;
  fromCache: boolean;
  error?: string;
};

const FRESH_MS = 20 * 60 * 60 * 1000;

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CACHE_EVENT));
}

function postKey(post: IgPost) {
  return String(post.id || post.shortCode || post.displayUrl || "");
}

function storyKey(item: IgStoryItem) {
  return String(item.id || item.imageUrl || item.videoUrl || "");
}

function reuseUrl(fresh?: string, cached?: string) {
  const local = (u?: string) => Boolean(u && (u.startsWith("/api/media") || u.startsWith("/chat-media") || u.startsWith("/api/chat-media")));
  if (local(cached) && !local(fresh)) return cached;
  return fresh || cached;
}

function reuseSlide(fresh: IgPostSlide, cached?: IgPostSlide): IgPostSlide {
  if (!cached) return fresh;
  return {
    ...fresh,
    displayUrl: reuseUrl(fresh.displayUrl, cached.displayUrl) ?? fresh.displayUrl,
    videoUrl: reuseUrl(fresh.videoUrl, cached.videoUrl),
    width: fresh.width ?? cached.width,
    height: fresh.height ?? cached.height,
  };
}

function reusePost(fresh: IgPost, cached?: IgPost): IgPost {
  if (!cached) return fresh;
  const byId = new Map(cached.slides.map((s) => [s.id, s]));
  const slides =
    fresh.slides.length > 0
      ? fresh.slides.map((s) => reuseSlide(s, byId.get(s.id)))
      : cached.slides;
  return {
    ...fresh,
    displayUrl: reuseUrl(fresh.displayUrl, cached.displayUrl) ?? fresh.displayUrl,
    videoUrl: reuseUrl(fresh.videoUrl, cached.videoUrl),
    caption: fresh.caption || cached.caption,
    shortCode: fresh.shortCode || cached.shortCode,
    url: fresh.url || cached.url,
    timestamp: fresh.timestamp || cached.timestamp,
    slides,
  };
}

function reuseStory(fresh: IgStoryItem, cached?: IgStoryItem): IgStoryItem {
  if (!cached) return fresh;
  return {
    ...fresh,
    imageUrl: reuseUrl(fresh.imageUrl, cached.imageUrl),
    videoUrl: reuseUrl(fresh.videoUrl, cached.videoUrl),
    takenAt: fresh.takenAt ?? cached.takenAt,
    expiringAt: fresh.expiringAt ?? cached.expiringAt,
    width: fresh.width ?? cached.width,
    height: fresh.height ?? cached.height,
  };
}

function reuseHighlight(fresh: IgHighlight, cached?: IgHighlight): IgHighlight {
  if (!cached) return fresh;
  const liveHasItems =
    fresh.items.length > 1 || (fresh.items.length === 1 && !fresh.items[0]?.id?.endsWith("-cover"));
  const items = liveHasItems
    ? fresh.items.map((it) => reuseStory(it, cached.items.find((c) => storyKey(c) === storyKey(it))))
    : cached.items.length
      ? cached.items
      : fresh.items;
  return {
    ...fresh,
    title: fresh.title || cached.title,
    coverImageUrl: reuseUrl(fresh.coverImageUrl, cached.coverImageUrl),
    mediaCount: fresh.mediaCount ?? cached.mediaCount ?? items.length,
    items,
  };
}

const memProfiles = new Map<string, Cached<IgProfile>>();
const memStories = new Map<string, Cached<IgStories>>();

export class InstagramCache {
  subscribe(fn: () => void) {
    if (typeof window === "undefined") return () => undefined;
    window.addEventListener(CACHE_EVENT, fn);
    return () => window.removeEventListener(CACHE_EVENT, fn);
  }

  notify() {
    notify();
  }

  private lsRead<T>(key: string): Cached<T> | null {
    if (typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Cached<T>;
      if (!parsed || typeof parsed.at !== "number" || !parsed.data) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private lsWrite(key: string, data: unknown, at = Date.now()) {
    if (typeof localStorage === "undefined") return;
    const payload = JSON.stringify({ at, data });
    try {
      localStorage.setItem(key, payload);
      return;
    } catch {
      this.evict(4);
    }
    try {
      localStorage.setItem(key, payload);
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  }

  private slimStories(data: IgStories): IgStories {
    return {
      ...data,
      highlights: (data.highlights ?? []).map((h) => ({
        id: h.id,
        title: h.title,
        coverImageUrl: h.coverImageUrl || h.items?.[0]?.imageUrl,
        mediaCount: h.mediaCount ?? h.items?.length ?? 0,
        items: (h.items ?? []).slice(0, 8).map((it) => ({ ...it, videoUrl: undefined })),
      })),
    };
  }

  private read<T>(key: string): Cached<T> | null {
    return this.lsRead<T>(key);
  }

  evict(count = 2) {
    const entries: { key: string; at: number }[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || PROTECTED.has(key)) continue;
        if (!key.startsWith(PROFILE_PREFIX) && !key.startsWith(STORIES_PREFIX)) continue;
        try {
          const parsed = JSON.parse(localStorage.getItem(key) ?? "") as { at?: number };
          entries.push({ key, at: typeof parsed.at === "number" ? parsed.at : 0 });
        } catch {
          entries.push({ key, at: 0 });
        }
      }
      entries.sort((a, b) => a.at - b.at);
      for (const entry of entries.slice(0, Math.max(1, count))) localStorage.removeItem(entry.key);
    } catch {
      /* ignore */
    }
  }

  profile(username: string): Cached<IgProfile> | null {
    const key = username.trim().toLowerCase();
    if (!key) return null;
    const mem = memProfiles.get(key);
    if (mem) return mem;
    const disk = this.lsRead<IgProfile>(PROFILE_PREFIX + key);
    if (disk) memProfiles.set(key, disk);
    return disk;
  }

  stories(username: string): Cached<IgStories> | null {
    const key = username.trim().toLowerCase();
    if (!key) return null;
    const mem = memStories.get(key);
    const hit = mem ?? this.lsRead<IgStories>(STORIES_PREFIX + key);
    if (!hit?.data) return hit;
    if (!mem) memStories.set(key, hit);
    const highlights = dedupeHighlights((hit.data.highlights ?? []).filter((hl) => !isJunkHighlight(hl)));
    return { ...hit, data: { ...hit.data, highlights } };
  }

  listProfiles(): IgProfile[] {
    const out = new Map<string, IgProfile>();
    for (const [name, hit] of memProfiles) {
      if (hit?.data?.username) out.set(name, hit.data);
    }
    if (typeof localStorage === "undefined") return [...out.values()];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PROFILE_PREFIX)) continue;
      const hit = this.lsRead<IgProfile>(key);
      const name = key.slice(PROFILE_PREFIX.length);
      if (hit?.data?.username && Array.isArray(hit.data.posts) && !out.has(name)) out.set(name, hit.data);
    }
    return [...out.values()];
  }

  writeProfile(username: string, data: IgProfile, at = Date.now()) {
    const key = username.trim().toLowerCase();
    memProfiles.set(key, { at, data });
    this.lsWrite(PROFILE_PREFIX + key, data, at);
    notify();
  }

  writeStories(username: string, data: IgStories, at = Date.now()) {
    const key = username.trim().toLowerCase();
    const highlights = dedupeHighlights((data.highlights ?? []).filter((hl) => !isJunkHighlight(hl)));
    const next = { ...data, highlights };
    const prev = memStories.get(key)?.data;
    const merged = prev ? this.reconcileStories(prev, next) : next;
    memStories.set(key, { at, data: merged });
    this.lsWrite(STORIES_PREFIX + key, this.slimStories(merged), at);
    notify();
  }

  clear() {
    memProfiles.clear();
    memStories.clear();
    const keys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith(PROFILE_PREFIX) || key.startsWith(STORIES_PREFIX)) keys.push(key);
      }
      for (const key of keys) localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    notify();
  }

  isStoryLive(story: IgStoryItem, now = Date.now()) {
    const exp = unixMs(story.expiringAt);
    if (exp) return exp > now;
    const taken = unixMs(story.takenAt);
    if (taken) return taken + 24 * 60 * 60 * 1000 > now;
    return false;
  }

  liveStories(items: IgStoryItem[] | undefined, now = Date.now()) {
    return (items ?? []).filter((item) => this.isStoryLive(item, now));
  }

  fingerprint(profile?: IgProfile | null, stories?: IgStories | null) {
    const posts = (profile?.posts ?? []).map(postKey).join(",");
    const live = this.liveStories(stories?.stories).map(storyKey).join(",");
    const hl = (stories?.highlights ?? []).map((h) => canonHighlightId(h.id)).join(",");
    return `${profile?.profilePicUrl ?? ""}|${profile?.postsCount ?? ""}|${posts}|${live}|${hl}`;
  }

  freshEnough(username: string, now = Date.now()) {
    const p = this.profile(username);
    const s = this.stories(username);
    if (!p) return false;
    if (now - p.at >= FRESH_MS) return false;
    if (!s) return false;
    const live = this.liveStories(s.data.stories, now);
    if (s.data.highlights.length > 0 || live.length > 0) return true;
    return now - s.at < 30 * 60 * 1000;
  }

  /** Live account wins the list. Known ids keep cached media. Gone items drop. */
  reconcileProfile(cached: IgProfile | null, live: IgProfile): IgProfile {
    const prev = new Map((cached?.posts ?? []).map((p) => [postKey(p), p]));
    const posts = live.posts.map((p) => reusePost(p, prev.get(postKey(p))));
    return {
      ...live,
      fullName: live.fullName || cached?.fullName || "",
      biography: live.biography || cached?.biography || "",
      profilePicUrl: live.profilePicUrl || cached?.profilePicUrl,
      posts,
    };
  }

  reconcileStories(cached: IgStories | null, live: IgStories): IgStories {
    const prevStories = new Map((cached?.stories ?? []).map((s) => [storyKey(s), s]));
    const incoming = this.liveStories(live.stories);
    const stories = (incoming.length ? incoming : this.liveStories(cached?.stories)).map((s) =>
      reuseStory(s, prevStories.get(storyKey(s))),
    );
    const liveHl = (live.highlights ?? []).filter((hl) => !isJunkHighlight(hl));
    const cachedHl = (cached?.highlights ?? []).filter((hl) => !isJunkHighlight(hl));
    const prevHl = new Map(cachedHl.map((hl) => [canonHighlightId(hl.id), hl]));
    const highlights = liveHl.length
      ? liveHl.map((hl) => reuseHighlight(hl, prevHl.get(canonHighlightId(hl.id))))
      : cachedHl;
    const packed = dedupeHighlights(highlights);
    return {
      ...live,
      isAccessible: live.isAccessible !== false || stories.length > 0 || packed.length > 0,
      errorMessage: packed.length || stories.length ? null : (live.errorMessage ?? cached?.errorMessage ?? null),
      stories,
      highlights: packed,
    };
  }

  addedCount(before: { profile?: IgProfile | null; stories?: IgStories | null }, after: { profile?: IgProfile | null; stories?: IgStories | null }) {
    const prev = new Set<string>();
    for (const p of before.profile?.posts ?? []) prev.add(`p:${postKey(p)}`);
    for (const s of before.stories?.stories ?? []) prev.add(`s:${storyKey(s)}`);
    for (const h of before.stories?.highlights ?? []) prev.add(`h:${canonHighlightId(h.id)}`);
    let added = 0;
    for (const p of after.profile?.posts ?? []) if (!prev.has(`p:${postKey(p)}`)) added += 1;
    for (const s of this.liveStories(after.stories?.stories)) if (!prev.has(`s:${storyKey(s)}`)) added += 1;
    for (const h of after.stories?.highlights ?? []) if (!prev.has(`h:${canonHighlightId(h.id)}`)) added += 1;
    return added;
  }

  apply(
    username: string,
    liveProfile?: IgProfile | null,
    liveStories?: IgStories | null,
  ): CacheSyncResult {
    const cachedP = this.profile(username);
    const cachedS = this.stories(username);
    const profile = liveProfile ? this.reconcileProfile(cachedP?.data ?? null, liveProfile) : cachedP?.data ?? null;
    const stories = liveStories ? this.reconcileStories(cachedS?.data ?? null, liveStories) : cachedS?.data ?? null;
    if (profile) this.writeProfile(username, profile);
    if (stories) this.writeStories(username, stories);
    return {
      profile,
      stories,
      added: this.addedCount({ profile: cachedP?.data, stories: cachedS?.data }, { profile, stories }),
      fromCache: false,
    };
  }

  async sync(
    username: string,
    loaders: {
      profile: () => Promise<IgProfile>;
      stories: () => Promise<IgStories>;
    },
    force = false,
  ): Promise<CacheSyncResult> {
    const cachedP = this.profile(username);
    const cachedS = this.stories(username);
    if (!force && this.freshEnough(username) && cachedP?.data) {
      return {
        profile: cachedP.data,
        stories: cachedS?.data ?? null,
        added: 0,
        fromCache: true,
      };
    }
    const [p, s] = await Promise.allSettled([loaders.profile(), loaders.stories()]);
    const liveProfile = p.status === "fulfilled" ? p.value : null;
    const liveStories = s.status === "fulfilled" ? s.value : null;
    const failMsg = (r: PromiseSettledResult<unknown>) =>
      r.status === "rejected" ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : "";
    const error = [failMsg(p), failMsg(s)].filter(Boolean).join(" · ") || undefined;
    if (!liveProfile && !liveStories) {
      if (force) throw new Error(error || "Не удалось обновить.");
      if (cachedP?.data || cachedS?.data) {
        return { profile: cachedP?.data ?? null, stories: cachedS?.data ?? null, added: 0, fromCache: true, error };
      }
      throw new Error(error || "Не удалось обновить кэш.");
    }
    const same =
      liveProfile &&
      cachedP &&
      this.fingerprint(cachedP.data, cachedS?.data) === this.fingerprint(liveProfile, liveStories ?? cachedS?.data);
    if (same && !force) {
      const profile = this.reconcileProfile(cachedP.data, liveProfile);
      if (profile.profilePicUrl !== cachedP.data.profilePicUrl) this.writeProfile(username, profile);
      return { profile, stories: cachedS?.data ?? liveStories, added: 0, fromCache: true };
    }
    return this.apply(username, liveProfile, liveStories);
  }
}

export const igCache = new InstagramCache();

function unixMs(value?: number) {
  if (!value || value <= 0) return 0;
  return value > 1e12 ? value : value * 1000;
}

/** Combine two live API responses (not cache). Keep both post sets. */
export function unionProfile(a: IgProfile | null, b: IgProfile): IgProfile {
  if (!a) return b;
  const seen = new Set(b.posts.map(postKey));
  const posts = [...b.posts];
  for (const post of a.posts) {
    if (seen.has(postKey(post))) continue;
    posts.push(post);
    seen.add(postKey(post));
  }
  return {
    ...b,
    posts,
    profilePicUrl: b.profilePicUrl || a.profilePicUrl,
    fullName: b.fullName || a.fullName,
  };
}

export function unionStories(a: IgStories | null, b: IgStories): IgStories {
  return igCache.reconcileStories(a, {
    ...b,
    stories: b.stories.length ? b.stories : a?.stories ?? [],
    highlights: (b.highlights?.length ? b.highlights : a?.highlights) ?? [],
  });
}
