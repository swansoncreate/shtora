import { getCachedProfile, getCachedStories, isSameLocalDay, liveStories } from "@/lib/instagram/cache";
import type { IgPost, IgStoryItem } from "@/lib/instagram/types";
import { generatedCaption } from "./simulate";
import type { FeedCard } from "./simulate";

export function latestTodayPost(username: string): IgPost | null {
  const posts = getCachedProfile(username)?.data.posts ?? [];
  for (const post of posts) {
    if (!post.displayUrl) continue;
    const ts = post.timestamp ? Date.parse(post.timestamp) : NaN;
    if (Number.isFinite(ts) && isSameLocalDay(ts)) return post;
  }
  return null;
}

export function liveTodayCard(username: string): FeedCard | null {
  const profile = getCachedProfile(username)?.data;
  const post = latestTodayPost(username);
  if (!profile || !post) return null;
  const ts = post.timestamp ? Date.parse(post.timestamp) : Date.now();
  return {
    id: `live-${username}-${post.id}`,
    username: profile.username,
    fullName: profile.fullName || profile.username,
    avatar: profile.profilePicUrl,
    verified: profile.verified,
    caption: generatedCaption(username, post),
    at: Number.isFinite(ts) ? ts : Date.now(),
    post,
    thumb: post.displayUrl,
  };
}

export function liveStoryItems(username: string): IgStoryItem[] {
  return liveStories(getCachedStories(username)?.data.stories);
}
