import type { IgProfile, IgStories } from "./types";
import { mediaSrc } from "@/lib/utils";
import { apiFetch } from "@/lib/shtora-origin";
import { idbGetMedia, idbPutMedia } from "@/lib/shtora-idb";

const CACHE_NAME = "shtora-media-v2";
const CACHE_NAMES = ["shtora-media-v2", "shtora-media-v1"];
const memory = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

export function peekCachedMedia(proxied: string): string | undefined {
  return memory.get(proxied);
}

export function mediaKey(url: string) {
  if (!url) return "";
  try {
    const parsed = new URL(url, "http://shtora.local");
    const id = parsed.searchParams.get("id");
    if (id) return id;
  } catch {
    /* ignore */
  }
  const tail = url.split("/").pop() || url;
  return tail.split("?")[0] || url;
}

export async function persistChatImage(url: string) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith("/api/chat-media") || url.startsWith("/chat-media/")) return url;
  try {
    const res = await apiFetch("/api/chat-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return url;
    const data = (await res.json()) as { url?: string };
    return typeof data.url === "string" && data.url ? data.url : url;
  } catch {
    return url;
  }
}

export async function stashChatPhoto(id: string, url: string) {
  const keys = [...new Set([id, mediaKey(url), url].filter(Boolean))];
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await new Promise((r) => setTimeout(r, 700 * 2 ** (attempt - 1)));
    try {
      const blob = await getMediaBlob(url);
      if (!blob.size || blob.type.includes("html")) {
        lastErr = new Error("empty");
        continue;
      }
      for (const key of keys) {
        await idbPutMedia(key, blob).catch(() => undefined);
      }
      const obj = URL.createObjectURL(blob);
      for (const key of keys) {
        memory.set(key, obj);
        memory.set(`/chat-media/${key}`, obj);
        memory.set(`/api/chat-media?id=${encodeURIComponent(key)}`, obj);
      }
      memory.set(url, obj);
      if (typeof caches !== "undefined") {
        const cache = await caches.open(CACHE_NAME);
        const headers = { "Content-Type": blob.type || "application/octet-stream" };
        for (const path of keys.flatMap((key) => [`/chat-media/${key}`, `/api/chat-media?id=${encodeURIComponent(key)}`])) {
          await cache.put(absolute(path), new Response(blob, { headers })).catch(() => undefined);
        }
        if (url.startsWith("/")) {
          await cache.put(absolute(url), new Response(blob, { headers: { "Content-Type": blob.type || "application/octet-stream" } })).catch(() => undefined);
        }
      }
      return url.startsWith("/api/chat-media") || url.startsWith("/chat-media/")
        ? url
        : `/api/chat-media?id=${encodeURIComponent(id)}`;
    } catch (err) {
      lastErr = err;
    }
  }
  void lastErr;
  return url;
}

export async function resolveChatImage(url: string) {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  const cached = await readChatPhoto(url);
  if (cached) return cached;
  const key = mediaKey(url);
  if (key) {
    const blob = await idbGetMedia(key);
    if (blob) {
      const obj = URL.createObjectURL(blob);
      memory.set(key, obj);
      memory.set(url, obj);
      return obj;
    }
    const viaApi = `/api/chat-media?id=${encodeURIComponent(key)}`;
    const again = await readChatPhoto(viaApi);
    if (again) return again;
    try {
      const res = await fetch(viaApi, { credentials: "same-origin" });
      if (res.ok) {
        const remote = await res.blob();
        if (remote.size && !remote.type.includes("html")) {
          await idbPutMedia(key, remote).catch(() => undefined);
          const obj = URL.createObjectURL(remote);
          memory.set(key, obj);
          memory.set(url, obj);
          return obj;
        }
      }
    } catch {
      /* keep going */
    }
  }
  if (url.startsWith("/api/chat-media") || url.startsWith("/")) return url;
  return mediaSrc(url) || url;
}

export async function readChatPhoto(key: string) {
  const hit = memory.get(key) || memory.get(absolute(key)) || memory.get(mediaKey(key));
  if (hit) return hit;
  const fromIdb = await idbGetMedia(mediaKey(key) || key);
  if (fromIdb) {
    const obj = URL.createObjectURL(fromIdb);
    memory.set(key, obj);
    memory.set(mediaKey(key), obj);
    return obj;
  }
  if (typeof caches === "undefined") return undefined;
  try {
    const res = await matchAnyCache(key);
    if (!res) return undefined;
    const blob = await res.blob();
    if (!blob.size) return undefined;
    const obj = URL.createObjectURL(blob);
    memory.set(key, obj);
    await idbPutMedia(mediaKey(key) || key, blob).catch(() => undefined);
    return obj;
  } catch {
    return undefined;
  }
}

