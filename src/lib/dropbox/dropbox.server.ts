import { IG_FETCH_HEADERS, isAllowedMediaHost } from "@/lib/media-host";
import { explainDropboxError, parseDropboxJson } from "./errors";
import {
  DROPBOX_MAX_BYTES,
  encodeDropboxArg,
  extFromType,
  normalizeDropboxPath,
  normalizeDropboxToken,
  parentDropboxPath,
  withExt,
} from "./paths";
import { isShtoraPhotoTag } from "./tags";

const API = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";

export type DropboxFolder = {
  name: string;
  path: string;
};

export type DropboxAccount = {
  email?: string;
  name?: string;
};

export type DropboxFsEntry = {
  tag: "folder" | "file";
  name: string;
  path: string;
  isImage: boolean;
  isVideo: boolean;
};

export type DropboxMedia = {
  path: string;
  name: string;
  at: number;
  isImage: boolean;
  isVideo: boolean;
};

export async function listDropboxMediaDeep(
  token: string,
  root: string,
  limit = 80,
): Promise<DropboxMedia[]> {
  const t = assertToken(token);
  const clean = normalizeDropboxPath(root);
  const files: DropboxMedia[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  let guard = 0;

  while (hasMore && guard < 24 && files.length < 500) {
    guard += 1;
    const body = cursor
      ? await dropboxJson(`${API}/files/list_folder/continue`, t, { cursor })
      : await dropboxJson(`${API}/files/list_folder`, t, {
          path: clean === "/" ? "" : clean,
          recursive: true,
          include_deleted: false,
          include_mounted_folders: true,
          include_non_downloadable_files: false,
          include_media_info: true,
        });
    const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const raw = Array.isArray(rec?.entries) ? rec.entries : [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      if (item[".tag"] !== "file") continue;
      const name = typeof item.name === "string" ? item.name : "";
      const folderPath =
        typeof item.path_display === "string"
          ? item.path_display
          : typeof item.path_lower === "string"
            ? item.path_lower
            : "";
      if (!name || !folderPath) continue;
      const media =
        item.media_info && typeof item.media_info === "object"
          ? (item.media_info as Record<string, unknown>)
          : null;
      const mediaMeta =
        media?.metadata && typeof media.metadata === "object"
          ? (media.metadata as Record<string, unknown>)
          : null;
      const mediaTag = typeof mediaMeta?.[".tag"] === "string" ? mediaMeta[".tag"] : "";
      const isImage = isImageName(name) || mediaTag === "photo";
      const isVideo = isVideoName(name) || mediaTag === "video";
      if (!isImage && !isVideo) continue;
      const modified =
        typeof item.server_modified === "string"
          ? item.server_modified
          : typeof item.client_modified === "string"
            ? item.client_modified
            : "";
      const at = Date.parse(modified);
      files.push({
        path: folderPath,
        name,
        at: Number.isFinite(at) ? at : 0,
        isImage,
        isVideo,
      });
    }
    hasMore = rec?.has_more === true;
    cursor = typeof rec?.cursor === "string" ? rec.cursor : undefined;
    if (!cursor) hasMore = false;
  }

  files.sort((a, b) => b.at - a.at);
  return files.slice(0, Math.max(12, Math.min(limit, 120)));
}

function assertToken(token: string): string {
  const t = normalizeDropboxToken(token);
  if (t.length < 8) throw new Error("Вставьте токен Dropbox в настройках.");
  return t;
}

function isImageName(name: string) {
  return /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(name);
}

export function isFaceLikelyPath(path: string) {
  const p = path.toLowerCase();
  if (/\/видео\/|\/video\/|_cover|screenshot|screen.?shot/.test(p)) return false;
  return true;
}

function isVideoName(name: string) {
  return /\.(mp4|mov|m4v|webm)$/i.test(name);
}

async function dropboxJson(url: string, token: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? "null" : JSON.stringify(body),
  });
  const text = await res.text();
  const parsed = parseDropboxJson(text);
  if (!res.ok) {
    throw new Error(explainDropboxError(parsed, res.status));
  }
  return parsed;
}

