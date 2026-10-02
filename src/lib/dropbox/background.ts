import { getSavedFiles, mergeSavedFiles, setLastRun } from "./saved";
import type { ShtoraSettings } from "@/lib/shtora-settings";
import { apiFetch } from "@/lib/shtora-origin";

const DB_NAME = "shtora-bg";
const STORE = "kv";

type BgPayload = {
  apifyToken: string;
  hikerToken: string;
  tikhubToken: string;
  dropboxToken: string;
  dropboxRefreshToken: string;
  dropboxAppKey: string;
  dropboxAppSecret: string;
  dropboxTokenExpiresAt?: number;
  defaultFolder: string;
  accountFolders: ShtoraSettings["accountFolders"];
  favorites: string[];
  autoSave: boolean;
  savedFiles: string[];
  chatEngine?: ShtoraSettings["chatEngine"];
  chatApiKey?: string;
  chatModel?: string;
  imaginePrompt?: string;
};

function openDb(): Promise<IDBDatabase> {
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

async function idbSet(key: string, value: unknown) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key: string): Promise<unknown> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function persistTikhubToken(token: string) {
  const tikhubToken = token.trim();
  if (tikhubToken.length < 8) return false;
  try {
    await idbSet("tikhubToken", tikhubToken);
    const res = await apiFetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tikhubToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function persistHikerToken(token: string) {
  const hikerToken = token.trim();
  if (hikerToken.length < 8) return false;
  try {
    await idbSet("hikerToken", hikerToken);
    const res = await apiFetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hikerToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function readStoredHiker(): Promise<string> {
  try {
    const dedicated = String((await idbGet("hikerToken")) ?? "").trim();
    if (dedicated.length > 8) return dedicated;
    const payload = (await idbGet("payload")) as BgPayload | undefined;
    const token = String(payload?.hikerToken ?? "").trim();
    return token.length > 8 ? token : "";
  } catch {
    return "";
  }
}
let lastPayload = "";
let persistTimer = 0;

export async function persistBackgroundPayload(settings: ShtoraSettings) {
  if (typeof indexedDB === "undefined") return;
  const payload: BgPayload = {
    apifyToken: settings.apifyToken,
    hikerToken: settings.hikerToken,
    tikhubToken: settings.tikhubToken,
    dropboxToken: settings.dropboxToken,
    dropboxRefreshToken: settings.dropboxRefreshToken,
    dropboxAppKey: settings.dropboxAppKey,
    dropboxAppSecret: settings.dropboxAppSecret,
    dropboxTokenExpiresAt: settings.dropboxTokenExpiresAt,
    defaultFolder: settings.defaultFolder,
    accountFolders: settings.accountFolders,
    favorites: settings.favorites,
    autoSave: settings.autoSave,
    savedFiles: getSavedFiles(),
    chatEngine: settings.chatEngine,
    chatApiKey: settings.chatApiKey,
    chatModel: settings.chatModel,
    imaginePrompt: settings.imaginePrompt,
  };
  const raw = JSON.stringify(payload);
  if (raw === lastPayload) return;
  lastPayload = raw;
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    void writeBackgroundPayload(payload);
  }, 500);
}

async function writeBackgroundPayload(payload: BgPayload) {
  await idbSet("payload", payload);
  if (payload.tikhubToken.trim().length > 8) await persistTikhubToken(payload.tikhubToken);
  if (payload.hikerToken.trim().length > 8) await persistHikerToken(payload.hikerToken);
  try {
    await apiFetch("/api/autosave-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* ignore */
  }
}

export async function setupBackgroundSave(settings: ShtoraSettings) {
  if (typeof window === "undefined") return;
  await persistBackgroundPayload(settings);
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("shtora-")).map((k) => caches.delete(k)));
  } catch {
    /* ignore */
  }
}

export async function applyBackgroundResult(keys: string[], log?: string) {
  mergeSavedFiles(keys);
  if (log) setLastRun(log);
}
