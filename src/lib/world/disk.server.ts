import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataRoot } from "@/lib/server/data-dir.server";

export type WorldField = { value: string; at: number; until?: number };
export type WorldSnap = {
  username: string;
  time?: WorldField;
  place?: WorldField;
  activity?: WorldField;
  availability?: WorldField;
  energy?: WorldField;
  mood?: WorldField;
  clothes?: WorldField;
  with?: WorldField;
};
export type WorldEvent = {
  id: string;
  type: string;
  at: number;
  until?: number;
  source: "user" | "her" | "clock" | "feed";
  text: string;
  patch?: Partial<Record<keyof Omit<WorldSnap, "username">, WorldField>>;
};

const PLACE_MS = 6 * 60 * 60 * 1000;
const MOOD_MS = 3 * 60 * 60 * 1000;
const tails = new Map<string, Promise<unknown>>();
let fileTail: Promise<unknown> = Promise.resolve();

function withFile<T>(job: () => Promise<T>): Promise<T> {
  const run = fileTail.then(job, job);
  fileTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function enqueue<T>(username: string, job: () => Promise<T>): Promise<T> {
  const prev = tails.get(username) ?? Promise.resolve();
  const run = prev.then(job, job);
  tails.set(
    username,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

function safeUser(name: string) {
  const clean = name.trim().toLowerCase();
  return /^[a-z0-9._-]{1,40}$/.test(clean) ? clean : "";
}

function field(raw: unknown): WorldField | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as { value?: unknown; at?: unknown; until?: unknown };
  const value = String(row.value || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!value) return undefined;
  const at = Number(row.at);
  const until = Number(row.until);
  return { value, at: Number.isFinite(at) ? at : Date.now(), ...(Number.isFinite(until) && until > 0 ? { until } : {}) };
}

function fresh(key: keyof Omit<WorldSnap, "username">, row: WorldField | undefined, now: number) {
  if (!row?.value) return undefined;
  if (row.until && row.until <= now) return undefined;
  if (!row.until && key === "place" && now - row.at > PLACE_MS) return undefined;
  if (!row.until && key === "mood" && now - row.at > MOOD_MS) return undefined;
  return row;
}

export function expireSnap(snap: WorldSnap, now = Date.now()): WorldSnap {
  const next: WorldSnap = { username: snap.username };
  for (const key of ["time", "place", "activity", "availability", "energy", "mood", "clothes", "with"] as const) {
    const kept = fresh(key, snap[key], now);
    if (kept) next[key] = kept;
  }
  return next;
}

async function worldPath(username: string) {
  return join(await dataRoot(), "world", `${username}.json`);
}

async function eventsPath(username: string) {
  return join(await dataRoot(), "world", `${username}-events.json`);
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown) {
  await mkdir(join(path, ".."), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(value), "utf8");
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

async function readSnap(username: string): Promise<WorldSnap | null> {
  const parsed = await readJson<WorldSnap | null>(await worldPath(username), null);
  if (!parsed || typeof parsed !== "object") return null;
  return expireSnap({ ...parsed, username });
}

async function readEvents(username: string): Promise<WorldEvent[]> {
  const rows = await readJson<unknown>(await eventsPath(username), []);
  return Array.isArray(rows) ? (rows as WorldEvent[]).slice(-200) : [];
}

async function migrateFromThread(username: string): Promise<WorldSnap> {
  const { readDiskThread } = await import("@/lib/chat/disk.server");
  const thread = await readDiskThread(username).catch(() => null);
  const world = thread?.world;
  const at = thread?.updatedAt || Date.now();
  const place = world?.placeRu || world?.place || "";
  const clothes = world?.clothesRu || world?.clothes || "";
  const mood = thread?.mood || "";
  const snap: WorldSnap = { username };
  if (place) snap.place = { value: place.slice(0, 80), at };
  if (clothes) snap.clothes = { value: clothes.slice(0, 80), at };
  if (mood) snap.mood = { value: mood.slice(0, 40), at };
  await writeJson(await worldPath(username), snap);
  if (place || clothes || mood) {
    const events = await readEvents(username);
    events.push({
      id: `mig-${username}`,
      type: "migrate",
      at,
      source: "clock",
      text: "перенос старого мира",
    });
    await writeJson(await eventsPath(username), events.slice(-200));
  }
  return expireSnap(snap);
}

export async function getWorld(username: string) {
  const user = safeUser(username);
  if (!user) return { snap: null, events: [] as WorldEvent[] };
  return enqueue(user, () =>
    withFile(async () => {
      const snap = (await readSnap(user)) || (await migrateFromThread(user));
      return { snap, events: await readEvents(user) };
    }),
  );
}

export async function commitWorld(username: string, patch: Partial<WorldSnap>, event?: Partial<WorldEvent>) {
  const user = safeUser(username);
  if (!user) return { ok: true as const };
  return enqueue(user, () =>
    withFile(async () => {
      const prev = (await readSnap(user)) || { username: user };
      const next: WorldSnap = { ...prev, username: user };
      for (const key of ["time", "place", "activity", "availability", "energy", "mood", "clothes", "with"] as const) {
        const incoming = field(patch[key]);
        if (incoming) next[key] = incoming;
      }
      await writeJson(await worldPath(user), expireSnap(next));
      if (event?.text) {
        const events = await readEvents(user);
        events.push({
          id: String(event.id || randomBytes(4).toString("hex")),
          type: String(event.type || "note").slice(0, 40),
          at: Number(event.at) || Date.now(),
          ...(event.until ? { until: event.until } : {}),
          source: event.source === "user" || event.source === "her" || event.source === "feed" ? event.source : "clock",
          text: String(event.text).slice(0, 200),
        });
        await writeJson(await eventsPath(user), events.slice(-200));
      }
      return { ok: true as const };
    }),
  );
}
