import { firstDatasetItem, normalizeProfile, normalizeStoriesFromRows } from "./normalize";
import type { IgHighlight, IgProfile, IgStories } from "./types";

const APIFY = "https://api.apify.com/v2";
const PROFILE_ACTOR = "apify~instagram-profile-scraper";
const COMBINED_ACTOR = "goat255~instagram-stories-highlights-scraper";
const POLL_MS = 2000;
const MAX_WAIT_MS = 150_000;
const CACHE_TTL_MS = 20 * 60 * 60 * 1000;

type CacheEntry<T> = { at: number; data: T };
const profileCache = new Map<string, CacheEntry<IgProfile>>();
const storiesCache = new Map<string, CacheEntry<IgStories>>();

function cacheEntry<T>(map: Map<string, CacheEntry<T>>, key: string): CacheEntry<T> | undefined {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    map.delete(key);
    return undefined;
  }
  return hit;
}

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  return cacheEntry(map, key)?.data;
}

function cacheSet<T>(map: Map<string, CacheEntry<T>>, key: string, data: T) {
  map.set(key, { at: Date.now(), data });
}

let blockedUntil = 0;

function explainApify(msg: string, status = 0) {
  if (
    status === 402 ||
    /hard limit exceeded|platform-feature-disabled|usage hard limit|monthly usage/i.test(msg)
  ) {
    blockedUntil = Date.now() + 2 * 60 * 1000;
    return "Apify: месячный лимит исчерпан. Пополни баланс на apify.com — без этого новые сторис и хайлайты не подтянуть.";
  }
  if (status === 401 || status === 403) {
    return "Apify отклонил токен. Проверьте его в настройках.";
  }
  return msg;
}

function assertNotBlocked() {
  if (Date.now() < blockedUntil) {
    throw new Error(
      "Apify: месячный лимит исчерпан. Пополни баланс на apify.com — без этого новые сторис и хайлайты не подтянуть.",
    );
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function assertToken(token: string) {
  const t = token.trim();
  if (!t.startsWith("apify_api_")) {
    throw new Error(
      "Неверный Apify-токен. Откройте настройки и вставьте токен, начинающийся с apify_api_.",
    );
  }
  return t;
}

async function apifyJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const nested =
      rec && typeof rec.error === "object" && rec.error
        ? (rec.error as Record<string, unknown>)
        : rec;
    const msg =
      (nested && typeof nested.message === "string" && nested.message) ||
      (typeof rec?.error === "string" && rec.error) ||
      text.slice(0, 280) ||
      `Apify HTTP ${res.status}`;
    throw new Error(explainApify(msg, res.status));
  }
  return body;
}

type ActorRun = {
  id: string;
  status: string;
  statusMessage?: string;
  defaultDatasetId?: string;
};

async function startRun(actorId: string, token: string, input: unknown): Promise<ActorRun> {
  const url = `${APIFY}/acts/${actorId}/runs?token=${encodeURIComponent(token)}&timeout=180`;
  const body = await apifyJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const data = (rec?.data ?? rec) as Record<string, unknown> | undefined;
  if (!data || typeof data.id !== "string") {
    throw new Error("Apify не вернул идентификатор запуска.");
  }
  return {
    id: data.id,
    status: String(data.status ?? "RUNNING"),
    statusMessage: typeof data.statusMessage === "string" ? data.statusMessage : undefined,
    defaultDatasetId: typeof data.defaultDatasetId === "string" ? data.defaultDatasetId : undefined,
  };
}

async function waitForRun(runId: string, token: string): Promise<ActorRun> {
  const started = Date.now();
  while (Date.now() - started < MAX_WAIT_MS) {
    const body = await apifyJson(
      `${APIFY}/actor-runs/${runId}?token=${encodeURIComponent(token)}`,
    );
    const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const data = (rec?.data ?? rec) as Record<string, unknown> | undefined;
    const status = String(data?.status ?? "");
    const run: ActorRun = {
      id: runId,
      status,
      statusMessage: typeof data?.statusMessage === "string" ? data.statusMessage : undefined,
      defaultDatasetId:
        typeof data?.defaultDatasetId === "string" ? data.defaultDatasetId : undefined,
    };
    if (status === "SUCCEEDED") return run;
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(run.statusMessage || `Apify-запуск ${status.toLowerCase()}.`);
    }
    await sleep(POLL_MS);
  }
  throw new Error("Apify не успел собрать данные. Попробуйте ещё раз через минуту.");
}

async function datasetItems(datasetId: string, token: string): Promise<unknown[]> {
  const body = await apifyJson(
    `${APIFY}/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&clean=true`,
  );
  return Array.isArray(body) ? body : [];
}

const actorLocks = new Map<string, Promise<unknown[]>>();

