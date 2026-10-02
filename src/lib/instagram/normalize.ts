import type { IgHighlight, IgPost, IgPostSlide, IgProfile, IgStories, IgStoryItem } from "./types";
import { isPlayableMediaUrl, isVideoMediaUrl } from "./media-url";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asBool(v: unknown): boolean {
  return v === true;
}

export function canonHighlightId(id: string) {
  return String(id || "")
    .replace(/^highlight:/i, "")
    .replace(/^hl-/i, "")
    .trim();
}

function coverKey(url?: string) {
  if (!url) return "";
  const id = url.match(/[?&]id=([^&]+)/)?.[1];
  if (id) return id;
  const base = url.split("?")[0] ?? url;
  const parts = base.split("/");
  return parts[parts.length - 1] || base;
}

function mergeHighlight(a: IgHighlight, b: IgHighlight): IgHighlight {
  const ids = new Set(a.items.map((it) => it.id));
  const items = [...a.items];
  for (const it of b.items) {
    if (!ids.has(it.id)) items.push(it);
  }
  return {
    ...a,
    id: a.id || b.id,
    items,
    mediaCount: Math.max(a.mediaCount ?? 0, b.mediaCount ?? 0, items.length),
    coverImageUrl: a.coverImageUrl || b.coverImageUrl,
    title: isBlankHlTitle(a.title) ? b.title : a.title,
  };
}

export function dedupeHighlights(list: IgHighlight[]): IgHighlight[] {
  const byId = new Map<string, IgHighlight>();
  for (const hl of list) {
    const id = canonHighlightId(hl.id);
    const next = { ...hl, id };
    const prev = byId.get(id);
    byId.set(id, prev ? mergeHighlight(prev, next) : next);
  }
  return [...byId.values()];
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const s = asString(obj[k]);
    if (s) return s;
  }
  return undefined;
}

function pickMedia(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const s = obj[k];
    if (isPlayableMediaUrl(s)) return s;
  }
  return undefined;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const n = asNumber(obj[k]);
    if (n != null) return n;
    if (typeof obj[k] === "string") {
      const raw = obj[k] as string;
      const num = Number(raw);
      if (Number.isFinite(num) && /^\d+(\.\d+)?$/.test(raw.trim())) return num;
      const ms = Date.parse(raw);
      if (Number.isFinite(ms)) return Math.floor(ms / 1000);
    }
  }
  return undefined;
}

function mediaTypeOf(raw: unknown, hasVideo: boolean): "image" | "video" {
  if (raw === 2 || raw === "2") return "video";
  if (raw === 1 || raw === "1") return hasVideo ? "video" : "image";
  const s = typeof raw === "string" ? raw.toLowerCase() : "";
  if (s.includes("video") || s === "clip" || s === "reel") return "video";
  if (hasVideo) return "video";
  return "image";
}

function slideFrom(raw: unknown, fallbackId: string): IgPostSlide | null {
  const o = asRecord(raw);
  if (!o) return null;
  const videoUrl =
    pickMedia(o, ["videoUrl", "video_url", "video"]) ?? firstUrl(o.video_versions, "video");
  const imageUrl =
    pickMedia(o, ["displayUrl", "display_url", "imageUrl", "image_url", "thumbnailUrl", "thumbnail_url"]) ??
    firstUrl(o.image_versions, "image") ??
    firstUrl(o.image_versions2, "image") ??
    firstUrl(o.image_versions, "image");
  const displayUrl =
    (imageUrl && !isVideoMediaUrl(imageUrl) ? imageUrl : undefined) ??
    (videoUrl && !isVideoMediaUrl(videoUrl) ? videoUrl : undefined) ??
    imageUrl ??
    videoUrl;
  if (!displayUrl && !videoUrl) return null;
  const type = mediaTypeOf(o.type ?? o.mediaType ?? o.media_type, Boolean(videoUrl) || isVideoMediaUrl(displayUrl));
  return {
    id: pickString(o, ["id", "pk"]) ?? fallbackId,
    type,
    displayUrl: displayUrl ?? videoUrl ?? "",
    videoUrl: videoUrl ?? (isVideoMediaUrl(displayUrl) ? displayUrl : undefined),
    width: pickNumber(o, ["dimensionsWidth", "originalWidth", "width"]),
    height: pickNumber(o, ["dimensionsHeight", "originalHeight", "height"]),
  };
}

