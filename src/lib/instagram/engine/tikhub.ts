import { normalizeHighlights, normalizeProfile, normalizeStoriesFromRows } from "../normalize";
import type { IgHighlight, IgProfile, IgStories } from "../types";
import type { EngineTokens, InstagramSource } from "./provider";

const BASE = "https://api.tikhub.io";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function unwrap(body: unknown): unknown {
  const o = asRecord(body);
  if (!o) return body;
  return o.data ?? o.result ?? o.response ?? o;
}

function listFrom(body: unknown): unknown[] {
  const inner = unwrap(body);
  if (Array.isArray(inner)) return inner;
  const o = asRecord(inner);
  if (!o) return [];
  for (const key of ["items", "tray", "highlights", "reels", "medias", "stories", "reels_media", "data"]) {
    const v = o[key];
    if (Array.isArray(v) && v.length) return v;
  }
  const reel = asRecord(o.reel);
  if (Array.isArray(reel?.items)) return reel.items as unknown[];
  if (Array.isArray(o.broadcasts)) return [];
  return [];
}

function explain(status: number, msg: string) {
  const text = msg || "";
  if (status === 401 || status === 403) return "TikHub отклонил ключ. Скопируй API Key с user.tikhub.io/dashboard/api.";
  if (status === 402 || /insufficient|does not accept free|requires payment/i.test(text)) {
    return "TikHub: Instagram платный и не ест бесплатные $0.05. Пополни через PayPal на user.tikhub.io (хватит $5–10).";
  }
  if (status === 429) return "TikHub: слишком часто. Подожди минуту.";
  return text || `TikHub HTTP ${status}`;
}

async function tikGet(path: string, token: string, query: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(path, BASE);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  const rec = asRecord(body);
  const code = Number(rec?.code ?? rec?.status_code ?? res.status);
  if (!res.ok || (code && code >= 400)) {
    const detail =
      (typeof rec?.message === "string" && rec.message) ||
      (typeof rec?.message_zh === "string" && rec.message_zh) ||
      (typeof rec?.detail === "string" && rec.detail) ||
      text.slice(0, 280);
    try {
      const { writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { dataRoot } = await import("@/lib/server/data-dir.server");
      await writeFile(
        join(await dataRoot(), "tikhub-debug.json"),
        JSON.stringify({ at: new Date().toISOString(), path, status: res.status, code, detail: detail.slice(0, 500), tokenLen: token.length }, null, 2),
      );
    } catch {
      /* ignore */
    }
    throw new Error(explain(res.status || code, detail));
  }
  return body;
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
  throw last instanceof Error ? last : new Error("TikHub не ответил.");
}

export async function probeTikhub(token: string) {
  const clean = token.replace(/^Bearer\s+/i, "").trim();
  const url = new URL("/api/v1/instagram/web_app/fetch_user_info_by_username", BASE);
  url.searchParams.set("username", "instagram");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${clean}`, accept: "application/json" },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  const rec = asRecord(body);
  return {
    http: res.status,
    code: rec?.code ?? rec?.status_code ?? null,
    message: typeof rec?.message === "string" ? rec.message : text.slice(0, 280),
    ok: res.ok && Number(rec?.code ?? res.status) < 400,
  };
}

export class TikHubSource implements InstagramSource {
  readonly name = "tikhub";

  canRun(tokens: EngineTokens) {
    return tokens.tikhub.length > 8;
  }

  async profile(username: string, tokens: EngineTokens): Promise<IgProfile> {
    const userBody = await firstOk([
      () => tikGet("/api/v1/instagram/web_app/fetch_user_info_by_username", tokens.tikhub, { username }),
      () => tikGet("/api/v1/instagram/v2/fetch_user_info", tokens.tikhub, { username }),
      () => tikGet("/api/v1/instagram/v3/get_user_profile", tokens.tikhub, { username }),
    ]);
    const inner = unwrap(userBody);
    const user = asRecord(asRecord(inner)?.user) ?? asRecord(inner);
    if (!user) throw new Error("TikHub: профиль пустой.");
    const pk = String(user.pk ?? user.id ?? user.user_id ?? "");
    let posts: unknown[] = [];
    try {
      const mediaBody = await firstOk([
        () => tikGet("/api/v1/instagram/v2/fetch_user_posts", tokens.tikhub, pk ? { user_id: pk } : { username }),
        () => tikGet("/api/v1/instagram/v3/get_user_posts", tokens.tikhub, pk ? { user_id: pk } : { username }),
      ]);
      posts = listFrom(mediaBody);
    } catch {
      posts = [];
    }
    const profile = normalizeProfile({ ...user, latestPosts: posts }, username);
    if (!profile.username) throw new Error("TikHub: не удалось прочитать профиль.");
    return profile;
  }

  async stories(username: string, tokens: EngineTokens): Promise<IgStories> {
    let liveStoriesList: IgStories["stories"] = [];
    const liveBody = await firstOk([
      () => tikGet("/api/v1/instagram/v2/fetch_user_stories", tokens.tikhub, { username }),
      () => tikGet("/api/v1/instagram/v3/get_user_stories", tokens.tikhub, { username }),
    ]);
    liveStoriesList = normalizeStoriesFromRows(listFrom(liveBody), username).stories;

    let highlights: IgStories["highlights"] = [];
    try {
      const hlBody = await firstOk([
        () => tikGet("/api/v1/instagram/v2/fetch_user_highlights", tokens.tikhub, { username }),
        () => tikGet("/api/v1/instagram/v3/get_user_highlights", tokens.tikhub, { username }),
      ]);
      const rows = listFrom(hlBody);
      highlights = rows.length ? normalizeHighlights(rows) : [];
    } catch {
      highlights = [];
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
    for (const candidate of [clean, `highlight:${clean}`]) {
      try {
        const body = await firstOk([
          () => tikGet("/api/v1/instagram/v2/fetch_highlight_stories", tokens.tikhub, { highlight_id: candidate }),
          () => tikGet("/api/v1/instagram/v3/get_highlight_stories", tokens.tikhub, { highlight_id: candidate }),
        ]);
        const list = normalizeHighlights(listFrom(body).length ? listFrom(body) : [unwrap(body)]);
        if (list[0]?.items.length || list[0]) return list[0]!;
      } catch (err) {
        last = err;
      }
    }
    throw last instanceof Error ? last : new Error("Хайлайт пустой.");
  }
}