async function runActor(actorId: string, token: string, input: unknown): Promise<unknown[]> {
  assertNotBlocked();
  const lockKey = `${actorId}:${JSON.stringify(input)}`;
  const existing = actorLocks.get(lockKey);
  if (existing) return existing;
  const work = (async () => {
    const started = await startRun(actorId, token, input);
    const done = await waitForRun(started.id, token);
    blockedUntil = 0;
    const datasetId = done.defaultDatasetId;
    if (!datasetId) throw new Error("Apify не вернул набор данных.");
    return datasetItems(datasetId, token);
  })().finally(() => actorLocks.delete(lockKey));
  actorLocks.set(lockKey, work);
  return work;
}

function itemError(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const rec = item as Record<string, unknown>;
  if (typeof rec.error === "string" && rec.error) return rec.error;
  if (typeof rec.errorMessage === "string" && rec.errorMessage) return rec.errorMessage;
  return null;
}

export async function fetchProfileFromApify(username: string, token: string, force = false): Promise<IgProfile> {
  const t = assertToken(token);
  if (!force) {
    const cached = cacheGet(profileCache, `${t}:${username}`);
    if (cached && !cached.private) return cached;
  }

  const items = await runActor(PROFILE_ACTOR, t, {
    usernames: [username],
  });
  if (items.length === 0) {
    throw new Error("Профиль не найден или закрыт.");
  }
  const raw = firstDatasetItem(items);
  const err = itemError(raw);
  if (err) throw new Error(err);
  const profile = normalizeProfile(raw, username);
  if (!profile.username) {
    throw new Error("Не удалось прочитать профиль.");
  }
  cacheSet(profileCache, `${t}:${username}`, profile);
  return profile;
}

async function fetchCombined(token: string, usernames: string[], expandItems = false): Promise<unknown[]> {
  const base = {
    usernames,
    compactOutput: false,
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
  };
  if (expandItems) {
    return runActor(COMBINED_ACTOR, token, {
      ...base,
      includeStories: false,
      includeHighlights: true,
      expandHighlightItems: true,
      maxHighlightsPerUser: 12,
    });
  }
  try {
    return await runActor(COMBINED_ACTOR, token, {
      ...base,
      includeStories: true,
      includeHighlights: true,
      expandHighlightItems: false,
      maxHighlightsPerUser: 24,
    });
  } catch {
    return runActor(COMBINED_ACTOR, token, {
      ...base,
      includeStories: false,
      includeHighlights: true,
      expandHighlightItems: false,
      maxHighlightsPerUser: 24,
    });
  }
}

function rowUsername(raw: unknown, fallback = "") {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const name = String(o?.username ?? o?.userName ?? o?.ownerUsername ?? "").replace(/^@/, "").toLowerCase();
  return name || fallback;
}

function splitStories(rows: unknown[], usernames: string[]): Record<string, IgStories> {
  const groups = new Map<string, unknown[]>();
  for (const name of usernames) groups.set(name.toLowerCase(), []);
  for (const row of rows) {
    const o = row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    if (!o || o.recordType === "runSummary") continue;
    const name = rowUsername(row);
    if (name && groups.has(name)) groups.get(name)!.push(row);
    else if (usernames.length === 1) groups.get(usernames[0]!.toLowerCase())!.push(row);
  }
  const out: Record<string, IgStories> = {};
  for (const name of usernames) {
    const list = groups.get(name.toLowerCase()) ?? [];
    out[name.toLowerCase()] = normalizeStoriesFromRows(list, name);
  }
  return out;
}