export async function getDropboxAccount(token: string): Promise<DropboxAccount> {
  const t = assertToken(token);
  const body = await dropboxJson(`${API}/users/get_current_account`, t, undefined);
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const nameObj =
    rec?.name && typeof rec.name === "object" ? (rec.name as Record<string, unknown>) : null;
  return {
    email: typeof rec?.email === "string" ? rec.email : undefined,
    name: typeof nameObj?.display_name === "string" ? nameObj.display_name : undefined,
  };
}

export async function listDropboxEntries(
  token: string,
  path: string,
): Promise<{ entries: DropboxFsEntry[]; path: string }> {
  const t = assertToken(token);
  const clean = normalizeDropboxPath(path);
  const entries: DropboxFsEntry[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  let guard = 0;

  while (hasMore && guard < 12) {
    guard += 1;
    const body = cursor
      ? await dropboxJson(`${API}/files/list_folder/continue`, t, { cursor })
      : await dropboxJson(`${API}/files/list_folder`, t, {
          path: clean === "/" ? "" : clean,
          recursive: false,
          include_deleted: false,
          include_mounted_folders: true,
          include_non_downloadable_files: false,
          include_media_info: true,
        });
    const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const raw = Array.isArray(rec?.entries) ? rec.entries : [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const tag = item[".tag"] === "folder" ? "folder" : item[".tag"] === "file" ? "file" : "";
      if (!tag) continue;
      const name = typeof item.name === "string" ? item.name : "";
      const folderPath =
        typeof item.path_display === "string"
          ? item.path_display
          : typeof item.path_lower === "string"
            ? item.path_lower
            : "";
      if (!name || !folderPath) continue;
      const media =
        item.media_info && typeof item.media_info === "object"
          ? (item.media_info as Record<string, unknown>)
          : null;
      const mediaMeta =
        media?.metadata && typeof media.metadata === "object"
          ? (media.metadata as Record<string, unknown>)
          : null;
      const mediaTag = typeof mediaMeta?.[".tag"] === "string" ? mediaMeta[".tag"] : "";
      const isImage = tag === "file" && (isImageName(name) || mediaTag === "photo");
      const isVideo = tag === "file" && (isVideoName(name) || mediaTag === "video");
      entries.push({
        tag,
        name,
        path: folderPath,
        isImage,
        isVideo,
      });
    }
    hasMore = rec?.has_more === true;
    cursor = typeof rec?.cursor === "string" ? rec.cursor : undefined;
    if (!cursor) hasMore = false;
  }

  entries.sort((a, b) => {
    if (a.tag !== b.tag) return a.tag === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "ru");
  });
  return { entries, path: clean === "/" ? "/" : clean };
}

export async function listDropboxFolders(
  token: string,
  path: string,
): Promise<{
  folders: DropboxFolder[];
  path: string;
}> {
  const listed = await listDropboxEntries(token, path);
  return {
    folders: listed.entries
      .filter((entry) => entry.tag === "folder")
      .map((entry) => ({ name: entry.name, path: entry.path })),
    path: listed.path === "/" ? "" : listed.path,
  };
}

