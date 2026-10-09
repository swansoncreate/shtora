import { getCachedProfile, subscribeCache } from "@/lib/instagram/cache";
import type { IgProfile } from "@/lib/instagram/types";
import { commentCount, seedPostCrowd } from "./comments";
import { dailyToCards, feedImageKey, generateExtraPost, generateNextDaily, isSameFeedDay, loadDaily, needsToday, saveDaily, toggleDailyLike } from "./daily";
import { isFeedLiked, toggleFeedLike } from "./likes";
import { liveTodayCard } from "./live";
import type { FeedCard } from "./simulate";
import { diagnosticLog } from "@/lib/diagnostics";

export type FeedHydrateInput = {
  favorites: string[];
  accountFolders: Record<string, string>;
  defaultFolder: string;
  dropboxToken: string;
};

const FEED_GENERATION_TIMEOUT_MS = 90_000;

async function withFeedDeadline<T>(work: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${FEED_GENERATION_TIMEOUT_MS}ms`)), FEED_GENERATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class FeedEngine {
  private cards: FeedCard[] = [];
  private listeners = new Set<() => void>();
  private filling = false;
  private fillGen = 0;
  private input: FeedHydrateInput | null = null;

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  snapshot() {
    return this.cards;
  }

  busy() {
    return this.filling;
  }

  private emit() {
    this.rebuild();
    this.listeners.forEach((fn) => fn());
  }

  private withMeta(card: FeedCard): FeedCard {
    seedPostCrowd(card.id, card.username, this.input?.favorites ?? []);
    return { ...card, comments: commentCount(card.id), liked: isFeedLiked(card.id) || card.liked };
  }

  private rebuild() {
    const favorites = (this.input?.favorites ?? []).map((n) => n.toLowerCase()).filter(Boolean);
    const fav = new Set(favorites);
    const generated = dailyToCards(loadDaily().posts)
      .filter((card) => !card.story && (!fav.size || fav.has(card.username.toLowerCase())))
      .map((card) => this.withMeta(card));
    const today = new Set(
      generated.filter((card) => isSameFeedDay(card.at)).map((card) => card.username.toLowerCase()),
    );
    const cards = [...generated];
    for (const name of favorites) {
      if (today.has(name)) continue;
      const live = liveTodayCard(name);
      if (live) cards.push(this.withMeta(live));
    }
    cards.sort((a, b) => (b.at || 0) - (a.at || 0));
    this.cards = cards;
  }

  configure(input: FeedHydrateInput) {
    this.input = input;
    this.emit();
  }

  async pullDropbox() {
    /* Feed is generated posts only. */
  }

  async fill(force = false) {
    if (!this.input) return 0;
    if (this.filling && !force) return 0;
    const favorites = this.input.favorites;
    if (!force && !needsToday(loadDaily(), favorites)) {
      this.emit();
      return 0;
    }
    const gen = ++this.fillGen;
    this.filling = true;
    this.emit();
    const startedAt = Date.now();
    diagnosticLog("info", "feed", "fill started", { force, favorites: favorites.length });
    let added = 0;
    try {
      let tries = 0;
      const cap = Math.max(2, favorites.length * 2 + 2);
      while (tries < cap) {
        if (this.fillGen !== gen) return added;
        tries += 1;
        let post: Awaited<ReturnType<typeof generateNextDaily>>;
        try {
          post = await withFeedDeadline(generateNextDaily(favorites), "feed generation");
        } catch (error) {
          console.warn("[shtora:feed] generation stopped; keeping existing posts", error);
          diagnosticLog("error", "feed", "generation failed or timed out", { error: error instanceof Error ? error.message : String(error), tries }, Date.now() - startedAt);
          break;
        }
        if (!post) break;
        const cur = loadDaily();
        const candidateImage = feedImageKey(post.imageUrl);
        if (cur.posts.some((row) => row.id === post.id || (candidateImage && feedImageKey(row.imageUrl) === candidateImage))) continue;
        cur.posts.unshift(post);
        saveDaily(cur);
        added += 1;
        this.emit();
      }
    } finally {
      if (this.fillGen === gen) {
        this.filling = false;
        this.emit();
        diagnosticLog("info", "feed", "fill finished", { added, visiblePosts: this.cards.length }, Date.now() - startedAt);
      }
    }
    return added;
  }

  async regenerate() {
    if (!this.input || this.filling) return 0;
    const names = this.input.favorites.map((n) => n.toLowerCase()).filter(Boolean);
    const gen = ++this.fillGen;
    this.filling = true;
    this.emit();
    const startedAt = Date.now();
    diagnosticLog("info", "feed", "regeneration started", { favorites: names.length });
    let added = 0;
    try {
      for (const name of names) {
        if (this.fillGen !== gen) return added;
        let post: Awaited<ReturnType<typeof generateExtraPost>>;
        try {
          post = await withFeedDeadline(generateExtraPost(name, names), "feed regeneration");
        } catch (error) {
          console.warn("[shtora:feed] regeneration stopped; keeping existing posts", error);
          diagnosticLog("error", "feed", "regeneration failed or timed out", { error: error instanceof Error ? error.message : String(error), username: name }, Date.now() - startedAt);
          continue;
        }
        if (!post) continue;
        const cur = loadDaily();
        const candidateImage = feedImageKey(post.imageUrl);
        if (cur.posts.some((row) => candidateImage && feedImageKey(row.imageUrl) === candidateImage)) continue;
        cur.posts.unshift(post);
        saveDaily(cur);
        added += 1;
        this.emit();
      }
    } finally {
      if (this.fillGen === gen) {
        this.filling = false;
        this.emit();
        diagnosticLog("info", "feed", "regeneration finished", { added, visiblePosts: this.cards.length }, Date.now() - startedAt);
      }
    }
    return added;
  }

  refresh() {
    this.emit();
  }

  like(id: string) {
    const on = toggleFeedLike(id);
    toggleDailyLike(id);
    this.emit();
    return on;
  }

  avatar(username: string) {
    return getCachedProfile(username)?.data.profilePicUrl;
  }

  profile(username: string): IgProfile | undefined {
    return getCachedProfile(username)?.data;
  }
}

export const feedEngine = new FeedEngine();

if (typeof window !== "undefined") {
  subscribeCache(() => feedEngine.refresh());
}
