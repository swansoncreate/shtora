import { normalizeHighlights, normalizeProfile, normalizeStoriesFromRows } from "../normalize";
import type { IgHighlight, IgProfile, IgStories } from "../types";
import type { EngineTokens, InstagramSource } from "./provider";

const BASE = "https://api.hikerapi.com";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function explain(status: number, msg: string) {
  if (status === 401 || status === 403) return "HikerAPI отклонил ключ. Проверь токен в настройках.";
  if (status === 402 || status === 429 || /quota|credit|limit|balance/i.test(msg)) {
    return "HikerAPI: закончились запросы. Пополни баланс на hikerapi.com.";
  }
  return msg || `HikerAPI HTTP ${status}`;
}

async function hikerGet(path: string, token: string, query: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(path, BASE);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString(), {
    headers: { "x-access-key": token, accept: "application/json" },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const rec = asRecord(body);
    const detail =
      (typeof rec?.detail === "string" && rec.detail) ||
      (typeof rec?.message === "string" && rec.message) ||
      (Array.isArray(rec?.detail) ? JSON.stringify(rec.detail).slice(0, 240) : "") ||
      text.slice(0, 240);
    throw new Error(explain(res.status, detail));
  }
  return body;
}

function unwrapUser(body: unknown): Record<string, unknown> | null {
  const o = asRecord(body);
  if (!o) return null;
  return asRecord(o.user) ?? asRecord(asRecord(o.response)?.user) ?? asRecord(o.response) ?? o;
}

function listFrom(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const o = asRecord(body);
  if (!o) return [];
  const inner = o.response ?? o.result ?? o;
  if (Array.isArray(inner)) return inner;
  const rec = asRecord(inner) ?? o;
  for (const key of ["items", "tray", "highlights", "reels", "medias", "stories", "reels_media", "data"]) {
    const v = rec[key];
    if (Array.isArray(v) && v.length) return v;
  }
  const reel = rec.reel ?? rec.story;
  if (Array.isArray(reel)) return reel;
  const reelObj = asRecord(reel);
  if (Array.isArray(reelObj?.items)) return reelObj.items as unknown[];
  return [];
}

async function dump(tag: string, extra: Record<string, unknown>) {
  try {
    const [{ writeFile }, { join }, { dataRoot }] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
      import("@/lib/server/data-dir.server"),
    ]);
    await writeFile(
      join(await dataRoot(), "hiker-debug.json"),
      JSON.stringify({ tag, at: new Date().toISOString(), ...extra }, null, 2),
      "utf8",
    );
  } catch {
    /* ignore */
  }
}

async function firstOk<T>(jobs: Array<() => Promise<T>>): Promise<T> {
  let last: unknown;
  for (const job of jobs) {
    try {
      return await job();
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("HikerAPI не ответил.");
}

export class HikerSource implements InstagramSource {
  readonly name = "hiker";

  canRun(tokens: EngineTokens) {
    return tokens.hiker.length > 8;
  }

  async profile(username: string, tokens: EngineTokens): Promise<IgProfile> {
    const userBody = await firstOk([
      () => hikerGet("/v2/user/by/username", tokens.hiker, { username }),
      () => hikerGet("/v1/user/by/username", tokens.hiker, { username }),
    ]);
    const user = unwrapUser(userBody);
    if (!user) throw new Error("HikerAPI: профиль пустой.");
    const pk = String(user.pk ?? user.id ?? "");
    let posts: unknown[] = [];
    if (pk) {
      try {
        const mediaBody = await firstOk([
          () => hikerGet("/v2/user/medias", tokens.hiker, { user_id: pk }),
          () => hikerGet("/v1/user/medias", tokens.hiker, { user_id: pk, amount: "12" }),
        ]);
        posts = listFrom(mediaBody);
        await dump("medias", {
          username,
          pk,
          count: posts.length,
          top: asRecord(mediaBody) ? Object.keys(asRecord(mediaBody)!) : Array.isArray(mediaBody) ? `array:${mediaBody.length}` : typeof mediaBody,
          sample: posts[0] ? Object.keys(asRecord(posts[0]) ?? {}) : [],
        });
      } catch (err) {
        posts = [];
        await dump("medias-error", { username, pk, error: err instanceof Error ? err.message : String(err) });
      }
    }
    const profile = normalizeProfile({ ...user, latestPosts: posts }, username);
    if (!profile.username) throw new Error("HikerAPI: не удалось прочитать профиль.");
    return profile;
  }

  async stories(username: string, tokens: EngineTokens): Promise<IgStories> {
    let liveStoriesList: IgStories["stories"] = [];
    try {
      const liveBody = await firstOk([
        () => hikerGet("/v2/user/stories/by/username", tokens.hiker, { username }),
        () => hikerGet("/v1/user/stories/by/username", tokens.hiker, { username }),
      ]);
      const storyRows = listFrom(liveBody);
      const live = normalizeStoriesFromRows(storyRows, username);
      liveStoriesList = live.stories;
      await dump("stories", { username, rows: storyRows.length, parsed: liveStoriesList.length });
    } catch (err) {
      await dump("stories-error", { username, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    let highlights: IgStories["highlights"] = [];
    try {
      const hlBody = await firstOk([
        () => hikerGet("/v2/user/highlights/by/username", tokens.hiker, { username }),
        () => hikerGet("/v1/user/highlights/by/username", tokens.hiker, { username }),
      ]);
      const rows = listFrom(hlBody);
      highlights = rows.length ? normalizeHighlights(rows) : [];
      await dump("highlights", { username, rows: rows.length, parsed: highlights.length, titles: highlights.map((h) => h.title) });
    } catch (err) {
      await dump("highlights-error", { username, error: err instanceof Error ? err.message : String(err) });
    }

    return {
      username,
      isPrivate: false,
      isAccessible: true,
      errorMessage: null,
      stories: liveStoriesList,
      highlights,
    };
  }

  async highlight(id: string, tokens: EngineTokens): Promise<IgHighlight> {
    const clean = id.replace(/^highlight:/i, "").trim();
    let last: unknown;
    for (const candidate of [`highlight:${clean}`, clean]) {
      try {
        const body = await firstOk([
          () => hikerGet("/v2/highlight/by/id", tokens.hiker, { id: candidate }),
          () => hikerGet("/v1/highlight/by/id", tokens.hiker, { id: candidate }),
        ]);
        const list = normalizeHighlights(listFrom(body).length ? listFrom(body) : [body]);
        if (list[0]?.items.length) return list[0];
        if (list[0]) return list[0];
      } catch (err) {
        last = err;
      }
    }
    throw last instanceof Error ? last : new Error("Хайлайт пустой.");
  }
}
