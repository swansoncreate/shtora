import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataSubdir } from "@/lib/server/data-dir.server";
import { persistRemoteImage, persistRemoteVideo, publicMediaUrl } from "./persist.server";

export type StudioItem = {
  id: string;
  kind: "image" | "video";
  url: string;
  urls?: string[];
  from: string;
  at: number;
  prompt?: string;
};

async function indexPath() {
  const dir = await dataSubdir("studio");
  return join(dir, "index.json");
}

export async function readStudioIndex(): Promise<StudioItem[]> {
  try {
    const raw = await readFile(await indexPath(), "utf8");
    const parsed = JSON.parse(raw) as StudioItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && item.id && item.url)
      .map((item) => ({
        ...item,
        url: publicMediaUrl(item.url),
        urls: item.urls?.map(publicMediaUrl),
      }))
      .slice(0, 80);
  } catch {
    return [];
  }
}

async function writeStudioIndex(items: StudioItem[]) {
  await writeFile(await indexPath(), JSON.stringify(items.slice(0, 80), null, 2), "utf8");
}

export async function saveStudioItem(input: {
  url: string;
  kind: "image" | "video";
  from?: string;
  prompt?: string;
  id?: string;
  urls?: string[];
}): Promise<StudioItem> {
  const stored =
    input.kind === "video" ? (await persistRemoteVideo(input.url)) || input.url : (await persistRemoteImage(input.url)) || input.url;
  const extra = input.urls?.length
    ? (
        await Promise.all(
          input.urls
            .filter((u) => u && u !== input.url)
            .slice(0, 8)
            .map((u) => persistRemoteImage(u)),
        )
      ).filter(Boolean)
    : [];
  const urls = extra.length ? [stored, ...extra.filter((u) => u !== stored)] : undefined;
  const item: StudioItem = {
    id: input.id || `${input.kind[0]}-${Date.now()}`,
    kind: input.kind,
    url: stored,
    urls,
    from: (input.from || "").slice(0, 240),
    at: Date.now(),
    prompt: input.prompt?.slice(0, 1200),
  };
  const prev = await readStudioIndex();
  const next = [item, ...prev.filter((row) => row.id !== item.id && row.url !== item.url)].slice(0, 80);
  await writeStudioIndex(next);
  const { slog } = await import("@/lib/server/log.server");
  slog("studio", "save", { id: item.id, kind: item.kind, url: item.url });
  return item;
}

export async function dropStudioItem(id: string) {
  const prev = await readStudioIndex();
  await writeStudioIndex(prev.filter((row) => row.id !== id));
}
