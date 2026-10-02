import { createHash } from "node:crypto";
import { readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataSubdir } from "@/lib/server/data-dir.server";

const MAX_FILES = 1600;

export function mediaDiskId(url: string) {
  try {
    if (/^[a-f0-9]{40}$/i.test(url)) return url.toLowerCase();
    const parsed = new URL(url, "https://shtora.local");
    const path = decodeURIComponent(parsed.pathname).replace(/\/+$/, "");
    const file = path.split("/").filter(Boolean).pop() || path;
    return createHash("sha1").update(file).digest("hex");
  } catch {
    return createHash("sha1").update(url).digest("hex");
  }
}

async function dir() {
  return dataSubdir("ig-media");
}

export async function readDiskMediaById(id: string): Promise<{ buf: Buffer; mime: string } | null> {
  const safe = id.replace(/[^a-f0-9]/gi, "");
  if (safe.length !== 40) return null;
  try {
    const base = await dir();
    const metaRaw = await readFile(join(base, `${safe}.json`), "utf8").catch(() => "{}");
    const meta = JSON.parse(metaRaw) as { mime?: string };
    const buf = await readFile(join(base, `${safe}.bin`));
    if (!buf.length) return null;
    return { buf, mime: meta.mime || "image/jpeg" };
  } catch {
    return null;
  }
}

export async function readDiskMedia(url: string): Promise<{ buf: Buffer; mime: string } | null> {
  return readDiskMediaById(mediaDiskId(url));
}

export async function writeDiskMedia(url: string, buf: Buffer, mime: string) {
  if (!buf.length || buf.length > 40 * 1024 * 1024) return "";
  try {
    const base = await dir();
    const id = mediaDiskId(url);
    await writeFile(join(base, `${id}.bin`), buf);
    await writeFile(join(base, `${id}.json`), JSON.stringify({ mime, at: Date.now(), url: url.slice(0, 300) }));
    await evict(base);
    return id;
  } catch {
    return "";
  }
}

async function evict(base: string) {
  try {
    const names = (await readdir(base)).filter((n) => n.endsWith(".bin"));
    if (names.length <= MAX_FILES) return;
    const rows = await Promise.all(
      names.map(async (name) => {
        const s = await stat(join(base, name)).catch(() => null);
        return { name, at: s?.mtimeMs ?? 0 };
      }),
    );
    rows.sort((a, b) => a.at - b.at);
    for (const row of rows.slice(0, names.length - MAX_FILES)) {
      await unlink(join(base, row.name)).catch(() => undefined);
      await unlink(join(base, row.name.replace(/\.bin$/, ".json"))).catch(() => undefined);
    }
  } catch {
    /* ignore */
  }
}