export function normalizePost(raw: unknown, index = 0): IgPost | null {
  const o = asRecord(raw);
  if (!o) return null;
  const videoUrl =
    pickMedia(o, ["videoUrl", "video_url"]) ?? firstUrl(o.video_versions, "video");
  const imageUrl =
    pickMedia(o, ["displayUrl", "display_url", "thumbnailUrl", "thumbnail_url", "imageUrl", "image_url"]) ??
    firstUrl(o.image_versions, "image") ??
    firstUrl(o.image_versions2, "image");
  const displayUrl =
    (imageUrl && !isVideoMediaUrl(imageUrl) ? imageUrl : undefined) ??
    imageUrl ??
    videoUrl;
  const childPosts = Array.isArray(o.childPosts)
    ? o.childPosts
    : Array.isArray(o.resources)
      ? o.resources
      : Array.isArray(o.carousel_media)
        ? o.carousel_media
        : Array.isArray(o.images)
          ? (o.images as unknown[]).map((url, i) =>
              typeof url === "string" ? { id: `${index}-${i}`, displayUrl: url, type: "Image" } : url,
            )
          : [];
  const slides: IgPostSlide[] = [];
  if (childPosts.length > 0) {
    childPosts.forEach((child, i) => {
      const slide = slideFrom(child, `${index}-c${i}`);
      if (slide) slides.push(slide);
    });
  }
  if (slides.length === 0 && (displayUrl || videoUrl)) {
    slides.push({
      id: pickString(o, ["id", "pk", "shortCode"]) ?? `post-${index}`,
      type: mediaTypeOf(o.type ?? o.media_type ?? o.mediaType, Boolean(videoUrl) || isVideoMediaUrl(displayUrl)),
      displayUrl: displayUrl ?? videoUrl ?? "",
      videoUrl: videoUrl ?? (isVideoMediaUrl(displayUrl) ? displayUrl : undefined),
      width: pickNumber(o, ["dimensionsWidth", "originalWidth", "width"]),
      height: pickNumber(o, ["dimensionsHeight", "originalHeight", "height"]),
    });
  }
  if (slides.length === 0) return null;

  const typeRaw = asString(o.type)?.toLowerCase() ?? "";
  const type: IgPost["type"] =
    typeRaw.includes("sidecar") || typeRaw.includes("carousel") || slides.length > 1
      ? "sidecar"
      : mediaTypeOf(o.type ?? o.media_type ?? o.mediaType, Boolean(videoUrl) || slides.some((s) => s.type === "video"));

  const timestampRaw = o.timestamp ?? o.takenAt ?? o.taken_at ?? o.takenAtTimestamp;
  let timestamp: string | undefined;
  if (typeof timestampRaw === "string") timestamp = timestampRaw;
  else if (typeof timestampRaw === "number") {
    const ms = timestampRaw > 1e12 ? timestampRaw : timestampRaw * 1000;
    timestamp = new Date(ms).toISOString();
  }

  return {
    id: pickString(o, ["id", "pk", "shortCode"]) ?? `post-${index}`,
    shortCode: pickString(o, ["shortCode", "shortcode"]),
    url: pickString(o, ["url", "postUrl"]),
    type,
    caption: pickString(o, ["caption", "caption_text", "text", "accessibilityCaption"]) ?? "",
    displayUrl: slides[0]?.displayUrl ?? displayUrl ?? "",
    videoUrl: slides[0]?.videoUrl ?? videoUrl ?? (isVideoMediaUrl(slides[0]?.displayUrl) ? slides[0]?.displayUrl : undefined),
    likesCount: pickNumber(o, ["likesCount", "likes_count", "likeCount", "likes"]),
    commentsCount: pickNumber(o, ["commentsCount", "comments_count", "commentCount", "comments"]),
    timestamp,
    slides,
  };
}

