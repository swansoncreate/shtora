import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataSubdir } from "@/lib/server/data-dir.server";
import type { VisualMemory } from "./types";

const MAX = 240;
const tails = new Map<string, Promise<unknown>>();

function enqueue<T>(username: string, job: () => Promise<T>) {
  const key = username.toLowerCase();
  const prev = tails.get(key) || Promise.resolve();
  const run = prev.then(job, job);
  tails.set(key, run.then(() => undefined, () => undefined));
  return run;
}

function safeUser(raw: string) {
  const user = raw.trim().toLowerCase();
  return /^[a-z0-9._-]{1,40}$/.test(user) ? user : "";
}

async function filePath(username: string) {
  return join(await dataSubdir("visual", "memory"), username.toLowerCase() + ".json");
}

async function readAll(username: string) {
  try {
    const parsed = JSON.parse(await readFile(await filePath(username), "utf8")) as VisualMemory[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

async function writeAll(username: string, rows: VisualMemory[]) {
  const dst = await filePath(username);
  const tmp = dst + ".tmp";
  try {
    await writeFile(tmp, JSON.stringify(rows.slice(0, MAX)), "utf8");
    await rename(tmp, dst);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

export async function saveVisualMemory(row: VisualMemory) {
  const username = safeUser(row.username);
  if (!username || !row.id || !row.imageUrl) throw new Error("bad visual memory");
  return enqueue(username, async () => {
    const prev = await readAll(username);
    const next = [row, ...prev.filter((item) => item.id !== row.id && item.imageUrl !== row.imageUrl)];
    await writeAll(username, next);
    return row;
  });
}

export async function listVisualMemory(username: string, query = "") {
  const user = safeUser(username);
  if (!user) return [] as VisualMemory[];
  const rows = await readAll(user);
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  const tokens = q.split(/\s+/).filter((token) => token.length >= 3);
  return rows
    .map((row) => {
      const blob = [
        row.prompt || "",
        ...(row.tags || []),
        row.scene?.place || "",
        row.scene?.clothes || "",
        row.scene?.activity || "",
        row.scene?.timeContext || "",
      ]
        .join(" ")
        .toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (blob.includes(token) ? 2 : 0), 0);
      return { row, score };
    })
    .sort((a, b) => b.score - a.score || b.row.createdAt - a.row.createdAt)
    .map((item) => item.row);
}

export async function latestVisualMemory(username: string) {
  return (await listVisualMemory(username))[0];
}
