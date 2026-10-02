import { idbGetMedia, idbGetStudioBlob, idbPutStudioBlob } from "@/lib/shtora-idb";

const STUDIO_CACHE = "shtora-studio-v1";
const MEDIA_CACHE = "shtora-media-v3";
const memory = new Map<string, string>();

function keyOf(id: string) {
  return `/studio-media/${id}`;
}

function chatKey(id: string) {
  return `/api/chat-media?id=${encodeURIComponent(id)}`;
}

function absolute(path: string) {
  if (!path) return path;
  if (path.startsWith("http") || path.startsWith("blob:") || path.startsWith("data:")) return path;
  if (typeof location === "undefined") return path;
  return new URL(path, location.origin).toString();
}

function isMediaBlob(blob: Blob, typeHint = "") {
  const type = (blob.type || typeHint).toLowerCase();
  if (type.startsWith("image/") || type.startsWith("video/")) return blob.size > 32;
  if (type.includes("json") || type.includes("html") || type.includes("text/")) return false;
  return blob.size > 800;
}

function asChatPath(url: string) {
  if (url.startsWith("/chat-media/")) return url;
  try {
    const parsed = new URL(url, "http://shtora.local");
    const id = parsed.searchParams.get("id");
    if (id) return `/chat-media/${encodeURIComponent(id)}`;
  } catch {
    /* ignore */
  }
  return "";
}

function needles(id: string, url = "") {
  const out = new Set<string>();
  if (id) {
    out.add(id);
    out.add(keyOf(id));
    out.add(chatKey(id));
    out.add(`/chat-media/${id}`);
  }
  if (url) {
    out.add(url);
    const path = asChatPath(url);
    if (path) out.add(path);
    try {
      const parsed = new URL(url, "http://shtora.local");
      const q = parsed.searchParams.get("id");
      if (q) {
        out.add(q);
        out.add(chatKey(q));
        out.add(`/chat-media/${q}`);
      }
    } catch {
      /* ignore */
    }
  }
  return [...out].filter(Boolean);
}

async function putBlob(id: string, blob: Blob, url = "") {
  if (!isMediaBlob(blob)) return "";
  const obj = URL.createObjectURL(blob);
  memory.set(id, obj);
  memory.set(keyOf(id), obj);
  await idbPutStudioBlob(id, blob).catch(() => undefined);
  const paths = needles(id, url).map(absolute);
  if (typeof caches === "undefined") return obj;
  try {
    const headers = { "Content-Type": blob.type || "application/octet-stream" };
    for (const name of [MEDIA_CACHE, STUDIO_CACHE]) {
      const cache = await caches.open(name);
      for (const path of paths) {
        await cache.put(path, new Response(blob, { headers })).catch(() => undefined);
      }
    }
  } catch {
    /* quota */
  }
  return obj;
}

async function blobFromCaches(id: string, url: string) {
  if (typeof caches === "undefined") return undefined;
  const want = needles(id, url);
  try {
    const names = await caches.keys();
    for (const name of names) {
      if (!name.startsWith("shtora-")) continue;
      const cache = await caches.open(name);
      for (const needle of want) {
        const hit = (await cache.match(absolute(needle))) || (await cache.match(needle));
        if (!hit || !hit.ok) continue;
        const blob = await hit.blob();
        if (isMediaBlob(blob, hit.headers.get("content-type") || blob.type)) return blob;
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

async function fetchBlob(url: string) {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) return undefined;
  const blob = await res.blob();
  if (!isMediaBlob(blob, res.headers.get("content-type") || "")) return undefined;
  return blob;
}

export async function stashStudioMedia(id: string, url: string) {
  if (!id || !url) return "";
  const hit = memory.get(id);
  if (hit) return hit;
  const local = await idbGetStudioBlob(id);
  if (local?.size) return putBlob(id, local, url);
  try {
    const blob = await fetchBlob(url);
    if (blob) return putBlob(id, blob, url);
  } catch {
    /* try recovery */
  }
  return readStudioMedia(id, url);
}

export async function readStudioMedia(id: string, url: string) {
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  const mem = memory.get(id) || memory.get(keyOf(id));
  if (mem) return mem;
  const fromStudio = await idbGetStudioBlob(id);
  if (fromStudio?.size) return putBlob(id, fromStudio, url);
  const q = (() => {
    try {
      return new URL(url, "http://shtora.local").searchParams.get("id") || "";
    } catch {
      return "";
    }
  })();
  const fromChat = (await idbGetMedia(`studio:${id}`)) || (await idbGetMedia(id)) || (q ? await idbGetMedia(q) : undefined);
  if (fromChat?.size) return putBlob(id, fromChat, url);
  const cached = await blobFromCaches(id, url);
  if (cached) return putBlob(id, cached, url);
  const tries = [url, asChatPath(url)].filter((path, i, all) => path && all.indexOf(path) === i);
  for (const path of tries) {
    try {
      const blob = await fetchBlob(path);
      if (blob) return putBlob(id, blob, path);
    } catch {
      /* next */
    }
  }
  return "";
}

export async function dropStudioMedia(id: string) {
  const prev = memory.get(id);
  if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
  memory.delete(id);
  memory.delete(keyOf(id));
  if (typeof caches === "undefined") return;
  try {
    for (const name of [MEDIA_CACHE, STUDIO_CACHE]) {
      const cache = await caches.open(name);
      for (const path of needles(id, "")) {
        await cache.delete(absolute(path));
        await cache.delete(path);
      }
    }
  } catch {
    /* ignore */
  }
}
