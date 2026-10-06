import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataSubdir } from "@/lib/server/data-dir.server";

const MAX_RECENT = 12;
const TTL = 7 * 24 * 60 * 60 * 1000;

type Row = { path: string; at: number };
type State = Record<string, Row[]>;

async function statePath() {
  return join(await dataSubdir("visual"), "source-history.json");
}

async function readState(): Promise<State> {
  try {
    const parsed = JSON.parse(await readFile(await statePath(), "utf8")) as State;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeState(state: State) {
  const dst = await statePath();
  const tmp = dst + ".tmp";
  try {
    await writeFile(tmp, JSON.stringify(state), "utf8");
    await rename(tmp, dst);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

function cleanUser(username: string) {
  const user = username.trim().toLowerCase();
  return /^[a-z0-9._-]{1,40}$/.test(user) ? user : "";
}

export async function recentSourcePaths(username: string) {
  const key = cleanUser(username);
  if (!key) return [];
  const state = await readState();
  const now = Date.now();
  return (state[key] || [])
    .filter((row) => row && row.path && now - row.at < TTL)
    .slice(0, MAX_RECENT)
    .map((row) => row.path);
}

export async function rememberSourcePath(username: string, sourcePath: string) {
  const key = cleanUser(username);
  const clean = sourcePath.trim();
  if (!key || !clean) return;
  const state = await readState();
  const now = Date.now();
  const next = [{ path: clean, at: now }, ...(state[key] || []).filter((row) => row.path !== clean)];
  state[key] = next.filter((row) => now - row.at < TTL).slice(0, MAX_RECENT);
  await writeState(state);
}