export async function fetchStoriesFromApify(
  username: string,
  token: string,
  force = false,
  expandItems = false,
): Promise<IgStories> {
  const t = assertToken(token);
  assertNotBlocked();
  const key = `${t}:${username}`;
  const hit = cacheEntry(storiesCache, key);
  const ttl = 25 * 60 * 1000;
  if (!force && !expandItems && hit?.data && Date.now() - hit.at < ttl) return hit.data;

  let rows: unknown[] = [];
  try {
    rows = await fetchCombined(t, [username], expandItems);
  } catch {
    const cached = cacheGet(storiesCache, key);
    if (cached && (cached.highlights.length || cached.stories.length)) return cached;
    rows = [];
  }
  let stories = splitStories(rows, [username])[username.toLowerCase()] ?? {
    username,
    isPrivate: false,
    isAccessible: true,
    errorMessage: null,
    stories: [],
    highlights: [],
  };
  try {
    const row = rows.find((item) => {
      const o = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
      return o && o.recordType !== "runSummary";
    }) as Record<string, unknown> | undefined;
    const { writeFile } = await import("node:fs/promises");
    const { dataPath } = await import("@/lib/server/data-dir.server");
    await writeFile(
      await dataPath("stories-debug.json"),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          username,
          rows: rows.length,
          status: row?.status ?? null,
          storyCount: row?.storyCount ?? null,
          highlightCount: row?.highlightCount ?? null,
          rawStories: Array.isArray(row?.stories) ? row.stories.length : null,
          rawHighlights: Array.isArray(row?.highlights) ? row.highlights.length : null,
          parsedStories: stories.stories.length,
          parsedHighlights: stories.highlights.length,
          titles: stories.highlights.map((h) => h.title).slice(0, 24),
          error: row?.errorMessage ?? stories.errorMessage,
        },
        null,
        2,
      ),
    );
  } catch {
    /* debug only */
  }
  if (stories.highlights.length < 2 && expandItems) {
    try {
      const extra = await runActor(COMBINED_ACTOR, t, {
        usernames: [username],
        includeStories: false,
        includeHighlights: true,
        expandHighlightItems: false,
        maxHighlightsPerUser: 24,
        compactOutput: false,
        proxyConfiguration: { useApifyProxy: true },
      });
      const onlyHl = splitStories(extra, [username])[username.toLowerCase()];
      if (onlyHl?.highlights.length) {
        const map = new Map(stories.highlights.map((h) => [h.id.replace(/^highlight:/i, ""), h]));
        for (const hl of onlyHl.highlights) map.set(hl.id.replace(/^highlight:/i, ""), hl);
        stories = { ...stories, highlights: [...map.values()], isAccessible: true, errorMessage: null };
      }
    } catch {
      /* keep stories */
    }
  }
  const prev = cacheGet(storiesCache, key);
  if (prev?.highlights.length && !stories.highlights.length) {
    stories = { ...stories, highlights: prev.highlights };
  } else if (prev?.highlights.length && stories.highlights.length) {
    const map = new Map(prev.highlights.map((h) => [h.id.replace(/^highlight:/i, ""), h]));
    for (const h of stories.highlights) {
      const id = h.id.replace(/^highlight:/i, "");
      const old = map.get(id);
      map.set(
        id,
        old
          ? {
              ...h,
              title: h.title || old.title,
              coverImageUrl: h.coverImageUrl || old.coverImageUrl,
              items: h.items.length > 1 ? h.items : old.items.length ? old.items : h.items,
              mediaCount: Math.max(h.mediaCount ?? 0, old.mediaCount ?? 0),
            }
          : h,
      );
    }
    const highlights = stories.highlights.length >= 3 ? stories.highlights : [...map.values()];
    stories = { ...stories, highlights };
  }
  cacheSet(storiesCache, key, stories);
  try {
    const { writeFile } = await import("node:fs/promises");
    const { dataPath } = await import("@/lib/server/data-dir.server");
    await writeFile(
      await dataPath("stories-debug.json"),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          username,
          finalStories: stories.stories.length,
          finalHighlights: stories.highlights.length,
          ids: stories.highlights.map((h) => h.id),
          titles: stories.highlights.map((h) => h.title),
          itemCounts: stories.highlights.map((h) => h.items.length),
        },
        null,
        2,
      ),
    );
  } catch {
    /* debug only */
  }
  return stories;
}

export async function fetchManyFromApify(
  usernames: string[],
  token: string,
  force = false,
): Promise<Record<string, { profile?: IgProfile; stories?: IgStories }>> {
  const t = assertToken(token);
  const names = [...new Set(usernames.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  const out: Record<string, { profile?: IgProfile; stories?: IgStories }> = {};
  const need: string[] = [];
  for (const name of names) {
    const p = cacheGet(profileCache, `${t}:${name}`);
    const s = cacheGet(storiesCache, `${t}:${name}`);
    if (!force && p && s) {
      out[name] = { profile: p, stories: s };
    } else {
      need.push(name);
      if (p) out[name] = { ...out[name], profile: p };
      if (s) out[name] = { ...out[name], stories: s };
    }
  }
  if (!need.length) return out;

  const [profileRows, storyRows] = await Promise.all([
    runActor(PROFILE_ACTOR, t, { usernames: need }).catch(() => [] as unknown[]),
    fetchCombined(t, need).catch(() => [] as unknown[]),
  ]);

  for (const row of profileRows) {
    const profile = normalizeProfile(row, rowUsername(row));
    if (!profile.username) continue;
    const name = profile.username.toLowerCase();
    cacheSet(profileCache, `${t}:${name}`, profile);
    out[name] = { ...out[name], profile };
  }
  const split = splitStories(storyRows, need);
  const missing = need.filter((name) => !split[name]?.highlights.length);
  if (missing.length) {
    try {
      const extra = await runActor(COMBINED_ACTOR, t, {
        usernames: missing,
        includeStories: false,
        includeHighlights: true,
        expandHighlightItems: false,
        maxHighlightsPerUser: 24,
        compactOutput: false,
        proxyConfiguration: { useApifyProxy: true },
      });
      const extraSplit = splitStories(extra, missing);
      for (const name of missing) {
        if (extraSplit[name]?.highlights.length && split[name]) {
          split[name] = { ...split[name]!, highlights: extraSplit[name]!.highlights, isAccessible: true, errorMessage: null };
        }
      }
    } catch {
      /* keep */
    }
  }
  for (const name of need) {
    const stories = split[name];
    if (stories) {
      cacheSet(storiesCache, `${t}:${name}`, stories);
      out[name] = { ...out[name], stories };
    }
  }
  return out;
}