export async function ensureDropboxFolder(token: string, path: string): Promise<string> {
  const t = assertToken(token);
  const clean = normalizeDropboxPath(path);
  if (clean === "/") return clean;
  const parts = clean.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    try {
      await dropboxJson(`${API}/files/create_folder_v2`, t, {
        path: current,
        autorename: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (
        message.includes("conflict") ||
        message.includes("уже есть") ||
        message.toLowerCase().includes("already")
      ) {
        continue;
      }
      throw err;
    }
  }
  return clean;
}

export async function uploadBytesToDropbox(opts: {
  token: string;
  destPath: string;
  bytes: ArrayBuffer;
  contentType?: string;
  sourceUrl?: string;
}): Promise<{ path: string; bytes: number }> {
  const t = assertToken(opts.token);
  if (opts.bytes.byteLength > DROPBOX_MAX_BYTES) {
    throw new Error("Файл слишком большой для загрузки в Dropbox.");
  }
  const dest = withExt(
    opts.destPath,
    extFromType(opts.contentType ?? "", opts.sourceUrl ?? opts.destPath),
  );
  const folder = parentDropboxPath(dest);
  if (folder !== "/") {
    await ensureDropboxFolder(t, folder);
  }

  const payload = Buffer.from(new Uint8Array(opts.bytes));
  const res = await fetch(`${CONTENT}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "text/plain; charset=dropbox-cors-hack",
      "Dropbox-API-Arg": encodeDropboxArg({
        path: dest,
        mode: { ".tag": "overwrite" },
        mute: true,
      }),
    },
    body: payload,
  });
  const text = await res.text();
  const parsed = parseDropboxJson(text);
  if (!res.ok) {
    console.warn("dropbox upload", res.status, dest, text.slice(0, 400));
    throw new Error(explainDropboxError(parsed, res.status));
  }
  const rec = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  const path =
    typeof rec?.path_display === "string"
      ? rec.path_display
      : typeof rec?.path_lower === "string"
        ? rec.path_lower
        : dest;
  return { path, bytes: opts.bytes.byteLength };
}

export async function uploadMediaToDropbox(opts: {
  token: string;
  destPath: string;
  mediaUrl: string;
}): Promise<{ path: string; bytes: number }> {
  const t = assertToken(opts.token);
  let target: URL;
  try {
    target = new URL(opts.mediaUrl);
  } catch {
    throw new Error("Некорректная ссылка на медиа.");
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new Error("Некорректная ссылка на медиа.");
  }
  if (!isAllowedMediaHost(target.hostname)) {
    throw new Error("Этот хост нельзя скачивать.");
  }

  const media = await fetch(target.toString(), {
    headers: IG_FETCH_HEADERS,
    redirect: "follow",
  });
  if (!media.ok) {
    throw new Error("Ссылка Instagram истекла. Нажмите «Обновить», потом сохраните снова.");
  }
  const length = Number(media.headers.get("content-length") ?? "0");
  if (length > DROPBOX_MAX_BYTES) {
    throw new Error("Файл слишком большой для загрузки в Dropbox.");
  }
  const buffer = await media.arrayBuffer();
  if (buffer.byteLength > DROPBOX_MAX_BYTES) {
    throw new Error("Файл слишком большой для загрузки в Dropbox.");
  }
  const contentType = media.headers.get("content-type") ?? "application/octet-stream";
  return uploadBytesToDropbox({
    token: t,
    destPath: opts.destPath,
    bytes: buffer,
    contentType,
    sourceUrl: target.toString(),
  });
}

export async function getDropboxThumbnails(
  token: string,
  paths: string[],
  size: "w256h256" | "w640h480" | "w1024h768" = "w256h256",
): Promise<{ path: string; thumbnail: string }[]> {
  const t = assertToken(token);
  const unique = [...new Set(paths.filter(Boolean))].slice(0, 100);
  const fromBatch = await thumbnailBatch(t, unique, size);
  if (fromBatch.length) return fromBatch;
  return thumbnailOneByOne(t, unique);
}

async function thumbnailBatch(
  token: string,
  paths: string[],
  size: "w256h256" | "w640h480" | "w1024h768" = "w256h256",
): Promise<{ path: string; thumbnail: string }[]> {
  const out: { path: string; thumbnail: string }[] = [];
  for (let i = 0; i < paths.length; i += 25) {
    const chunk = paths.slice(i, i + 25);
    const hosts = [CONTENT, API];
    let items: unknown[] | null = null;
    for (const host of hosts) {
      try {
        const res = await fetch(`${host}/files/get_thumbnail_batch`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            entries: chunk.map((filePath) => ({
              path: filePath,
              format: "jpeg",
              size,
              mode: "bestfit",
            })),
          }),
        });
        const text = await res.text();
        const parsed = parseDropboxJson(text);
        if (!res.ok) continue;
        const rec = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
        items = Array.isArray(rec?.entries) ? rec.entries : [];
        break;
      } catch {
        items = null;
      }
    }
    if (!items) continue;
    items.forEach((item, index) => {
      const requested = chunk[index];
      if (!requested || !item || typeof item !== "object") return;
      const row = item as Record<string, unknown>;
      if (row[".tag"] !== "success") return;
      const thumb = typeof row.thumbnail === "string" ? row.thumbnail : "";
      if (!thumb) return;
      out.push({ path: requested, thumbnail: `data:image/jpeg;base64,${thumb}` });
    });
  }
  return out;
}

async function thumbnailOneByOne(
  token: string,
  paths: string[],
): Promise<{ path: string; thumbnail: string }[]> {
  const out: { path: string; thumbnail: string }[] = [];
  const queue = paths.slice(0, 60);
  let i = 0;
  async function worker() {
    while (i < queue.length) {
      const filePath = queue[i++];
      if (!filePath) continue;
      try {
        const res = await fetch(`${CONTENT}/files/get_thumbnail_v2`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Dropbox-API-Arg": encodeDropboxArg({
              resource: { ".tag": "path", path: filePath },
              format: "jpeg",
              size: "w256h256",
              mode: "strict",
            }),
          },
        });
        if (!res.ok) continue;
        const bytes = await res.arrayBuffer();
        if (!bytes.byteLength || bytes.byteLength > 2_000_000) continue;
        out.push({
          path: filePath,
          thumbnail: `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`,
        });
      } catch {
        /* skip */
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out;
}

export async function latestDropboxImageDataUrl(token: string, folder: string, skip = 0, seed?: string) {
  const found = await pickDropboxImageSource(token, folder, { skip, seed });
  return found?.image;
}

export async function pickDropboxImageSource(
  token: string,
  folder: string,
  opts: { skip?: number; seed?: string; excludePaths?: string[] } = {},
) {
  const t = assertToken(token);
  const clean = normalizeDropboxPath(folder);
  if (!clean || clean === "/") return undefined;
  const tagged = await taggedDropboxImages(t, clean);
  if (!tagged.length) return undefined;

  const excluded = new Set((opts.excludePaths || []).map((p) => p.trim().toLowerCase()).filter(Boolean));
  const faces = tagged.filter((f) => isFaceLikelyPath(f.path));
  const pool = faces.length ? faces : tagged.filter((f) => !/_cover|\/видео\/|\/video\//i.test(f.path));
  const usable = pool.length ? pool : tagged;
  const filtered = usable.filter((f) => !excluded.has(f.path.toLowerCase()));
  const list = filtered.length ? filtered : usable;
  const shuffled = opts.seed ? seededShuffle(list, opts.seed) : [...list].sort((a, b) => b.at.localeCompare(a.at));
  const start = opts.seed ? 0 : Math.abs(opts.skip || 0) % shuffled.length;
  const tries = Math.min(shuffled.length, 16);
  for (let i = 0; i < tries; i += 1) {
    const pick = shuffled[(start + i) % shuffled.length];
    if (!pick) continue;
    const thumb = await dropboxJpegThumb(t, pick.path);
    if (thumb) return { image: thumb, path: pick.path, at: pick.at };
  }
  return undefined;
}

function seededShuffle<T>(list: T[], seed: string) {
  const out = [...list];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  for (let i = out.length - 1; i > 0; i -= 1) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const j = Math.abs(h) % (i + 1);
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

type ListedImage = { path: string; at: string };

const TAG_TTL_MS = 2 * 60 * 1000;
const tagCache = new Map<string, { tags: string[]; at: number }>();
const taggedPoolCache = new Map<string, { files: ListedImage[]; at: number }>();

function tagTextOf(tag: unknown) {
  if (!tag || typeof tag !== "object") return "";
  const rec = tag as Record<string, unknown>;
  if (typeof rec.tag_text === "string") return rec.tag_text;
  const nested = rec.user_generated_tag;
  if (nested && typeof nested === "object" && typeof (nested as Record<string, unknown>).tag_text === "string") {
    return (nested as Record<string, unknown>).tag_text as string;
  }
  return "";
}

function rememberTags(path: string, tags: string[], at: number) {
  tagCache.set(path.toLowerCase(), { tags, at });
}

async function tagsForPaths(token: string, paths: string[]) {
  const now = Date.now();
  const result = new Map<string, string[]>();
  const pending: string[] = [];
  for (const path of paths) {
    const hit = tagCache.get(path.toLowerCase());
    if (hit && now - hit.at < TAG_TTL_MS) result.set(path.toLowerCase(), hit.tags);
    else pending.push(path);
  }
  const chunks: string[][] = [];
  for (let i = 0; i < pending.length; i += 50) chunks.push(pending.slice(i, i + 50));
  let cursor = 0;
  async function worker() {
    while (cursor < chunks.length) {
      const chunk = chunks[cursor];
      cursor += 1;
      if (!chunk?.length) continue;
      const body = await dropboxJson(`${API}/files/tags/get`, token, { paths: chunk });
      const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
      const rows = Array.isArray(rec?.paths_to_tags) ? rec.paths_to_tags : [];
      const seen = new Set<string>();
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const item = row as Record<string, unknown>;
        const path = typeof item.path === "string" ? item.path : "";
        if (!path) continue;
        const tags = Array.isArray(item.tags) ? item.tags.map(tagTextOf).filter(Boolean) : [];
        seen.add(path.toLowerCase());
        rememberTags(path, tags, now);
        result.set(path.toLowerCase(), tags);
      }
      for (const path of chunk) {
        const key = path.toLowerCase();
        if (seen.has(key)) continue;
        rememberTags(path, [], now);
        result.set(key, []);
      }
    }
  }
  if (chunks.length) await Promise.all([worker(), worker(), worker(), worker()]);
  return result;
}

async function taggedDropboxImages(token: string, folder: string) {
  const key = folder.toLowerCase();
  const hit = taggedPoolCache.get(key);
  if (hit && Date.now() - hit.at < TAG_TTL_MS) return hit.files;
  const files = await collectDropboxImages(token, folder, 1200);
  const tags = await tagsForPaths(
    token,
    files.map((file) => file.path),
  );
  const tagged = files.filter((file) => (tags.get(file.path.toLowerCase()) || []).some(isShtoraPhotoTag));
  taggedPoolCache.set(key, { files: tagged, at: Date.now() });
  return tagged;
}

function usablePhotoPath(path: string) {
  const name = path.split("/").pop() || path;
  return isImageName(name) && !/\.heic$/i.test(name);
}

function cacheShtoraMark(path: string, tagged: boolean) {
  const key = path.toLowerCase();
  const prev = tagCache.get(key)?.tags ?? [];
  const next = tagged
    ? [...new Set([...prev.map((tag) => tag.toLowerCase()), "shtora"])]
    : prev.filter((tag) => tag.toLowerCase() !== "shtora");
  tagCache.set(key, { tags: next, at: Date.now() });
}

export async function readShtoraPhotoMarks(token: string, paths: string[]) {
  const t = assertToken(token);
  const list = [...new Set(paths.map((path) => path.trim()).filter(usablePhotoPath))].slice(0, 200);
  if (!list.length) return { files: [] as { path: string; tagged: boolean }[] };
  const tags = await tagsForPaths(t, list);
  return {
    files: list.map((path) => ({
      path,
      tagged: (tags.get(path.toLowerCase()) || []).some(isShtoraPhotoTag),
    })),
  };
}

export async function setShtoraPhotoMarks(token: string, paths: string[], tagged: boolean) {
  const t = assertToken(token);
  const list = [...new Set(paths.map((path) => path.trim()).filter(usablePhotoPath))].slice(0, 40);
  if (!list.length) return { done: 0, failed: 0, error: "" };
  let cursor = 0;
  let done = 0;
  let failed = 0;
  let error = "";
  async function worker() {
    while (cursor < list.length) {
      const path = list[cursor];
      cursor += 1;
      if (!path) continue;
      try {
        await dropboxJson(`${API}/files/tags/${tagged ? "add" : "remove"}`, t, {
          path,
          tag_text: "shtora",
        });
        cacheShtoraMark(path, tagged);
        done += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (!tagged && /tag_not_present/i.test(msg)) {
          cacheShtoraMark(path, false);
          done += 1;
          continue;
        }
        failed += 1;
        if (!error) error = msg;
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  taggedPoolCache.clear();
  if (!done && error) throw new Error(error);
  return { done, failed, error };
}

async function collectDropboxImages(token: string, folder: string, limit = 200) {
  const files: { path: string; at: string }[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  let guard = 0;
  while (hasMore && guard < 40 && files.length < limit) {
    guard += 1;
    const body = cursor
      ? await dropboxJson(`${API}/files/list_folder/continue`, token, { cursor })
      : await dropboxJson(`${API}/files/list_folder`, token, {
          path: folder === "/" ? "" : folder,
          recursive: true,
          include_deleted: false,
          include_mounted_folders: true,
          include_non_downloadable_files: false,
        });
    const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const raw = Array.isArray(rec?.entries) ? rec.entries : [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      if (item[".tag"] !== "file") continue;
      const name = typeof item.name === "string" ? item.name : "";
      const path =
        typeof item.path_display === "string"
          ? item.path_display
          : typeof item.path_lower === "string"
            ? item.path_lower
            : "";
      if (!path || !isImageName(name) || /\.heic$/i.test(name)) continue;
      const at =
        typeof item.server_modified === "string"
          ? item.server_modified
          : typeof item.client_modified === "string"
            ? item.client_modified
            : "";
      files.push({ path, at });
    }
    hasMore = rec?.has_more === true;
    cursor = typeof rec?.cursor === "string" ? rec.cursor : undefined;
    if (!cursor) hasMore = false;
  }
  return files;
}

async function listImageFiles(token: string, folder: string) {
  const files: { path: string; at: string }[] = [];
  const folders: string[] = [];
  try {
    const body = await dropboxJson(`${API}/files/list_folder`, token, {
      path: folder === "/" ? "" : folder,
      recursive: false,
      include_deleted: false,
      include_mounted_folders: false,
      include_non_downloadable_files: false,
    });
    const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const raw = Array.isArray(rec?.entries) ? rec.entries : [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const name = typeof item.name === "string" ? item.name : "";
      const path =
        typeof item.path_display === "string"
          ? item.path_display
          : typeof item.path_lower === "string"
            ? item.path_lower
            : "";
      if (!path) continue;
      if (item[".tag"] === "folder") {
        folders.push(path);
        continue;
      }
      if (item[".tag"] !== "file" || !isImageName(name) || /\.heic$/i.test(name)) continue;
      const at =
        typeof item.server_modified === "string"
          ? item.server_modified
          : typeof item.client_modified === "string"
            ? item.client_modified
            : "";
      files.push({ path, at });
    }
  } catch {
    /* missing folder */
  }
  return { files, folders };
}

async function dropboxJpegThumb(token: string, path: string) {
  try {
    const res = await fetch(`${CONTENT}/files/get_thumbnail_v2`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": encodeDropboxArg({
          resource: { ".tag": "path", path },
          format: "jpeg",
          size: "w1024h768",
          mode: "bestfit",
        }),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return undefined;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < 32 || bytes.byteLength > 1_500_000) return undefined;
    return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return undefined;
  }
}

export async function getDropboxTemporaryLink(
  token: string,
  path: string,
): Promise<{ link: string; path: string }> {
  const t = assertToken(token);
  const clean = normalizeDropboxPath(path);
  const body = await dropboxJson(`${API}/files/get_temporary_link`, t, { path: clean });
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const link = typeof rec?.link === "string" ? rec.link : "";
  if (!link) throw new Error("Dropbox не дал ссылку на файл.");
  return { link, path: clean };
}

export async function downloadDropboxFile(
  token: string,
  path: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const t = assertToken(token);
  const clean = normalizeDropboxPath(path);
  const res = await fetch(`${CONTENT}/files/download`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t}`,
      "Dropbox-API-Arg": encodeDropboxArg({ path: clean }),
    },
  });
  if (res.ok) {
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > DROPBOX_MAX_BYTES) throw new Error("Файл слишком большой.");
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    return { bytes, contentType };
  }
  const { link } = await getDropboxTemporaryLink(t, clean);
  const viaLink = await fetch(link, { redirect: "follow" });
  if (!viaLink.ok) {
    const text = await res.text();
    throw new Error(explainDropboxError(parseDropboxJson(text), res.status));
  }
  const bytes = await viaLink.arrayBuffer();
  if (bytes.byteLength > DROPBOX_MAX_BYTES) throw new Error("Файл слишком большой.");
  const contentType = viaLink.headers.get("content-type") || "image/jpeg";
  return { bytes, contentType };
}