async function matchAnyCache(url: string): Promise<Response | undefined> {
  if (typeof caches === "undefined") return undefined;
  const abs = absolute(url);
  for (const name of CACHE_NAMES) {
    try {
      const cache = await caches.open(name);
      const hit = await cache.match(abs) || await cache.match(url);
      if (hit) return hit;
    } catch {
      /* next */
    }
  }
  return undefined;
}

function absolute(proxied: string): string {
  if (typeof window === "undefined") return proxied;
  return new URL(proxied, window.location.origin).href;
}

export async function rememberMedia(proxied: string): Promise<string> {
  const hit = memory.get(proxied);
  if (hit) return hit;
  const pending = inflight.get(proxied);
  if (pending) return pending;

  const work = (async () => {
    try {
      if (typeof caches === "undefined") return proxied;
      const cache = await caches.open(CACHE_NAME);
      const abs = absolute(proxied);
      let res = await matchAnyCache(proxied);
      if (!res) {
        res = await fetch(abs, { credentials: "same-origin" });
        if (!res.ok) throw new Error("media " + res.status);
        const type = res.headers.get("content-type") ?? "";
        if (type.startsWith("video/")) return proxied;
        try {
          await cache.put(abs, res.clone());
        } catch {
          /* quota */
        }
      }
      const blob = await res.blob();
      if (!blob.size || blob.type.startsWith("video/")) return proxied;
      const url = URL.createObjectURL(blob);
      memory.set(proxied, url);
      return url;
    } catch {
      return "";
    } finally {
      inflight.delete(proxied);
    }
  })();

  inflight.set(proxied, work);
  return work;
}

export async function getMediaBlob(url: string): Promise<Blob> {
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    const res = await fetch(url);
    const blob = await res.blob();
    if (!blob.size) throw new Error("Пустой файл.");
    return blob;
  }

  const proxied = mediaSrc(url, { proxy: true });
  if (!proxied) throw new Error("Нет ссылки на файл.");

  if (typeof caches !== "undefined") {
    try {
      const hit = await matchAnyCache(proxied);
      if (hit) {
        const blob = await hit.blob();
        if (blob.size > 0 && !blob.type.includes("text/html")) return blob;
      }
    } catch {
      /* ignore */
    }
  }

  const res = await fetch(proxied, { credentials: "same-origin" });
  if (!res.ok) {
    throw new Error("Ссылка Instagram истекла. Нажмите «Обновить», потом сохраните снова.");
  }
  const blob = await res.blob();
  if (!blob.size) throw new Error("Пустой файл.");
  if (blob.type.includes("text/html")) {
    throw new Error("Instagram не отдал медиафайл. Нажмите «Обновить».");
  }
  if (!blob.type.startsWith("video/") && typeof caches !== "undefined") {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(
        absolute(proxied),
        new Response(blob, {
          headers: { "Content-Type": blob.type || "application/octet-stream" },
        }),
      );
    } catch {
      /* quota */
    }
  }
  return blob;
}

export async function prefetchMedia(urls: string[]) {
  const proxied = [
    ...new Set(urls.filter((u) => u.startsWith("/") || u.startsWith("blob:") || u.startsWith("data:"))),
  ];
  let i = 0;
  const workers = Array.from({ length: 6 }, async () => {
    while (i < proxied.length) {
      const next = proxied[i++];
      if (!next || memory.has(next)) continue;
      await rememberMedia(next);
    }
  });
  await Promise.all(workers);
}

export function collectFeedMedia(profile?: IgProfile | null, stories?: IgStories | null): string[] {
  const out: string[] = [];
  if (profile?.profilePicUrl) out.push(profile.profilePicUrl);
  for (const post of profile?.posts ?? []) {
    if (post.displayUrl) out.push(post.displayUrl);
  }
  for (const item of stories?.stories ?? []) {
    if (item.imageUrl) out.push(item.imageUrl);
  }
  return out;
}

export function collectHighlightMedia(stories?: IgStories | null): string[] {
  const out: string[] = [];
  for (const hl of stories?.highlights ?? []) {
    if (hl.coverImageUrl) out.push(hl.coverImageUrl);
    for (const item of hl.items) {
      if (item.imageUrl) out.push(item.imageUrl);
    }
  }
  return out;
}

export async function clearMediaCache() {
  for (const url of memory.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
  memory.clear();
  inflight.clear();
  if (typeof caches !== "undefined") {
    try {
      await caches.delete(CACHE_NAME);
    } catch {
      /* ignore */
    }
  }
}
