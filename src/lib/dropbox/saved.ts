import { evictOldestIgCache } from "@/lib/instagram/cache";

const STORAGE_KEY = "shtora-saved-v1";

export type SaveKind = "post" | "story" | "highlight" | "profile";

export type SavedState = {
  files: string[];
  storiesOn: Record<string, string>;
  lastRunAt?: number;
  lastLog?: string;
  saveNotice?: { at: number; saved: number; text: string; tickAt?: number } | null;
  ackedTickAt?: number;
};

function emptyState(): SavedState {
  return { files: [], storiesOn: {} };
}

let memory: SavedState | null = null;
const fileSet = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach((fn) => fn());
}

export function subscribeSaved(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getSavedVersion(): number {
  return version;
}

function load(): SavedState {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedState>;
      memory = {
        files: Array.isArray(parsed.files) ? parsed.files : [],
        storiesOn:
          parsed.storiesOn && typeof parsed.storiesOn === "object" ? parsed.storiesOn : {},
        lastRunAt: typeof parsed.lastRunAt === "number" ? parsed.lastRunAt : undefined,
        lastLog: typeof parsed.lastLog === "string" ? parsed.lastLog : undefined,
        saveNotice: noticeOf(parsed.saveNotice),
        ackedTickAt: typeof parsed.ackedTickAt === "number" ? parsed.ackedTickAt : 0,
      };
    } else {
      memory = emptyState();
    }
  } catch {
    memory = emptyState();
  }
  fileSet.clear();
  for (const id of memory.files) fileSet.add(id);
  return memory;
}

function persist() {
  if (!memory) return;
  const payload = JSON.stringify(memory);
  try {
    localStorage.setItem(STORAGE_KEY, payload);
    return;
  } catch {
    evictOldestIgCache(2);
  }
  try {
    localStorage.setItem(STORAGE_KEY, payload);
  } catch {
    /* ignore */
  }
}

export function fileKey(username: string, kind: SaveKind, id: string, slide = 0): string {
  return `${username.toLowerCase()}|${kind}|${id}|${slide}`;
}

export function isFileSaved(username: string, kind: SaveKind, id: string, slide = 0): boolean {
  load();
  return fileSet.has(fileKey(username, kind, id, slide));
}

export function markFileSaved(username: string, kind: SaveKind, id: string, slide = 0) {
  const state = load();
  const key = fileKey(username, kind, id, slide);
  if (fileSet.has(key)) return;
  fileSet.add(key);
  state.files.push(key);
  persist();
  emit();
}

export function todayStamp(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function storiesSavedToday(username: string): boolean {
  const state = load();
  return state.storiesOn[username.toLowerCase()] === todayStamp();
}

export function markStoriesSavedToday(username: string) {
  const state = load();
  state.storiesOn[username.toLowerCase()] = todayStamp();
  persist();
}

export function getSavedFiles(): string[] {
  return [...load().files];
}

export function mergeSavedFiles(keys: string[]) {
  if (!keys.length) return;
  const state = load();
  let added = false;
  for (const key of keys) {
    if (!key || fileSet.has(key)) continue;
    fileSet.add(key);
    state.files.push(key);
    added = true;
  }
  if (!added) return;
  persist();
  emit();
}

export function setLastRun(log: string) {
  const state = load();
  state.lastRunAt = Date.now();
  state.lastLog = log;
  persist();
}

export function getLastRun(): { at?: number; log?: string } {
  const state = load();
  return { at: state.lastRunAt, log: state.lastLog };
}

export function getSaveNotice() {
  return load().saveNotice ?? null;
}

export function setSaveNotice(saved: number, text: string) {
  if (saved <= 0) return;
  const state = load();
  state.saveNotice = { at: Date.now(), saved, text };
  persist();
  emit();
}

export function noteServerSave(tickAt: number, saved: number) {
  if (!tickAt || saved <= 0) return;
  const state = load();
  if ((state.ackedTickAt ?? 0) >= tickAt) return;
  if (state.saveNotice?.tickAt === tickAt) return;
  state.saveNotice = { at: Date.now(), saved, text: `Автосохранение: ${saved} новых`, tickAt };
  persist();
  emit();
}

export function dismissSaveNotice() {
  const state = load();
  if (state.saveNotice?.tickAt) state.ackedTickAt = state.saveNotice.tickAt;
  if (!state.saveNotice) return;
  state.saveNotice = null;
  persist();
  emit();
}

function noticeOf(value: unknown): SavedState["saveNotice"] {
  if (!value || typeof value !== "object") return null;
  const row = value as { at?: unknown; saved?: unknown; text?: unknown; tickAt?: unknown };
  if (typeof row.at !== "number" || typeof row.saved !== "number" || typeof row.text !== "string") return null;
  if (row.saved <= 0) return null;
  return {
    at: row.at,
    saved: row.saved,
    text: row.text,
    tickAt: typeof row.tickAt === "number" ? row.tickAt : undefined,
  };
}