export async function deleteDropboxPath(token: string, path: string) {
  const t = assertToken(token);
  const clean = normalizeDropboxPath(path);
  if (clean === "/") throw new Error("Нельзя удалить корень.");
  await dropboxJson(`${API}/files/delete_v2`, t, { path: clean });
  return { path: clean };
}

export async function deleteDropboxPaths(token: string, paths: string[]) {
  const unique = pruneNested(paths).slice(0, 40);
  let done = 0;
  let failed = 0;
  let error = "";
  for (const path of unique) {
    try {
      await deleteDropboxPath(token, path);
      done += 1;
    } catch (err) {
      failed += 1;
      if (!error) error = err instanceof Error ? err.message : "Не удалилось";
    }
  }
  return { done, failed, error };
}

export async function moveDropboxPaths(token: string, from: string[], toFolder: string) {
  const destDir = normalizeDropboxPath(toFolder);
  const unique = pruneNested(from)
    .filter((src) => {
      const clean = normalizeDropboxPath(src);
      return clean !== destDir && !destDir.startsWith(`${clean}/`);
    })
    .slice(0, 40);
  let done = 0;
  let failed = 0;
  let error = "";
  for (const path of unique) {
    try {
      await moveDropboxPath(token, path, destDir);
      done += 1;
    } catch (err) {
      failed += 1;
      if (!error) error = err instanceof Error ? err.message : "Не переместилось";
    }
  }
  return { done, failed, error };
}