export function normalizeProfile(raw: unknown, fallbackUsername: string): IgProfile {
  const o = asRecord(raw) ?? {};
  const latest = Array.isArray(o.latestPosts)
    ? o.latestPosts
    : Array.isArray(o.posts)
      ? o.posts
      : [];
  const posts = latest
    .map((p, i) => normalizePost(p, i))
    .filter((p): p is IgPost => p !== null);

  return {
    username: pickString(o, ["username", "userName"]) ?? fallbackUsername,
    fullName: pickString(o, ["fullName", "full_name", "name"]) ?? "",
    biography: pickString(o, ["biography", "bio", "biography_with_entities"]) ?? "",
    followersCount: pickNumber(o, ["followersCount", "followers_count", "follower_count", "edge_followed_by"]),
    followsCount: pickNumber(o, ["followsCount", "follows_count", "followingCount", "following_count"]),
    postsCount: pickNumber(o, ["postsCount", "posts_count", "mediaCount", "media_count"]),
    profilePicUrl:
      pickString(o, ["profilePicUrlHD", "profile_pic_url_hd", "profilePicUrl", "profile_pic_url"]) ??
      firstUrl(o.hd_profile_pic_url_info) ??
      firstUrl(o.hd_profile_pic_versions),
    verified: asBool(o.verified) || asBool(o.isVerified) || asBool(o.is_verified),
    private: asBool(o.private) || asBool(o.isPrivate) || asBool(o.is_private),
    externalUrl: pickString(o, ["externalUrl", "external_url", "website"]),
    posts,
  };
}

function firstUrl(raw: unknown, want?: "image" | "video"): string | undefined {
  const scored: { url: string; w: number; cropped: boolean; video: boolean }[] = [];

  function walk(node: unknown, depth: number, cropped: boolean) {
    if (node == null || depth > 6) return;
    if (typeof node === "string") {
      if (isPlayableMediaUrl(node)) scored.push({ url: node, w: 0, cropped, video: isVideoMediaUrl(node) });
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1, cropped);
      return;
    }
    const o = asRecord(node);
    if (!o) return;
    const url = pickMedia(o, ["url", "src"]);
    const w = asNumber(o.width) ?? asNumber(o.w) ?? 0;
    const hereCropped = cropped || Boolean(o.crop_rect) || Object.keys(o).some((k) => k.includes("cropped"));
    if (url) scored.push({ url, w, cropped: hereCropped, video: isVideoMediaUrl(url) });
    walk(o.candidates, depth + 1, hereCropped);
    walk(o.image_versions2, depth + 1, hereCropped);
    walk(o.image_versions, depth + 1, hereCropped);
    walk(o.video_versions, depth + 1, false);
    walk(o.full_image_version, depth + 1, false);
    if (!scored.length) walk(o.cropped_image_version, depth + 1, true);
  }

  walk(raw, 0, false);
  if (!scored.length) return undefined;
  const typed =
    want === "video"
      ? scored.filter((s) => s.video)
      : want === "image"
        ? scored.filter((s) => !s.video)
        : scored;
  const poolSrc = typed.length ? typed : want === "image" ? scored.filter((s) => !s.video) : scored;
  const full = poolSrc.filter((s) => !s.cropped);
  const pool = full.length ? full : poolSrc;
  pool.sort((a, b) => b.w - a.w);
  return pool[0]?.url;
}

function normalizeStoryItem(raw: unknown, index: number): IgStoryItem | null {
  const o = asRecord(raw);
  if (!o) return null;
  const videoUrl =
    pickMedia(o, ["videoUrl", "video_url", "video"]) ?? firstUrl(o.video_versions, "video");
  const imageUrl =
    pickMedia(o, [
      "imageUrl",
      "image_url",
      "displayUrl",
      "display_url",
      "thumbnailUrl",
      "thumbnail_url",
      "mediaUrl",
      "media_url",
    ]) ?? firstUrl(o.image_versions2, "image") ?? firstUrl(o.image_versions, "image");
  if (!imageUrl && !videoUrl) return null;
  const mediaType = mediaTypeOf(o.mediaType ?? o.media_type ?? o.type, Boolean(videoUrl) || isVideoMediaUrl(imageUrl));
  const takenAt = pickNumber(o, ["takenAt", "taken_at", "timestamp"]);
  const expiringAt = pickNumber(o, ["expiringAt", "expiring_at", "expiringAtTimestamp"]);
  return {
    id: pickString(o, ["id", "pk", "story_pk", "storyId"]) ?? `story-${index}`,
    mediaType,
    imageUrl: (imageUrl && !isVideoMediaUrl(imageUrl) ? imageUrl : undefined) ?? imageUrl ?? videoUrl,
    videoUrl: mediaType === "video" ? videoUrl ?? (isVideoMediaUrl(imageUrl) ? imageUrl : undefined) : videoUrl,
    takenAt: takenAt && takenAt > 1e12 ? Math.floor(takenAt / 1000) : takenAt,
    expiringAt: expiringAt && expiringAt > 1e12 ? Math.floor(expiringAt / 1000) : expiringAt,
    width: pickNumber(o, ["originalWidth", "width", "dimensionsWidth"]),
    height: pickNumber(o, ["originalHeight", "height", "dimensionsHeight"]),
    caption: pickString(o, ["accessibilityCaption", "caption", "text"]),
  };
}

