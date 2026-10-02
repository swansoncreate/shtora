import { randomBytes } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataRoot } from "@/lib/server/data-dir.server";

export type StorySeenRow = { username: string; id: string; at: number };

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

function cleanId(id: string) {
  const raw = id.trim().replace(/^s:/, "");
  if (!raw || raw.length > 80 || /[\r\n]/.test(raw)) return "";
  return raw;
}

async function seenPath() {
  return join(await dataRoot(), "story-seen.json");
}

async function readRows(): Promise<StorySeenRow[]> {
  try {
    const parsed = JSON.parse(await readFile(await seenPath(), "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is StorySeenRow =>
        Boolean(row && typeof row === "object" && safeUser(String((row as StorySeenRow).username)) && cleanId(String((row as StorySeenRow).id))),
    );
  } catch {
    return [];
  }
}

async function writeRows(rows: StorySeenRow[]) {
  const path = await seenPath();
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(rows), "utf8");
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

export async function recordStorySeen(username: string, ids: string[]) {
  const user = safeUser(username);
  const incoming = [...new Set(ids.map(cleanId).filter(Boolean))].slice(0, 40);
  if (!user) return { ok: true as const, added: [] as string[] };
  if (!incoming.length) {
    const err = new Error("empty ids");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  return enqueue(user, () =>
    withFile(async () => {
    const prev = await readRows();
    const mine = prev.filter((row) => row.username === user);
    const have = new Set(mine.map((row) => row.id));
    const added = incoming.filter((id) => !have.has(id));
    if (!added.length) return { ok: true as const, added };
    const now = Date.now();
    const nextMine = [...mine, ...added.map((id) => ({ username: user, id, at: now }))].slice(-240);
    const next = [...prev.filter((row) => row.username !== user), ...nextMine];
    await writeRows(next);
    return { ok: true as const, added };
    }),
  );
}

export async function listStorySeen(username?: string) {
  const user = username ? safeUser(username) : "";
  if (username && !user) return { rows: [] as StorySeenRow[] };
  const rows = await readRows();
  return { rows: user ? rows.filter((row) => row.username === user) : rows };
}
