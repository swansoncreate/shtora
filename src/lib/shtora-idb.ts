export const SHTORA_DB = "shtora-chats";
export const SHTORA_DB_VERSION = 4;
export const THREADS_STORE = "threads";
export const CANON_STORE = "canon";
export const MEDIA_STORE = "media";
export const STUDIO_STORE = "studio";

export type CanonRow = {
  username: string;
  backstory?: string;
  events?: { id: string; when: string; text: string }[];
  warmth?: number;
  trust?: number;
  heat?: number;
  irrit?: number;
  guilt?: number;
  spark?: number;
  place?: string;
  clothes?: string;
  hair?: string;
  persona?: string;
  mood?: string;
};

export function openShtoraDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no idb"));
      return;
    }
    const req = indexedDB.open(SHTORA_DB, SHTORA_DB_VERSION);
    const timer = setTimeout(() => {
      try {
        req.result?.close();
      } catch {
        /* ignore */
      }
      reject(new Error("idb timeout"));
    }, 4000);
    const done = (fn: () => void) => {
      clearTimeout(timer);
      fn();
    };
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(THREADS_STORE)) {
        db.createObjectStore(THREADS_STORE, { keyPath: "username" });
      }
      if (!db.objectStoreNames.contains(CANON_STORE)) {
        db.createObjectStore(CANON_STORE, { keyPath: "username" });
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STUDIO_STORE)) {
        db.createObjectStore(STUDIO_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => done(() => resolve(req.result));
    req.onerror = () => done(() => reject(req.error || new Error("idb")));
    req.onblocked = () => {
      /* another tab; timeout will fire */
    };
  });
}

export async function idbPutCanon(row: CanonRow) {
  if (typeof indexedDB === "undefined") return;
  const db = await openShtoraDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CANON_STORE, "readwrite");
    tx.objectStore(CANON_STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetAllCanon(): Promise<CanonRow[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openShtoraDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(CANON_STORE, "readonly");
      const req = tx.objectStore(CANON_STORE).getAll();
      req.onsuccess = () => resolve((req.result as CanonRow[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function idbPutMedia(id: string, blob: Blob) {
  if (typeof indexedDB === "undefined" || !id || !blob.size) return;
  const db = await openShtoraDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, "readwrite");
    tx.objectStore(MEDIA_STORE).put({ id, blob, mime: blob.type || "application/octet-stream", at: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetMedia(id: string): Promise<Blob | undefined> {
  if (typeof indexedDB === "undefined" || !id) return undefined;
  try {
    const db = await openShtoraDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, "readonly");
      const req = tx.objectStore(MEDIA_STORE).get(id);
      req.onsuccess = () => {
        const row = req.result as { blob?: Blob } | undefined;
        resolve(row?.blob && row.blob.size ? row.blob : undefined);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export type StudioRow = { id: string; kind: "image" | "video"; url: string; from: string; at: number; prompt?: string };

const STUDIO_DB = "shtora-studio";

function openStudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no idb"));
      return;
    }
    const req = indexedDB.open(STUDIO_DB, 1);
    const timer = setTimeout(() => reject(new Error("studio idb timeout")), 4000);
    const done = (fn: () => void) => {
      clearTimeout(timer);
      fn();
    };
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("items")) db.createObjectStore("items", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "id" });
    };
    req.onsuccess = () => done(() => resolve(req.result));
    req.onerror = () => done(() => reject(req.error || new Error("studio idb")));
  });
}

export async function idbPutStudio(items: StudioRow[]) {
  if (typeof indexedDB === "undefined") return;
  const db = await openStudioDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("items", "readwrite");
    const store = tx.objectStore("items");
    for (const item of items.slice(0, 80)) store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetStudio(): Promise<StudioRow[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openStudioDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("items", "readonly");
      const req = tx.objectStore("items").getAll();
      req.onsuccess = () => resolve((req.result as StudioRow[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function idbDropStudio(id: string) {
  if (typeof indexedDB === "undefined" || !id) return;
  try {
    const db = await openStudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["items", "blobs"], "readwrite");
      tx.objectStore("items").delete(id);
      tx.objectStore("blobs").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function idbPutStudioBlob(id: string, blob: Blob) {
  if (typeof indexedDB === "undefined" || !id || !blob.size) return;
  const db = await openStudioDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").put({ id, blob, mime: blob.type || "application/octet-stream", at: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetStudioBlob(id: string): Promise<Blob | undefined> {
  if (typeof indexedDB === "undefined" || !id) return undefined;
  try {
    const db = await openStudioDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("blobs", "readonly");
      const req = tx.objectStore("blobs").get(id);
      req.onsuccess = () => {
        const row = req.result as { blob?: Blob } | undefined;
        resolve(row?.blob && row.blob.size ? row.blob : undefined);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}