function normalizeHighlight(raw: unknown, index: number): IgHighlight | null {
  const o = asRecord(raw);
  if (!o) return null;
  const itemsRaw = Array.isArray(o.items)
    ? o.items
    : Array.isArray(o.highlightItems)
      ? o.highlightItems
      : Array.isArray(o.stories)
        ? o.stories
        : [];
  const items = itemsRaw
    .map((it, i) => normalizeStoryItem(it, i))
    .filter((it): it is IgStoryItem => it !== null);
  const cover =
    pickMedia(o, ["coverImageUrl", "cover_image_url", "coverUrl", "cover_url", "cover", "cover_pic"]) ??
    firstUrl(asRecord(o.cover_media)?.full_image_version) ??
    firstUrl(o.cover_media) ??
    items[0]?.imageUrl;
  const id = canonHighlightId(pickString(o, ["highlightId", "highlight_id", "id", "pk"]) ?? `hl-${index}`);
  const title = pickString(o, ["title"]) ?? "";
  const realItems = items.filter((it) => !String(it.id).endsWith("-cover"));
  const kept = realItems.length ? realItems : items;
  const filtered = kept.filter((it, i) => {
    if (kept.length <= 1) return true;
    if (cover && coverKey(it.imageUrl) && coverKey(it.imageUrl) === coverKey(cover) && i === kept.length - 1) {
      return false;
    }
    if ((it.width ?? 9999) < 240 && kept.length > 1) return false;
    return true;
  });
  if (!cover && filtered.length === 0) return null;
  if (!isIgHighlightId(id) && title === "Highlight") return null;
  const finalItems =
    filtered.length > 0
      ? filtered
      : cover
        ? [{ id: `${id}-cover`, mediaType: "image" as const, imageUrl: cover }]
        : [];
  const scoped = finalItems.map((it, i) => ({
    ...it,
    id: it.id.includes(id) ? it.id : `${id}-${it.id || i}`,
  }));
  return {
    id,
    title,
    coverImageUrl: cover,
    mediaCount: pickNumber(o, ["mediaCount", "media_count"]) ?? scoped.length,
    items: scoped,
  };
}

export function flattenHighlightRows(items: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const it of items) {
    const o = asRecord(it);
    if (!o) continue;
    if (Array.isArray(o.highlights) && o.highlights.length) {
      out.push(...o.highlights);
      continue;
    }
    if (Array.isArray(o.tray) && o.tray.length) {
      out.push(...o.tray);
      continue;
    }
    const id = String(o.id ?? o.pk ?? "");
    const reel = o.reel_type === "highlight_reel" || o.is_pinned_highlight === true || id.startsWith("highlight:");
    if (reel || (o.cover_media && (typeof o.title === "string" || o.media_count != null))) {
      out.push(it);
    }
  }
  return out;
}

export function normalizeHighlights(items: unknown[]): IgHighlight[] {
  return dedupeHighlights(
    flattenHighlightRows(items)
      .map((it, i) => normalizeHighlight(it, i))
      .filter((h): h is IgHighlight => h !== null),
  );
}

export function isBlankHlTitle(title: string | undefined) {
  return !title || !title.replace(/[\s\u2800\u00a0\u200b\u2060\u3000]/g, "");
}

export function isIgHighlightId(id: string | undefined) {
  const clean = canonHighlightId(id ?? "");
  if (!clean || clean.startsWith("dbx") || /^hl-\d+$/i.test(clean)) return false;
  return /^\d{10,}$/.test(clean);
}

export function isJunkHighlight(hl: IgHighlight) {
  if (hl.coverImageUrl || (hl.items?.length ?? 0) > 0) return false;
  if (!isBlankHlTitle(hl.title)) return false;
  if (isIgHighlightId(hl.id)) return false;
  if (hl.title === "Highlight" && (hl.mediaCount ?? 0) <= 1) return true;
  return true;
}

