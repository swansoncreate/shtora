import { mkdir } from "node:fs/promises";
import { join } from "node:path";

let root = "";

async function tryDir(dir: string) {
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function dataRoot() {
  if (root) return root;
  const candidates = [
    process.env.SHTORA_DATA_DIR,
    "/workspace/data",
    join(process.cwd(), "data"),
    join(process.env.TMPDIR || "/tmp", "shtora-data"),
  ].filter((d): d is string => Boolean(d));
  for (const dir of candidates) {
    try {
      root = await tryDir(dir);
      return root;
    } catch {
      /* next */
    }
  }
  root = "/tmp/shtora-data";
  await mkdir(root, { recursive: true }).catch(() => undefined);
  return root;
}

export async function dataPath(...parts: string[]) {
  const base = await dataRoot();
  if (!parts.length) return base;
  const dir = join(base, ...parts.slice(0, -1));
  if (parts.length > 1) await mkdir(dir, { recursive: true }).catch(() => undefined);
  return join(base, ...parts);
}

export async function dataSubdir(...parts: string[]) {
  const dir = join(await dataRoot(), ...parts);
  await mkdir(dir, { recursive: true });
  return dir;
}
