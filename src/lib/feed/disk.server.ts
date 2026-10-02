import { randomBytes } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataRoot } from "@/lib/server/data-dir.server";

export type FeedSlide = { id: string; url: string; video?: boolean };
export type FeedDiskCard = {
  id: string;
  username: string;
  at: number;
  slot?: string;
  source: "generated" | "instagram";
  caption: string;
  slides: FeedSlide[];
  liked?: boolean;
};

const MAX_CARDS = 160;
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

function enqueue<T>(id: string, job: () => Promise<T>): Promise<T> {
  const prev = tails.get(id) ?? Promise.resolve();
  const run = prev.then(job, job);
  tails.set(
    id,
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

function cleanSlide(row: unknown, index: number): FeedSlide | null {
  if (!row || typeof row !== "object") return null;
  const slide = row as { id?: unknown; url?: unknown; video?: unknown };
  const url = String(slide.url || "").trim();
  if (!url || url.length > 500 || /[\r\n]/.test(url)) return null;
  const id = String(slide.id || `${index}`).trim().slice(0, 80);
  if (!id) return null;
  return { id, url, ...(slide.video === true ? { video: true } : {}) };
}

function fromLegacy(row: Record<string, unknown>): FeedDiskCard | null {
  const id = String(row.id || "").trim().slice(0, 80);
  const username = safeUser(String(row.username || ""));
  if (!id || !username) return null;
  const slides = Array.isArray(row.slides) ? row.slides.map(cleanSlide).filter((s): s is FeedSlide => Boolean(s)).slice(0, 3) : [];
  if (!slides.length && typeof row.imageUrl === "string" && row.imageUrl.trim()) {
    slides.push({ id, url: row.imageUrl.trim().slice(0, 500) });
  }
  if (!slides.length) return null;
  const source = row.source === "instagram" ? "instagram" : "generated";
  const at = Number(row.at);
  return {
    id,
    username,
    at: Number.isFinite(at) ? at : Date.now(),
    ...(typeof row.slot === "string" && row.slot ? { slot: row.slot.slice(0, 20) } : {}),
    source,
    caption: String(row.caption || "").slice(0, 400),
    slides,
    ...(row.liked === true ? { liked: true } : {}),
  };
}

async function feedPath() {
  return join(await dataRoot(), "feed.json");
}

async function readCards(): Promise<FeedDiskCard[]> {
  try {
    const parsed = JSON.parse(await readFile(await feedPath(), "utf8")) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [];
    return rows.map((row) => (row && typeof row === "object" ? fromLegacy(row as Record<string, unknown>) : null)).filter((row): row is FeedDiskCard => Boolean(row));
  } catch {
    return [];
  }
}

async function writeCards(cards: FeedDiskCard[]) {
  const path = await feedPath();
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(cards.slice(0, MAX_CARDS)), "utf8");
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

export async function listFeed(username?: string) {
  const user = username ? safeUser(username) : "";
  if (username && !user) return { cards: [] as FeedDiskCard[] };
  const cards = await readCards();
  return { cards: user ? cards.filter((card) => card.username === user) : cards };
}

export async function appendFeed(raw: unknown) {
  const card = raw && typeof raw === "object" ? fromLegacy(raw as Record<string, unknown>) : null;
  if (!card) {
    const err = new Error("bad card");
    throw err;
  }
  return enqueue(card.id, () =>
    withFile(async () => {
      const prev = await readCards();
      if (prev.some((row) => row.id === card.id)) return { ok: true as const, id: card.id };
      await writeCards([card, ...prev].slice(0, MAX_CARDS));
      return { ok: true as const, id: card.id };
    }),
  );
}

export async function likeFeed(id: string, on: boolean) {
  const clean = id.trim().slice(0, 80);
  if (!clean) return { ok: true as const };
  return enqueue(clean, () =>
    withFile(async () => {
      const prev = await readCards();
      const next = prev.map((card) => (card.id === clean ? { ...card, liked: on } : card));
      if (next.some((card, i) => card.liked !== prev[i]?.liked)) await writeCards(next);
      return { ok: true as const };
    }),
  );
}