export function normalizeStories(raw: unknown, fallbackUsername: string): IgStories {
  const o = asRecord(raw) ?? {};
  const storiesRaw = Array.isArray(o.stories) ? o.stories : Array.isArray(o.items) ? o.items : [];
  const highlightsRaw = Array.isArray(o.highlights) ? o.highlights : [];
  return {
    username: pickString(o, ["username", "userName"]) ?? fallbackUsername,
    isPrivate: asBool(o.isPrivate) || asBool(o.private),
    isAccessible: o.isAccessible === false ? false : true,
    errorMessage: asString(o.errorMessage) ?? asString(o.error) ?? null,
    stories: storiesRaw
      .map((it, i) => normalizeStoryItem(it, i))
      .filter((it): it is IgStoryItem => it !== null),
    highlights: highlightsRaw
      .map((h, i) => normalizeHighlight(h, i))
      .filter((h): h is IgHighlight => h !== null),
  };
}

export function normalizeStoriesFromRows(items: unknown[], fallbackUsername: string): IgStories {
  const stories: IgStoryItem[] = [];
  const seenStories = new Set<string>();
  const hlMap = new Map<string, IgHighlight>();

  function addStory(it: IgStoryItem) {
    if (seenStories.has(it.id)) return;
    seenStories.add(it.id);
    stories.push(it);
  }

  function addHl(h: IgHighlight) {
    const key = canonHighlightId(h.id) || h.id;
    if (!key) return;
    const prev = hlMap.get(key);
    hlMap.set(key, prev ? mergeHighlight(prev, h) : h);
  }

  for (const [i, raw] of items.entries()) {
    const o = asRecord(raw);
    if (!o || o.recordType === "runSummary") continue;
    if (o.error && !Array.isArray(o.highlights) && !Array.isArray(o.stories)) continue;

    if (Array.isArray(o.stories)) {
      for (const [j, s] of o.stories.entries()) {
        const it = normalizeStoryItem(s, j);
        if (it) addStory(it);
      }
    }
    if (Array.isArray(o.highlights)) {
      for (const [j, h] of o.highlights.entries()) {
        const hl = normalizeHighlight(h, j);
        if (hl) addHl(hl);
      }
    }
    if (Array.isArray(o.tray)) {
      for (const [j, h] of o.tray.entries()) {
        const hl = normalizeHighlight(h, j);
        if (hl) addHl(hl);
      }
    }

    const looksHl =
      Boolean(o.highlightId || o.highlight_id || o.isHighlight || o.is_pinned_highlight) ||
      o.reel_type === "highlight_reel" ||
      String(o.id ?? "").startsWith("highlight:");
    if (looksHl) {
      const hl = normalizeHighlight(o, i);
      if (hl) addHl(hl);
    } else if (!Array.isArray(o.stories) && !Array.isArray(o.highlights)) {
      const media =
        pickMedia(o, ["mediaUrl", "media_url", "imageUrl", "image_url", "thumbnailUrl", "thumbnail_url", "displayUrl", "video_url", "videoUrl"]) ??
        firstUrl(o.image_versions2) ??
        firstUrl(o.video_versions);
      const isVideo =
        mediaTypeOf(o.mediaType ?? o.media_type ?? o.type, Boolean(o.is_video || o.isVideo)) === "video" ||
        o.is_video === true ||
        o.isVideo === true;
      const item = normalizeStoryItem(
        {
          ...o,
          id: o.storyId ?? o.story_pk ?? o.id,
          imageUrl:
            pickString(o, ["thumbnail_url", "thumbnailUrl", "imageUrl", "displayUrl"]) ?? (isVideo ? undefined : media),
          videoUrl: isVideo
            ? pickString(o, ["videoUrl", "video_url", "media_url"]) ?? media
            : pickString(o, ["videoUrl", "video_url"]),
          takenAt: o.takenAt ?? o.taken_at ?? o.taken_at_ts,
          expiringAt: o.expiringAt ?? o.expiring_at,
        },
        i,
      );
      if (item) addStory(item);
    }
  }

  const highlights = [...hlMap.values()].filter((hl) => !isJunkHighlight(hl));
  return {
    username: fallbackUsername,
    isPrivate: false,
    isAccessible: stories.length > 0 || highlights.length > 0,
    errorMessage: stories.length || highlights.length ? null : "Сторис не открылись.",
    stories,
    highlights,
  };
}

export function firstDatasetItem(items: unknown): unknown {
  if (!Array.isArray(items)) return items;
  const user = items.find((it) => {
    if (!it || typeof it !== "object") return false;
    const rec = it as Record<string, unknown>;
    return rec.recordType !== "runSummary";
  });
  return user ?? items[0] ?? null;
}
