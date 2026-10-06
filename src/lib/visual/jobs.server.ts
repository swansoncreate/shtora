import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataSubdir } from "@/lib/server/data-dir.server";
import type { GenerationJob, PhotoIntent, ScenePlan, VisualContext } from "./types";

async function indexPath(username: string) {
  return join(await dataSubdir("visual", "jobs"), username.toLowerCase() + ".json");
}

function userOf(username: string) {
  const user = username.trim().toLowerCase();
  return /^[a-z0-9._-]{1,40}$/.test(user) ? user : "";
}

async function readJobs(username: string): Promise<GenerationJob[]> {
  try {
    const rows = JSON.parse(await readFile(await indexPath(username), "utf8")) as GenerationJob[];
    return Array.isArray(rows) ? rows.slice(0, 160) : [];
  } catch {
    return [];
  }
}

async function writeJobs(username: string, rows: GenerationJob[]) {
  const dst = await indexPath(username);
  const tmp = dst + ".tmp";
  try {
    await writeFile(tmp, JSON.stringify(rows.slice(0, 160)), "utf8");
    await rename(tmp, dst);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

export async function createGenerationJob(input: {
  username: string;
  status?: GenerationJob["status"];
  intent: PhotoIntent;
  sceneId?: string;
  scenePlan?: ScenePlan;
  worldSnapshot?: VisualContext;
  sourcePath?: string;
  sourceImageUrl?: string;
  finalPrompt?: string;
  provider?: string;
  parentId?: string;
}) {
  const username = userOf(input.username);
  if (!username) throw new Error("bad username");
  const now = Date.now();
  return enqueue(username, async () => {
    const job: GenerationJob = {
      ...input,
      username,
      id: randomUUID(),
      status: input.status || "queued",
      createdAt: now,
      updatedAt: now,
    };
    const prev = await readJobs(username);
    await writeJobs(username, [job, ...prev]);
    return job;
  });
}

export async function updateGenerationJob(username: string, id: string, patch: Partial<GenerationJob>) {
  const user = userOf(username);
  if (!user) throw new Error("bad username");
  return enqueue(user, async () => {
    const prev = await readJobs(user);
    const next = prev.map((job) =>
      job.id === id ? { ...job, ...patch, id: job.id, username: user, updatedAt: Date.now() } : job,
    );
    await writeJobs(user, next);
    return next.find((job) => job.id === id);
  });
}

export async function listGenerationJobs(username: string) {
  const user = userOf(username);
  return user ? readJobs(user) : [];
}