function pruneNested(paths: string[]) {
  const cleaned = [...new Set(paths.map(normalizeDropboxPath).filter((p) => p && p !== "/"))].sort(
    (a, b) => a.length - b.length,
  );
  const keep: string[] = [];
  for (const path of cleaned) {
    if (keep.some((parent) => path === parent || path.startsWith(`${parent}/`))) continue;
    keep.push(path);
  }
  return keep;
}

export async function moveDropboxPath(token: string, from: string, toFolder: string) {
  const t = assertToken(token);
  const src = normalizeDropboxPath(from);
  const destDir = normalizeDropboxPath(toFolder);
  const name = src.split("/").pop() || "file";
  if (!name || src === "/") throw new Error("Нечего перемещать.");
  const dest = destDir === "/" ? `/${name}` : `${destDir}/${name}`;
  if (destDir !== "/") await ensureDropboxFolder(t, destDir);
  const body = await dropboxJson(`${API}/files/move_v2`, t, {
    from_path: src,
    to_path: dest,
    autorename: true,
  });
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const meta = rec?.metadata && typeof rec.metadata === "object" ? (rec.metadata as Record<string, unknown>) : rec;
  const path =
    typeof meta?.path_display === "string"
      ? meta.path_display
      : typeof meta?.path_lower === "string"
        ? meta.path_lower
        : dest;
  return { path };
}
