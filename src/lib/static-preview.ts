import { applyStateSnapshots, loadShtoraState } from "@/lib/shtora-state";
import { loadDaily, saveDaily, todayKey, type DailyPost } from "@/lib/feed/daily";

let inflight: Promise<void> | null = null;

/**
 * GitHub Pages has no Shtora API/runtime. Bootstrap the real UI with the
 * repository's published seed so Instagram/profile/stories render normally;
 * server-backed actions remain intentionally unavailable.
 */
export function bootstrapStaticPreview() {
  if (inflight) return inflight;
  inflight = (async () => {
    const state = await loadShtoraState();
    applyStateSnapshots(state.snapshots);

    const current = loadDaily();
    if (current.posts.length > 0) return;

    const posts: DailyPost[] = state.snapshots
      .flatMap((snap) =>
        (snap.profile?.posts ?? [])
          .filter((post) => Boolean(post.displayUrl))
          .map((post) => ({
            id: `seed-${snap.username}-${post.id}`,
            username: snap.username,
            imageUrl: post.displayUrl!,
            caption: post.caption || "",
            at: post.timestamp ? Date.parse(post.timestamp) || Date.now() : Date.now(),
            kind: "post" as const,
          })),
      )
      .sort((a, b) => b.at - a.at)
      .slice(0, 72);

    if (posts.length) {
      saveDaily({ date: todayKey(), posts, quiet: {} });
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
