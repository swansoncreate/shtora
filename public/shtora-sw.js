const DB_NAME = "shtora-bg";
const STORE = "kv";
const SHELL = "shtora-shell-v7";
const MEDIA = "shtora-media-v3";
const API = "shtora-api-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = (k) => k === SHELL || k === API;
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("shtora-") && !keep(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "shtora-autosave") event.waitUntil(runAutosave());
});

self.addEventListener("sync", (event) => {
  if (event.tag === "shtora-autosave") event.waitUntil(runAutosave());
});

self.addEventListener("message", (event) => {
  if (event.data === "shtora-autosave") event.waitUntil(runAutosave());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/@") || url.pathname.startsWith("/src/") || url.pathname.includes("node_modules")) {
    return;
  }

  if (
    url.pathname.startsWith("/api/media") ||
    url.pathname.startsWith("/chat-media") ||
    url.pathname.startsWith("/api/chat-media")
  ) {
    return;
  }
  if (url.pathname === "/api/state" || url.pathname.startsWith("/api/tick")) {
    event.respondWith(fetch(req));
    return;
  }
  if (req.mode === "navigate" || req.destination === "document" || req.destination === "script") {
    event.respondWith(fetch(req));
    return;
  }
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) {
      try {
        await cache.put(req, res.clone());
      } catch {
        /* quota */
      }
    }
    return res;
  } catch {
    return hit || Response.error();
  }
}

async function networkFirst(req, name) {
  const cache = await caches.open(name);
  try {
    const res = await fetch(req);
    if (res.ok) {
      try {
        await cache.put(req, res.clone());
      } catch {
        /* quota */
      }
    }
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    if (req.mode === "navigate") {
      const shell = await cache.match("/");
      if (shell) return shell;
    }
    return new Response("Офлайн", { status: 503, statusText: "Offline" });
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(key) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbSet(key, value) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

async function runAutosave() {
  const payload = await idbGet("payload");
  if (!payload || !payload.autoSave || !payload.dropboxToken || !payload.apifyToken) return;
  const names = Array.isArray(payload.favorites) && payload.favorites.length
    ? payload.favorites
    : ["ellissawe", "dashutiya", "sheptnowa", "minsiyaaa"];
  const savedFiles = Array.isArray(payload.savedFiles) ? payload.savedFiles.slice() : [];
  let uploaded = 0;
  let failed = 0;
  let lastError = "";
  for (const username of names) {
    try {
      const res = await fetch("/api/autosave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apifyToken: payload.apifyToken,
          dropboxToken: payload.dropboxToken,
          dropboxRefreshToken: payload.dropboxRefreshToken,
          dropboxAppKey: payload.dropboxAppKey,
          dropboxAppSecret: payload.dropboxAppSecret,
          defaultFolder: payload.defaultFolder,
          accountFolders: payload.accountFolders,
          savedFiles,
          username,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        failed += 1;
        lastError = (data && data.error) || "ошибка";
        continue;
      }
      uploaded += Number(data?.saved || 0);
      failed += Number(data?.failed || 0);
      if (Array.isArray(data?.keys)) {
        for (const key of data.keys) {
          if (key && !savedFiles.includes(key)) savedFiles.push(key);
        }
      }
      if (data?.lastError) lastError = data.lastError;
    } catch (err) {
      failed += 1;
      lastError = err instanceof Error ? err.message : "сеть";
    }
  }
  payload.savedFiles = savedFiles;
  await idbSet("payload", payload);
  const log = `Фон: ${uploaded} файлов${failed ? `, ошибок ${failed}` : ""}${lastError ? ` — ${lastError}` : ""}`;
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: "shtora-autosave-done", keys: savedFiles, log });
  }
}
