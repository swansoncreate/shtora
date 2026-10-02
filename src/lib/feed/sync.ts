import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { DailyPost } from "./daily";

const slide = z.object({
  id: z.string().min(1).max(80),
  url: z.string().min(1).max(500),
  video: z.boolean().optional(),
});

const cardShape = z.object({
  id: z.string().min(1).max(80),
  username: z.string().min(1).max(40),
  at: z.number(),
  slot: z.string().max(20).optional(),
  source: z.enum(["generated", "instagram"]),
  caption: z.string().max(400),
  slides: z.array(slide).min(1).max(3),
  liked: z.boolean().optional(),
});

const listFeed = createServerFn({ method: "POST" })
  .validator(z.object({ username: z.string().min(1).max(40).optional() }))
  .handler(async ({ data }) => {
    const { proxyOr, runningOnVps } = await import("@/lib/server/remote");
    return proxyOr("feed.list", data, async () => {
      if (!runningOnVps()) throw new Error("feed.list only on vps");
      const { listFeed: read } = await import("./disk.server");
      return read(data.username);
    });
  });

const appendFeed = createServerFn({ method: "POST" })
  .validator(z.object({ card: cardShape }))
  .handler(async ({ data }) => {
    const { proxyOr, runningOnVps } = await import("@/lib/server/remote");
    return proxyOr("feed.append", data, async () => {
      if (!runningOnVps()) throw new Error("feed.append only on vps");
      const { appendFeed: write } = await import("./disk.server");
      return write(data.card);
    });
  });

export const likeFeedDisk = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1).max(80), on: z.boolean() }))
  .handler(async ({ data }) => {
    const { proxyOr, runningOnVps } = await import("@/lib/server/remote");
    return proxyOr("feed.like", data, async () => {
      if (!runningOnVps()) throw new Error("feed.like only on vps");
      const { likeFeed } = await import("./disk.server");
      return likeFeed(data.id, data.on);
    });
  });

export function postToDisk(post: DailyPost) {
  const url = post.imageUrl.trim();
  if (!url) return null;
  return {
    id: post.id,
    username: post.username.trim().toLowerCase(),
    at: post.at,
    ...(post.slot ? { slot: post.slot } : {}),
    source: "generated" as const,
    caption: post.caption || "",
    slides: post.slides?.length ? post.slides : [{ id: post.id, url }],
    ...(post.liked ? { liked: true } : {}),
  };
}

export function diskToPost(card: {
  id: string;
  username: string;
  at: number;
  slot?: string;
  caption: string;
  slides: { id?: string; url: string }[];
  liked?: boolean;
}): DailyPost | null {
  const url = card.slides[0]?.url || "";
  if (!url) return null;
  return {
    id: card.id,
    username: card.username,
    imageUrl: url,
    slides: card.slides.map((slide) => ({ id: slide.id || card.id, url: slide.url })),
    caption: card.caption || "",
    at: card.at,
    ...(card.liked ? { liked: true } : {}),
    ...(card.slot === "morning" || card.slot === "evening" ? { slot: card.slot } : {}),
  };
}

const pushed = new Set<string>();

export function noteSavedPosts(posts: DailyPost[]) {
  for (const post of posts) {
    if (pushed.has(post.id)) continue;
    pushed.add(post.id);
    pushFeedCard(post);
  }
}

export function pushFeedCard(post: DailyPost) {
  const card = postToDisk(post);
  if (!card) return;
  void appendFeed({ data: { card } }).catch(() => undefined);
}

let feedHydrate: Promise<void> | null = null;

export function hydrateFeedDisk() {
  if (typeof window === "undefined") return;
  if (!feedHydrate) {
    feedHydrate = pullFeed().catch(() => {
      feedHydrate = null;
    });
  }
}

async function pullFeed() {
  const remote = await listFeed({ data: {} });
  const cards = Array.isArray(remote?.cards) ? remote.cards : [];
  const { loadDaily, saveDaily } = await import("./daily");
  const state = loadDaily();
  const have = new Set(state.posts.map((post) => post.id));
  const known = new Set(cards.map((card) => card.id));
  for (const id of known) pushed.add(id);
  for (const card of cards) {
    if (have.has(card.id)) continue;
    const post = diskToPost(card);
    if (!post) continue;
    state.posts.unshift(post);
    have.add(post.id);
  }
  saveDaily(state);
  for (const post of state.posts) {
    if (!known.has(post.id)) pushFeedCard(post);
  }
}
