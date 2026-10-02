import { igCache } from "./store";
import { cleanUsername } from "@/lib/utils";
import type { IgProfile, IgStories, IgHighlight } from "./types";

async function engineOf(data: { token?: string; hikerToken?: string; tikhubToken?: string }) {
  const { readServerConfig } = await import("@/lib/server/config");
  const { createEngine } = await import("./engine/runner");
  const config = await readServerConfig();
  const tikhub = String(data.tikhubToken || (config as { tikhubToken?: string } | null)?.tikhubToken || "").trim();
  const hiker = String(data.hikerToken || config?.hikerToken || "").trim();
  const apify = String(data.token || config?.apifyToken || "").trim();
  if (tikhub || hiker || apify) {
    try {
      const { dataRoot } = await import("@/lib/server/data-dir.server");
      const { readFile, writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const path = join(await dataRoot(), "shtora-config.json");
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      let dirty = false;
      if (tikhub && parsed.tikhubToken !== tikhub) {
        parsed.tikhubToken = tikhub;
        dirty = true;
      }
      if (hiker && parsed.hikerToken !== hiker) {
        parsed.hikerToken = hiker;
        dirty = true;
      }
      if (apify && parsed.apifyToken !== apify) {
        parsed.apifyToken = apify;
        dirty = true;
      }
      if (dirty) {
        parsed.updatedAt = new Date().toISOString();
        await writeFile(path, JSON.stringify(parsed), "utf8");
      }
    } catch {
      /* ignore */
    }
  }
  return createEngine({ tikhub, hiker, apify });
}

async function persistAccount(username: string, patch: { profile?: IgProfile; stories?: IgStories }) {
  const { readSnapshot, writeSnapshot } = await import("@/lib/server/snapshots");
  const prev = await readSnapshot(username);
  const next = {
    at: Date.now(),
    profile: patch.profile ? igCache.reconcileProfile(prev?.profile ?? null, patch.profile) : (prev?.profile ?? null),
    stories: patch.stories ? igCache.reconcileStories(prev?.stories ?? null, patch.stories) : (prev?.stories ?? null),
  };
  await writeSnapshot(username, next);
  return next;
}

export async function handleProfile(data: { username: string; token?: string; hikerToken?: string; tikhubToken?: string; force?: boolean }): Promise<IgProfile> {
  const username = cleanUsername(data.username);
  if (!username) throw new Error("Введите ник Instagram.");
  const { readSnapshot } = await import("@/lib/server/snapshots");
  const prev = await readSnapshot(username);
  try {
    const engine = await engineOf(data);
    const profile = await engine.profile(username, Boolean(data.force));
    const rewritten = await import("./persist-media.server").then((m) => m.persistAndRewriteProfile(profile));
    const saved = await persistAccount(username, { profile: rewritten });
    const { slog } = await import("@/lib/server/log.server");
    slog("ig", "profile", { user: username, posts: rewritten.posts?.length ?? 0, force: Boolean(data.force) });
    return saved.profile ?? rewritten;
  } catch (err) {
    const { slog } = await import("@/lib/server/log.server");
    slog("ig", "profile-fail", { user: username, err: err instanceof Error ? err.message : "fail", snap: Boolean(prev?.profile) });
    if (prev?.profile?.username) return prev.profile;
    throw err;
  }
}

export async function handleSnapshot(usernameRaw: string) {
  const username = cleanUsername(usernameRaw);
  if (!username) return null;
  const { readSnapshot } = await import("@/lib/server/snapshots");
  return readSnapshot(username);
}

export async function handleStories(data: { username: string; token?: string; hikerToken?: string; tikhubToken?: string; force?: boolean }): Promise<IgStories> {
  const username = cleanUsername(data.username);
  if (!username) throw new Error("Введите ник Instagram.");
  const { readSnapshot } = await import("@/lib/server/snapshots");
  const prev = await readSnapshot(username);
  if (!data.force && prev?.stories && (prev.stories.highlights.length || prev.stories.stories.length)) {
    const fresh = { ...prev.stories, stories: igCache.liveStories(prev.stories.stories) };
    const { slog } = await import("@/lib/server/log.server");
    slog("ig", "stories", {
      user: username,
      stories: fresh.stories.length,
      hl: fresh.highlights.length,
      cache: true,
    });
    return fresh;
  }
  try {
    const engine = await engineOf(data);
    const stories = await engine.stories(username, Boolean(data.force));
    const rewritten = await import("./persist-media.server").then((m) => m.persistAndRewriteStories(stories, false));
    const saved = await persistAccount(username, { stories: rewritten });
    const live = saved.stories ?? rewritten;
    const { slog } = await import("@/lib/server/log.server");
    slog("ig", "stories", {
      user: username,
      in: stories.highlights?.length ?? 0,
      stories: live.stories?.length ?? 0,
      hl: live.highlights?.length ?? 0,
      force: Boolean(data.force),
      cache: false,
    });
    return live;
  } catch (err) {
    const { slog } = await import("@/lib/server/log.server");
    slog("ig", "stories-fail", { user: username, err: err instanceof Error ? err.message : "fail" });
    if (prev?.stories && (prev.stories.highlights.length || prev.stories.stories.length)) {
      return prev.stories;
    }
    throw err;
  }
}

export async function handleWarm(data: {
  token?: string;
  usernames: string[];
  force?: boolean;
}): Promise<Record<string, { profile?: IgProfile; stories?: IgStories }>> {
  const { fetchManyFromApify } = await import("./apify.server");
  const { readServerConfig } = await import("@/lib/server/config");
  const config = await readServerConfig();
  const token = String(data.token || config?.apifyToken || "").trim();
  const names = data.usernames.map(cleanUsername).filter(Boolean);
  const map = await fetchManyFromApify(names, token, Boolean(data.force));
  const out: Record<string, { profile?: IgProfile; stories?: IgStories }> = {};
  for (const [username, part] of Object.entries(map)) {
    const saved = await persistAccount(username, part);
    out[username] = { profile: saved.profile ?? part.profile, stories: saved.stories ?? part.stories };
    void import("./persist-media.server").then((m) => m.persistLiveMedia(out[username]!.profile ?? null, out[username]!.stories ?? null)).catch(() => undefined);
  }
  return out;
}

export async function handleHighlight(data: { id: string; username?: string; hikerToken?: string; tikhubToken?: string; token?: string }): Promise<IgHighlight> {
  const username = String(data.username || "").replace(/^@/, "").trim().toLowerCase();
  const want = String(data.id || "").replace(/^highlight:/i, "");
  const match = (hl: IgHighlight) =>
    hl.id === data.id || hl.id === want || hl.id.replace(/^highlight:/i, "") === want;
  if (username) {
    const { readSnapshot } = await import("@/lib/server/snapshots");
    const prev = await readSnapshot(username);
    const found = prev?.stories?.highlights.find(match);
    const real = (found?.items ?? []).filter((it) => !String(it.id).endsWith("-cover"));
    if (found && real.length) return { ...found, items: real };
  }
  const { readServerConfig } = await import("@/lib/server/config");
  const config = await readServerConfig();
  const apify = String(data.token || config?.apifyToken || "").trim();
  if (username && apify.startsWith("apify_api_")) {
    try {
      const { fetchStoriesFromApify } = await import("./apify.server");
      const pack = await fetchStoriesFromApify(username, apify, true, true);
      const hit = pack.highlights.find(match);
      if (hit && (hit.items.length > 1 || (hit.items.length === 1 && !String(hit.items[0]?.id).endsWith("-cover")))) {
        return hit;
      }
    } catch {
      /* try other engines */
    }
  }
  const engine = await engineOf(data);
  return engine.highlight(data.id);
}
