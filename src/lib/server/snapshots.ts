import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataSubdir, dataRoot } from "@/lib/server/data-dir.server";
import type { IgProfile, IgStories } from "@/lib/instagram/types";

export type AccountSnapshot = {
  username: string;
  at: number;
  profile: IgProfile | null;
  stories: IgStories | null;
};

async function snapDir() {
  return dataSubdir("snapshots");
}

function safeName(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
}

export async function writeSnapshot(username: string, snap: Omit<AccountSnapshot, "username">) {
  const dir = await snapDir();
  const clean = safeName(username);
  const payload: AccountSnapshot = { username: clean, ...snap };
  await writeFile(join(dir, `${clean}.json`), JSON.stringify(payload), "utf8");
  return payload;
}

export async function readSnapshot(username: string): Promise<AccountSnapshot | null> {
  try {
    const raw = await readFile(join(await snapDir(), `${safeName(username)}.json`), "utf8");
    return JSON.parse(raw) as AccountSnapshot;
  } catch {
    return null;
  }
}

export function slimSnapshot(snap: AccountSnapshot): AccountSnapshot {
  const highlights = snap.stories?.highlights;
  if (!highlights?.length) return snap;
  return {
    ...snap,
    stories: {
      ...snap.stories!,
      highlights: highlights.map((hl) => ({
        id: hl.id,
        title: hl.title,
        coverImageUrl: hl.coverImageUrl || hl.items?.[0]?.imageUrl,
        mediaCount: hl.mediaCount ?? hl.items?.length ?? 0,
        items: [],
      })),
    },
  };
}

export async function listSnapshots(): Promise<AccountSnapshot[]> {
  try {
    const dir = await snapDir();
    const files = await readdir(dir);
    const out: AccountSnapshot[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(dir, file), "utf8");
        const parsed = JSON.parse(raw) as AccountSnapshot;
        if (parsed?.username) out.push(parsed);
      } catch {
        /* skip */
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function writeTickStatus(status: Record<string, unknown>) {
  try {
    const root = await dataRoot();
    await writeFile(join(root, "tick-status.json"), JSON.stringify({ ...status, at: Date.now() }), "utf8");
  } catch {
    /* optional */
  }
}

export async function readTickStatus(): Promise<{ at?: number; saved?: number; lastAutoAt?: number } | null> {
  try {
    const raw = await readFile(join(await dataRoot(), "tick-status.json"), "utf8");
    return JSON.parse(raw) as { at?: number; saved?: number; lastAutoAt?: number };
  } catch {
    return null;
  }
}
