import { mediaFetchHeaders } from "@/lib/media-host";
import { mediaDiskId, readDiskMedia, writeDiskMedia } from "./media-disk.server";
import type { IgHighlight, IgProfile, IgStories, IgStoryItem } from "./types";

function isRemote(url?: string) {
  return Boolean(url && /^https?:\/\//i.test(url));
}

export function localMediaPath(id: string) {
  return `/api/media?id=${id}`;
}

export async function persistUrl(url?: string): Promise<string> {
  const raw = (url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/api/media") || raw.startsWith("/chat-media") || raw.startsWith("/api/chat-media")) return raw;
  const id = mediaDiskId(raw);
  const cached = await readDiskMedia(raw);
  if (cached) return localMediaPath(id);
  if (!isRemote(raw)) return raw;
  try {
    const res = await fetch(raw, {
      headers: mediaFetchHeaders(new URL(raw).hostname),
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return raw;
    const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0]?.trim() || "image/jpeg";
    if (type.includes("text/html") || type.includes("json")) return raw;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return raw;
    const mime = type.startsWith("image/") || type.startsWith("video/") ? type : "image/jpeg";
    const { runningOnVps, vpsFetch } = await import("@/lib/server/remote");
    if (runningOnVps()) {
      const saved = await writeDiskMedia(raw, buf, mime);
      return saved ? localMediaPath(saved) : raw;
    }
    const put = await vpsFetch(`/api/media?u=${encodeURIComponent(raw)}`, {
      method: "POST",
      headers: { "Content-Type": mime },
      body: buf,
      signal: AbortSignal.timeout(30_000),
    });
    if (!put.ok) return raw;
    const row = (await put.json().catch(() => null)) as { path?: string; id?: string } | null;
    if (row?.path) return row.path;
    if (row?.id) return localMediaPath(row.id);
    return raw;
  } catch {
    return raw;
  }
}

async function mapLimit<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) {
    out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  }
  return out;
}

async function persistItem(item: IgStoryItem): Promise<IgStoryItem> {
  const imageUrl = item.imageUrl ? await persistUrl(item.imageUrl) : item.imageUrl;
  const videoUrl = item.videoUrl ? await persistUrl(item.videoUrl) : item.videoUrl;
  return { ...item, imageUrl, videoUrl };
}

export async function persistHighlight(hl: IgHighlight, withItems = true): Promise<IgHighlight> {
  const coverImageUrl = hl.coverImageUrl ? await persistUrl(hl.coverImageUrl) : hl.coverImageUrl;
  const items = withItems ? await mapLimit(hl.items ?? [], 4, persistItem) : hl.items;
  return { ...hl, coverImageUrl, items };
}

export async function persistAndRewriteStories(stories: IgStories, withItems = false): Promise<IgStories> {
  const highlights = await mapLimit(stories.highlights ?? [], 3, (hl) => persistHighlight(hl, withItems));
  const live = await mapLimit(stories.stories ?? [], 4, persistItem);
  return { ...stories, highlights, stories: live };
}

export async function persistAndRewriteProfile(profile: IgProfile): Promise<IgProfile> {
  const profilePicUrl = profile.profilePicUrl ? await persistUrl(profile.profilePicUrl) : profile.profilePicUrl;
  const posts = await mapLimit(profile.posts ?? [], 3, async (post) => ({
    ...post,
    displayUrl: post.displayUrl ? await persistUrl(post.displayUrl) : post.displayUrl,
    videoUrl: post.videoUrl ? await persistUrl(post.videoUrl) : post.videoUrl,
    slides: post.slides
      ? await mapLimit(post.slides, 4, async (slide) => ({
          ...slide,
          displayUrl: slide.displayUrl ? await persistUrl(slide.displayUrl) : slide.displayUrl,
          videoUrl: slide.videoUrl ? await persistUrl(slide.videoUrl) : slide.videoUrl,
        }))
      : post.slides,
  }));
  return { ...profile, profilePicUrl, posts };
}

export function highlightsNeedPersist(stories?: IgStories | null) {
  if (!stories?.highlights.length) return false;
  return stories.highlights.some((hl) => isRemote(hl.coverImageUrl) || (hl.items ?? []).some((it) => isRemote(it.imageUrl)));
}

export async function persistLiveMedia(profile?: IgProfile | null, stories?: IgStories | null) {
  if (profile) await persistAndRewriteProfile(profile);
  if (stories) await persistAndRewriteStories(stories, false);
}
