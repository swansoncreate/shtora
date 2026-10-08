import { applyStateSnapshots } from "@/lib/shtora-state";

let inflight: Promise<void> | null = null;

type SeedState = {
  snapshots?: Array<{
    username: string;
    profile?: {
      posts?: Array<{ id: string; displayUrl?: string; caption?: string; timestamp?: string }>;
    } | null;
  }>;
};

export function bootstrapStaticPreview() {
  if (inflight) return inflight;
  inflight = (async () => {
    const base = import.meta.env.BASE_URL || "/";
    const seedUrl = `${base.endsWith("/") ? base : `${base}/`}shtora-seed/state.json`;
    const res = await fetch(seedUrl, { cache: "no-store" });
    if (!res.ok) return;
    const state = (await res.json()) as SeedState;
    const snapshots = Array.isArray(state.snapshots) ? state.snapshots : [];
    applyStateSnapshots(snapshots as Parameters<typeof applyStateSnapshots>[0]);

    const posts = snapshots
      .flatMap((snap) =>
        (snap.profile?.posts ?? [])
          .filter((post) => Boolean(post.displayUrl))
          .map((post) => ({
            id: `seed-${snap.username}-${post.id}`,
            username: snap.username.toLowerCase(),
            imageUrl: post.displayUrl as string,
            caption: (post.caption || "").trim(),
            at: post.timestamp ? Date.parse(post.timestamp) || Date.now() : Date.now(),
            kind: "post" as const,
          })),
      )
      .sort((a, b) => b.at - a.at)
      .slice(0, 72);

    try {
      localStorage.setItem(
        "shtora-feed-v7",
        JSON.stringify({ date: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date()), posts, quiet: {} }),
      );
    } catch {
      /* localStorage unavailable */
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
