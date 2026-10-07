import { useCallback, useEffect, useState } from "react";
import { evictOldestIgCache } from "@/lib/instagram/cache";
import { DEFAULT_VARIATION_PROMPT, OLD_VARIATION_PROMPT } from "@/lib/imagine/prompt";
import { DEFAULT_APIFY_TOKEN, DEFAULT_FAVORITES, MAX_FAVORITES } from "@/lib/instagram/pinned";
import { idbGetAllCanon, idbPutCanon, type CanonRow } from "@/lib/shtora-idb";
import { apiFetch } from "@/lib/shtora-origin";

const SETTINGS_KEY = "shtora-settings";
const CANON_KEY = "shtora-chat-canon";
const DROPBOX_KEY = "shtora-dropbox-token";
const DROPBOX_REFRESH_KEY = "shtora-dropbox-refresh";
const DROPBOX_APP_KEY = "shtora-dropbox-app";
const CHAT_KEY = "shtora-openrouter-key";
const TIKHUB_KEY = "shtora-tikhub-token";
const HIKER_KEY = "shtora-hiker-token";
const LEGACY_TOKEN_KEY = "shtora-apify-token";

export const DEFAULT_CHAT_MODEL = "anthropic/claude-sonnet-4";
export type ChatEngine = "claude" | "grok";

export type ChatLifeEvent = {
  id: string;
  when: string;
  text: string;
};

export type ChatSetupState = {
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

export type ShtoraSettings = {
  apifyToken: string;
  hikerToken: string;
  tikhubToken: string;
  dropboxToken: string;
  dropboxRefreshToken: string;
  dropboxAppKey: string;
  dropboxAppSecret: string;
  dropboxTokenExpiresAt: number;
  defaultFolder: string;
  accountFolders: Record<string, string>;
  favorites: string[];
  chatBackstory: Record<string, string>;
  chatEvents: Record<string, ChatLifeEvent[]>;
  chatSetup: Record<string, ChatSetupState>;
  autoSave: boolean;
  imaginePrompt: string;
  chatApiKey: string;
  chatModel: string;
  chatEngine: ChatEngine;
};

export const DEFAULT_SETTINGS: ShtoraSettings = {
  apifyToken: DEFAULT_APIFY_TOKEN,
  hikerToken: "",
  tikhubToken: "",
  dropboxToken: "",
  dropboxRefreshToken: "",
  dropboxAppKey: "",
  dropboxAppSecret: "",
  dropboxTokenExpiresAt: 0,
  defaultFolder: "/Штора",
  accountFolders: {
    ellissawe: "/Штора/ellissawe",
    dashutiya: "/Штора/dashutiya",
    sheptnowa: "/Штора/sheptnowa",
    minsiyaaa: "/Штора/minsiyaaa",
  },
  favorites: [...DEFAULT_FAVORITES],
  chatBackstory: {},
  chatEvents: {},
  chatSetup: {},
  autoSave: true,
  imaginePrompt: DEFAULT_VARIATION_PROMPT,
  chatApiKey: "",
  chatModel: DEFAULT_CHAT_MODEL,
  chatEngine: "grok",
};

export type ShtoraSettingsPatch = Omit<Partial<ShtoraSettings>, "accountFolders" | "favorites" | "chatBackstory" | "chatEvents" | "chatSetup"> & {
  accountFolders?: Record<string, string>;
  favorites?: string[];
  chatBackstory?: Record<string, string>;
  chatEvents?: Record<string, ChatLifeEvent[]>;
  chatSetup?: Record<string, ChatSetupState>;
};

function normalizeFavorites(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_FAVORITES];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const clean = item.trim().replace(/^@/, "").toLowerCase();
    if (!clean || out.includes(clean)) continue;
    out.push(clean);
    if (out.length >= MAX_FAVORITES) break;
  }
  return out;
}

function normalizeFolder(raw: string, fallback: string): string {
  const trimmed = raw.trim().replace(/\\/g, "/");
  if (!trimmed) return fallback;
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || fallback;
}

export function normalizeHikerToken(raw: string): string {
  return raw
    .trim()
    .replace(/^x-access-key\s*[:=]\s*/i, "")
    .replace(/^Bearer\s+/i, "")
    .replace(/\s+/g, "");
}

export function normalizeDropboxToken(raw: string): string {
  return raw.trim().replace(/^Bearer\s+/i, "").replace(/\s+/g, "");
}

function parseSettings(raw: string | null): Partial<ShtoraSettings> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Partial<ShtoraSettings>;
  } catch {
    return null;
  }
}

function readDedicatedToken(): string {
  try {
    const dedicated = localStorage.getItem(DROPBOX_KEY);
    if (dedicated && dedicated.trim()) return normalizeDropboxToken(dedicated);
  } catch {
    /* ignore */
  }
  return "";
}

function readOauthBundle(): Pick<
  ShtoraSettings,
  "dropboxRefreshToken" | "dropboxAppKey" | "dropboxAppSecret" | "dropboxTokenExpiresAt"
> {
  const out = {
    dropboxRefreshToken: "",
    dropboxAppKey: "",
    dropboxAppSecret: "",
    dropboxTokenExpiresAt: 0,
  };
  try {
    const refresh = localStorage.getItem(DROPBOX_REFRESH_KEY);
    if (refresh) out.dropboxRefreshToken = refresh.trim();
    const raw = localStorage.getItem(DROPBOX_APP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        key?: string;
        secret?: string;
        expiresAt?: number;
      };
      if (typeof parsed.key === "string") out.dropboxAppKey = parsed.key;
      if (typeof parsed.secret === "string") out.dropboxAppSecret = parsed.secret;
      if (typeof parsed.expiresAt === "number") out.dropboxTokenExpiresAt = parsed.expiresAt;
    }
  } catch {
    /* ignore */
  }
  return out;
}

function readSettings(): ShtoraSettings {
  const next: ShtoraSettings = {
    ...DEFAULT_SETTINGS,
    accountFolders: { ...DEFAULT_SETTINGS.accountFolders },
    favorites: [...DEFAULT_SETTINGS.favorites],
    chatBackstory: { ...DEFAULT_SETTINGS.chatBackstory },
    chatEvents: {},
    chatSetup: {},
  };
  try {
    const stored = parseSettings(localStorage.getItem(SETTINGS_KEY));
    if (stored) {
      if (typeof stored.apifyToken === "string" && stored.apifyToken.trim()) {
        next.apifyToken = stored.apifyToken.trim();
      }
      if (typeof stored.hikerToken === "string") next.hikerToken = stored.hikerToken.trim();
      if (typeof stored.tikhubToken === "string") next.tikhubToken = stored.tikhubToken.trim();
      if (typeof stored.dropboxRefreshToken === "string") {
        next.dropboxRefreshToken = stored.dropboxRefreshToken.trim();
      }
      if (typeof stored.dropboxAppKey === "string") next.dropboxAppKey = stored.dropboxAppKey.trim();
      if (typeof stored.dropboxAppSecret === "string") next.dropboxAppSecret = stored.dropboxAppSecret.trim();
      if (typeof stored.dropboxTokenExpiresAt === "number") next.dropboxTokenExpiresAt = stored.dropboxTokenExpiresAt;
      if (typeof stored.defaultFolder === "string") {
        next.defaultFolder = normalizeFolder(stored.defaultFolder, next.defaultFolder);
      }
      if (stored.accountFolders && typeof stored.accountFolders === "object") {
        for (const [name, value] of Object.entries(stored.accountFolders)) {
          const clean = name.trim().replace(/^@/, "").toLowerCase();
          if (!clean || typeof value !== "string" || !value.trim()) continue;
          next.accountFolders[clean] = normalizeFolder(value, `${next.defaultFolder}/${clean}`);
        }
      }
      next.favorites = normalizeFavorites(stored.favorites);
      if (stored.chatBackstory && typeof stored.chatBackstory === "object") {
        next.chatBackstory = {};
        for (const [name, value] of Object.entries(stored.chatBackstory)) {
          const clean = name.trim().replace(/^@/, "").toLowerCase();
          if (clean && typeof value === "string" && value.trim()) {
            next.chatBackstory[clean] = value.trim().slice(0, 4000);
          }
        }
      }
      if (stored.chatEvents && typeof stored.chatEvents === "object") {
        next.chatEvents = {};
        for (const [name, value] of Object.entries(stored.chatEvents)) {
          const clean = name.trim().replace(/^@/, "").toLowerCase();
          if (clean) next.chatEvents[clean] = normalizeEvents(value);
        }
      }
      if (stored.chatSetup && typeof stored.chatSetup === "object") {
        next.chatSetup = {};
        for (const [name, value] of Object.entries(stored.chatSetup)) {
          const clean = name.trim().replace(/^@/, "").toLowerCase();
          const row = normalizeSetup(value);
          if (clean && row) next.chatSetup[clean] = row;
        }
      }
      if (typeof stored.autoSave === "boolean") next.autoSave = stored.autoSave;
      if (typeof stored.imaginePrompt === "string") {
        next.imaginePrompt =
          !stored.imaginePrompt.trim() ||
          stored.imaginePrompt === OLD_VARIATION_PROMPT ||
          stored.imaginePrompt.includes("still fully covering the body") ||
          stored.imaginePrompt.includes("underwear") ||
          stored.imaginePrompt.includes("clothing pulled aside")
            ? DEFAULT_VARIATION_PROMPT
            : stored.imaginePrompt;
      }
      if (typeof stored.chatModel === "string" && stored.chatModel.trim()) next.chatModel = stored.chatModel.trim();
      if (stored.chatEngine === "claude" || stored.chatEngine === "grok") next.chatEngine = stored.chatEngine;
    } else {
      const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
      if (legacy && legacy.trim()) next.apifyToken = legacy.trim();
    }
  } catch {
    /* ignore */
  }
  const dedicated = readDedicatedToken();
  if (dedicated) next.dropboxToken = dedicated;
  const oauth = readOauthBundle();
  if (oauth.dropboxRefreshToken) next.dropboxRefreshToken = oauth.dropboxRefreshToken;
  if (oauth.dropboxAppKey) next.dropboxAppKey = oauth.dropboxAppKey;
  if (oauth.dropboxAppSecret) next.dropboxAppSecret = oauth.dropboxAppSecret;
  if (oauth.dropboxTokenExpiresAt) next.dropboxTokenExpiresAt = oauth.dropboxTokenExpiresAt;
  try {
    const chat = localStorage.getItem(CHAT_KEY);
    if (chat && chat.trim()) next.chatApiKey = chat.trim();
  } catch {
    /* ignore */
  }
  try {
    const hiker = localStorage.getItem(HIKER_KEY);
    if (hiker && hiker.trim()) next.hikerToken = hiker.trim();
    const tikhub = localStorage.getItem(TIKHUB_KEY);
    if (tikhub && tikhub.trim()) next.tikhubToken = tikhub.trim();
  } catch {
    /* ignore */
  }
  return applyCanonBlob(next, readCanonBlob());
}

function persistKey(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    evictOldestIgCache(8);
  }
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    evictOldestIgCache(24);
  }
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

type CanonBlob = {
  backstory: Record<string, string>;
  events: Record<string, ChatLifeEvent[]>;
  setup: Record<string, ChatSetupState>;
};

function keepStory(prev: string | undefined, next: string | undefined) {
  if (next && !isBlankBackstory(next)) return next;
  if (prev && !isBlankBackstory(prev)) return prev;
  return next && next.trim() ? next : prev || "";
}

function mergeCanon(base: CanonBlob, extra: Partial<CanonBlob>): CanonBlob {
  const backstory = { ...base.backstory };
  for (const [name, text] of Object.entries(extra.backstory || {})) {
    const kept = keepStory(backstory[name], text);
    if (kept && !isBlankBackstory(kept)) backstory[name] = kept;
  }
  const events = { ...base.events };
  for (const [name, rows] of Object.entries(extra.events || {})) {
    if (rows.length) events[name] = rows;
    else if (!events[name]) events[name] = rows;
  }
  const setup = { ...base.setup };
  for (const [name, row] of Object.entries(extra.setup || {})) {
    setup[name] = { ...setup[name], ...row };
  }
  return { backstory, events, setup };
}

function readCanonBlob(): CanonBlob {
  const empty: CanonBlob = { backstory: {}, events: {}, setup: {} };
  try {
    const raw = localStorage.getItem(CANON_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<CanonBlob>;
    const backstory: Record<string, string> = {};
    if (parsed.backstory && typeof parsed.backstory === "object") {
      for (const [name, text] of Object.entries(parsed.backstory)) {
        const clean = name.trim().toLowerCase();
        if (clean && typeof text === "string" && !isBlankBackstory(text)) backstory[clean] = text.slice(0, 4000);
      }
    }
    const events: Record<string, ChatLifeEvent[]> = {};
    if (parsed.events && typeof parsed.events === "object") {
      for (const [name, rows] of Object.entries(parsed.events)) {
        const clean = name.trim().toLowerCase();
        if (clean) events[clean] = normalizeEvents(rows);
      }
    }
    const setup: Record<string, ChatSetupState> = {};
    if (parsed.setup && typeof parsed.setup === "object") {
      for (const [name, row] of Object.entries(parsed.setup)) {
        const clean = name.trim().toLowerCase();
        const next = normalizeSetup(row);
        if (clean && next) setup[clean] = next;
      }
    }
    return { backstory, events, setup };
  } catch {
    return empty;
  }
}

function persistCanon(value: ShtoraSettings) {
  const blob: CanonBlob = {
    backstory: { ...value.chatBackstory },
    events: { ...value.chatEvents },
    setup: { ...value.chatSetup },
  };
  const merged = mergeCanon(readCanonBlob(), blob);
  persistKey(CANON_KEY, JSON.stringify(merged));
  value.chatBackstory = merged.backstory;
  value.chatEvents = merged.events;
  value.chatSetup = merged.setup;
  void saveCanonToIdb(merged);
}

function saveCanonToIdb(blob: CanonBlob) {
  const names = new Set([
    ...Object.keys(blob.backstory),
    ...Object.keys(blob.events),
    ...Object.keys(blob.setup),
  ]);
  return Promise.all(
    [...names].map((username) => {
      const setup = blob.setup[username] || {};
      const row: CanonRow = {
        username,
        backstory: blob.backstory[username],
        events: blob.events[username],
        warmth: setup.warmth,
        trust: setup.trust,
        heat: setup.heat,
        irrit: setup.irrit,
        guilt: setup.guilt,
        spark: setup.spark,
        place: setup.place,
        clothes: setup.clothes,
        hair: setup.hair,
        persona: setup.persona,
        mood: setup.mood,
      };
      return idbPutCanon(row).catch(() => undefined);
    }),
  );
}

function applyCanonBlob(next: ShtoraSettings, blob: CanonBlob) {
  const merged = mergeCanon(
    { backstory: next.chatBackstory, events: next.chatEvents, setup: next.chatSetup },
    blob,
  );
  next.chatBackstory = merged.backstory;
  next.chatEvents = merged.events;
  next.chatSetup = merged.setup;
  return next;
}

async function hydrateCanonIdb() {
  const rows = await idbGetAllCanon();
  if (!rows.length) return;
  const blob: CanonBlob = { backstory: {}, events: {}, setup: {} };
  for (const row of rows) {
    const name = (row.username || "").trim().toLowerCase();
    if (!name) continue;
    if (row.backstory && !isBlankBackstory(row.backstory)) blob.backstory[name] = row.backstory;
    if (row.events?.length) blob.events[name] = normalizeEvents(row.events);
    const setup = normalizeSetup({
      warmth: row.warmth,
      trust: row.trust,
      heat: row.heat,
      irrit: row.irrit,
      guilt: row.guilt,
      spark: row.spark,
      place: row.place,
      clothes: row.clothes,
      hair: row.hair,
      persona: row.persona,
      mood: row.mood,
    });
    if (setup) blob.setup[name] = setup;
  }
  memory = applyCanonBlob(current(), blob);
  persistKey(CANON_KEY, JSON.stringify({
    backstory: memory.chatBackstory,
    events: memory.chatEvents,
    setup: memory.chatSetup,
  }));
  emit();
}

function writeSettings(value: ShtoraSettings) {
  if (value.dropboxToken) persistKey(DROPBOX_KEY, value.dropboxToken);
  if (value.dropboxRefreshToken) persistKey(DROPBOX_REFRESH_KEY, value.dropboxRefreshToken);
  if (value.chatApiKey) persistKey(CHAT_KEY, value.chatApiKey);
  else {
    try {
      localStorage.removeItem(CHAT_KEY);
    } catch {
      /* ignore */
    }
  }
  if (value.hikerToken) persistKey(HIKER_KEY, value.hikerToken);
  else {
    try {
      localStorage.removeItem(HIKER_KEY);
    } catch {
      /* ignore */
    }
  }
  if (value.tikhubToken) persistKey(TIKHUB_KEY, value.tikhubToken);
  else {
    try {
      localStorage.removeItem(TIKHUB_KEY);
    } catch {
      /* ignore */
    }
  }
  persistKey(
    DROPBOX_APP_KEY,
    JSON.stringify({
      key: value.dropboxAppKey,
      secret: value.dropboxAppSecret,
      expiresAt: value.dropboxTokenExpiresAt,
    }),
  );
  const rest = {
    apifyToken: value.apifyToken,
    hikerToken: value.hikerToken,
    tikhubToken: value.tikhubToken,
    defaultFolder: value.defaultFolder,
    accountFolders: value.accountFolders,
    favorites: value.favorites,
    autoSave: value.autoSave,
    imaginePrompt: value.imaginePrompt,
    chatModel: value.chatModel,
    chatEngine: value.chatEngine,
  };
  persistKey(SETTINGS_KEY, JSON.stringify(rest));
  persistCanon(value);
}

function cloneSettings(value: ShtoraSettings): ShtoraSettings {
  return {
    ...value,
    accountFolders: { ...value.accountFolders },
    favorites: [...value.favorites],
    chatBackstory: { ...value.chatBackstory },
    chatEvents: Object.fromEntries(
      Object.entries(value.chatEvents || {}).map(([k, rows]) => [k, rows.map((e) => ({ ...e }))]),
    ),
    chatSetup: { ...value.chatSetup },
  };
}

let memory: ShtoraSettings | null = null;
const listeners = new Set<() => void>();

function current(): ShtoraSettings {
  if (!memory) memory = typeof window === "undefined" ? cloneSettings(DEFAULT_SETTINGS) : readSettings();
  return memory;
}

function emit() {
  listeners.forEach((fn) => fn());
}

function applyPatch(prev: ShtoraSettings, partial: ShtoraSettingsPatch): ShtoraSettings {
  const next = cloneSettings(prev);
  if (typeof partial.apifyToken === "string") {
    next.apifyToken = partial.apifyToken.trim() || DEFAULT_APIFY_TOKEN;
  }
  if (typeof partial.hikerToken === "string") {
    next.hikerToken = normalizeHikerToken(partial.hikerToken);
  }
  if (typeof partial.tikhubToken === "string") {
    next.tikhubToken = normalizeHikerToken(partial.tikhubToken);
  }
  if (typeof partial.dropboxToken === "string") {
    next.dropboxToken = normalizeDropboxToken(partial.dropboxToken);
  }
  if (typeof partial.dropboxRefreshToken === "string") {
    next.dropboxRefreshToken = partial.dropboxRefreshToken.trim();
  }
  if (typeof partial.dropboxAppKey === "string") next.dropboxAppKey = partial.dropboxAppKey.trim();
  if (typeof partial.dropboxAppSecret === "string") next.dropboxAppSecret = partial.dropboxAppSecret.trim();
  if (typeof partial.dropboxTokenExpiresAt === "number") next.dropboxTokenExpiresAt = partial.dropboxTokenExpiresAt;
  if (typeof partial.defaultFolder === "string") {
    next.defaultFolder = normalizeFolder(partial.defaultFolder, DEFAULT_SETTINGS.defaultFolder);
  }
  if (typeof partial.autoSave === "boolean") {
    next.autoSave = partial.autoSave;
  }
  if (typeof partial.imaginePrompt === "string") {
    next.imaginePrompt = partial.imaginePrompt.slice(0, 1200);
  }
  if (typeof partial.chatApiKey === "string") next.chatApiKey = partial.chatApiKey.trim();
  if (typeof partial.chatModel === "string" && partial.chatModel.trim()) next.chatModel = partial.chatModel.trim();
  if (partial.chatEngine === "claude" || partial.chatEngine === "grok") next.chatEngine = partial.chatEngine;
  if (partial.accountFolders) {
    next.accountFolders = { ...next.accountFolders };
    for (const [name, value] of Object.entries(partial.accountFolders)) {
      const clean = name.trim().replace(/^@/, "").toLowerCase();
      if (!clean || typeof value !== "string") continue;
      next.accountFolders[clean] = normalizeFolder(value, `${next.defaultFolder}/${clean}`);
    }
  }
  if (partial.favorites) {
    next.favorites = normalizeFavorites(partial.favorites);
  }
  if (partial.chatBackstory) {
    next.chatBackstory = { ...next.chatBackstory };
    for (const [name, value] of Object.entries(partial.chatBackstory)) {
      const clean = name.trim().replace(/^@/, "").toLowerCase();
      if (!clean) continue;
      if (!value.trim()) delete next.chatBackstory[clean];
      else next.chatBackstory[clean] = value.trim().slice(0, 4000);
    }
  }
  if (partial.chatEvents) {
    next.chatEvents = { ...next.chatEvents };
    for (const [name, rows] of Object.entries(partial.chatEvents)) {
      const clean = name.trim().replace(/^@/, "").toLowerCase();
      if (!clean) continue;
      const list = normalizeEvents(rows);
      if (!list.length) delete next.chatEvents[clean];
      else next.chatEvents[clean] = list;
    }
  }
  if (partial.chatSetup) {
    next.chatSetup = { ...next.chatSetup };
    for (const [name, value] of Object.entries(partial.chatSetup)) {
      const clean = name.trim().replace(/^@/, "").toLowerCase();
      if (!clean) continue;
      const row = normalizeSetup(value);
      if (!row) delete next.chatSetup[clean];
      else next.chatSetup[clean] = { ...next.chatSetup[clean], ...row };
    }
  }
  return next;
}

export function folderForAccount(username: string, settings: ShtoraSettings): string {
  const clean = username.trim().toLowerCase();
  if (settings.accountFolders[clean]) return settings.accountFolders[clean];
  const base = settings.defaultFolder || DEFAULT_SETTINGS.defaultFolder;
  if (settings.favorites.includes(clean)) return `${base}/${clean}`;
  return `${base}/общее`;
}

export function isFavorite(username: string, settings: ShtoraSettings) {
  return settings.favorites.includes(username.trim().toLowerCase());
}

export function toggleFavorite(username: string): { ok: boolean; added: boolean; error?: string } {
  const clean = username.trim().replace(/^@/, "").toLowerCase();
  if (!clean) return { ok: false, added: false, error: "Пустой ник" };
  const prev = current();
  const has = prev.favorites.includes(clean);
  if (!has && prev.favorites.length >= MAX_FAVORITES) {
    return { ok: false, added: false, error: `Максимум ${MAX_FAVORITES} в избранном` };
  }
  const favorites = has ? prev.favorites.filter((name) => name !== clean) : [...prev.favorites, clean];
  const accountFolders = { ...prev.accountFolders };
  if (!has && !accountFolders[clean]) {
    accountFolders[clean] = normalizeFolder(`${prev.defaultFolder}/${clean}`, `/${clean}`);
  }
  patchShtoraSettings({ favorites, accountFolders });
  return { ok: true, added: !has };
}

export const BACKSTORY_TEMPLATE = `Кто вы:
(почти не знакомы / друзья / бывшие / было что-то)

Как давно не общались:
(вчера / месяц / 5 лет — от этого тон)

Кто ещё:
(его девушка, её лучшая подруга, имена — если есть, она ЭТО знает)

Как общаетесь:
(тон, как называет, мат, длина)

Что уже было:
(факты: имя, город, что между вами)

Табу:
(почему не кидает фото, чего не ломать)`;

export function isBlankBackstory(text?: string) {
  const raw = (text || "").trim();
  if (!raw) return true;
  if (raw === BACKSTORY_TEMPLATE.trim()) return true;
  const content = raw
    .replace(/кто вы:|как общаетесь:|что уже было:|табу:|как давно не общались:|кто ещё:/gi, "")
    .replace(/почти не знакомы \/ друзья \/ бывшие \/ было что-то/gi, "")
    .replace(/вчера \/ месяц \/ 5 лет — от этого тон/gi, "")
    .replace(/его девушка, её лучшая подруга, имена — если есть, она ЭТО знает/gi, "")
    .replace(/тон, как называет, мат, длина/gi, "")
    .replace(/факты: имя, город, что между вами/gi, "")
    .replace(/почему не кидает фото, чего не ломать/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return content.length < 8;
}

export function chatBackstoryFor(username: string, settings?: ShtoraSettings) {
  const s = settings ?? current();
  const raw = s.chatBackstory[username.trim().toLowerCase()] ?? "";
  return isBlankBackstory(raw) ? "" : raw;
}

export function setChatBackstory(username: string, text: string) {
  patchShtoraSettings({ chatBackstory: { [username.trim().toLowerCase()]: text } });
}

export function chatSetupFor(username: string, settings?: ShtoraSettings): ChatSetupState | undefined {
  const s = settings ?? current();
  return s.chatSetup[username.trim().toLowerCase()];
}

export function setChatSetup(username: string, setup: ChatSetupState) {
  patchShtoraSettings({ chatSetup: { [username.trim().toLowerCase()]: setup } });
}

function nidEvent() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clampSetup(n: unknown) {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeSetup(raw: unknown): ChatSetupState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as ChatSetupState;
  const next: ChatSetupState = {};
  const warmth = clampSetup(o.warmth);
  const trust = clampSetup(o.trust);
  const heat = clampSetup(o.heat);
  const irrit = clampSetup(o.irrit);
  const guilt = clampSetup(o.guilt);
  const spark = clampSetup(o.spark);
  if (warmth !== undefined) next.warmth = warmth;
  if (trust !== undefined) next.trust = trust;
  if (heat !== undefined) next.heat = heat;
  if (irrit !== undefined) next.irrit = irrit;
  if (guilt !== undefined) next.guilt = guilt;
  if (spark !== undefined) next.spark = spark;
  if (typeof o.place === "string" && o.place.trim()) next.place = o.place.trim().slice(0, 80);
  if (typeof o.clothes === "string" && o.clothes.trim()) next.clothes = o.clothes.trim().slice(0, 80);
  if (typeof o.hair === "string" && o.hair.trim()) next.hair = o.hair.trim().slice(0, 80);
  if (typeof o.persona === "string" && o.persona.trim()) next.persona = o.persona.trim().slice(0, 1400);
  if (typeof o.mood === "string" && o.mood.trim()) next.mood = o.mood.trim().slice(0, 40);
  return Object.keys(next).length ? next : null;
}

function normalizeEvents(raw: unknown): ChatLifeEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatLifeEvent[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as { id?: unknown; when?: unknown; text?: unknown };
    const text = typeof o.text === "string" ? o.text.trim().slice(0, 280) : "";
    const when = typeof o.when === "string" ? o.when.trim().slice(0, 80) : "";
    if (!text) continue;
    out.push({
      id: typeof o.id === "string" && o.id.trim() ? o.id.trim().slice(0, 40) : nidEvent(),
      when: when || "недавно",
      text,
    });
    if (out.length >= 40) break;
  }
  return out;
}

export function chatEventsFor(username: string, settings?: ShtoraSettings): ChatLifeEvent[] {
  const s = settings ?? current();
  return s.chatEvents[username.trim().toLowerCase()] ?? [];
}

export function setChatEvents(username: string, events: ChatLifeEvent[]) {
  patchShtoraSettings({ chatEvents: { [username.trim().toLowerCase()]: events } });
}

export function addChatEvent(username: string, when: string, text: string) {
  const clean = username.trim().toLowerCase();
  const rows = chatEventsFor(clean);
  const next: ChatLifeEvent = {
    id: nidEvent(),
    when: when.trim().slice(0, 80) || "недавно",
    text: text.trim().slice(0, 280),
  };
  if (!next.text) return next;
  setChatEvents(clean, [next, ...rows].slice(0, 40));
  return next;
}

export function removeChatEvent(username: string, id: string) {
  const clean = username.trim().toLowerCase();
  setChatEvents(
    clean,
    chatEventsFor(clean).filter((e) => e.id !== id),
  );
}

export function eventsLine(username: string, settings?: ShtoraSettings) {
  const rows = chatEventsFor(username, settings);
  if (!rows.length) return "";
  return `СОБЫТИЯ (она это помнит, не выдумывай даты и не отрицай):\n${rows
    .map((e) => `- ${e.when}: ${e.text}`)
    .join("\n")}`;
}

export function characterCanon(username: string, settings?: ShtoraSettings) {
  return [chatBackstoryFor(username, settings), eventsLine(username, settings)].filter(Boolean).join("\n\n").slice(0, 4000);
}

async function hydrateFromServer() {
  if (import.meta.env.VITE_STATIC_PREVIEW === "1") return;
  try {
    const res = await apiFetch("/api/autosave-config");
    if (!res.ok) return;
    const data = (await res.json()) as Record<string, unknown>;
    if (!data || data.empty) return;
    const patch: ShtoraSettingsPatch = {};
    if (typeof data.apifyToken === "string" && data.apifyToken.trim()) patch.apifyToken = data.apifyToken;
    if (typeof data.dropboxToken === "string" && data.dropboxToken.trim()) {
      const serverExp = typeof data.dropboxTokenExpiresAt === "number" ? data.dropboxTokenExpiresAt : 0;
      const localExp = current().dropboxTokenExpiresAt || 0;
      if (!localExp || serverExp >= localExp || localExp < Date.now()) {
        patch.dropboxToken = data.dropboxToken;
        if (serverExp) patch.dropboxTokenExpiresAt = serverExp;
      }
    }
    if (typeof data.dropboxRefreshToken === "string" && data.dropboxRefreshToken.trim()) {
      patch.dropboxRefreshToken = data.dropboxRefreshToken;
    }
    if (typeof data.dropboxAppKey === "string" && data.dropboxAppKey.trim()) patch.dropboxAppKey = data.dropboxAppKey;
    if (typeof data.dropboxAppSecret === "string" && data.dropboxAppSecret.trim()) patch.dropboxAppSecret = data.dropboxAppSecret;
    if (typeof data.defaultFolder === "string" && data.defaultFolder.trim()) patch.defaultFolder = data.defaultFolder;
    if (data.accountFolders && typeof data.accountFolders === "object") {
      patch.accountFolders = data.accountFolders as Record<string, string>;
    }
    if (Array.isArray(data.favorites) && data.favorites.length) {
      patch.favorites = data.favorites.filter((n): n is string => typeof n === "string");
    }
    if (typeof data.autoSave === "boolean") patch.autoSave = data.autoSave;
    if (data.chatEngine === "claude" || data.chatEngine === "grok") patch.chatEngine = data.chatEngine;
    if (typeof data.chatApiKey === "string" && data.chatApiKey.trim()) patch.chatApiKey = data.chatApiKey;
    if (typeof data.chatModel === "string" && data.chatModel.trim()) patch.chatModel = data.chatModel;
    if (typeof data.imaginePrompt === "string" && data.imaginePrompt.trim()) patch.imaginePrompt = data.imaginePrompt;
    if (Object.keys(patch).length) patchShtoraSettings(patch);
  } catch {
    /* server optional */
  }
}

export function useShtoraSettings() {
  const [settings, setSettings] = useState<ShtoraSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    void (async () => {
      if (!memory) memory = readSettings();
      setSettings(cloneSettings(memory));
      await hydrateCanonIdb();
      if (cancelled) return;
      setSettings(cloneSettings(current()));
      await hydrateFromServer();
      if (cancelled) return;
      setSettings(cloneSettings(current()));
      setHydrated(true);
    })();
    const sync = () => setSettings(cloneSettings(current()));
    listeners.add(sync);
    void import("@/lib/dropbox/background")
      .then(({ readStoredHiker }) => readStoredHiker())
      .then((token) => {
        if (!token || current().hikerToken) return;
        patchShtoraSettings({ hikerToken: token });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      listeners.delete(sync);
    };
  }, []);

  const patch = useCallback((partial: ShtoraSettingsPatch) => {
    if (typeof window === "undefined") return;
    const prev = current();
    const next = applyPatch(prev, partial);
    if (typeof partial.dropboxToken === "string" && !next.dropboxToken && prev.dropboxToken) {
      next.dropboxToken = prev.dropboxToken;
    }
    if (typeof partial.tikhubToken === "string" && !next.tikhubToken && prev.tikhubToken) {
      next.tikhubToken = prev.tikhubToken;
    }
    if (typeof partial.hikerToken === "string" && !next.hikerToken && prev.hikerToken) {
      next.hikerToken = prev.hikerToken;
    }
    memory = next;
    writeSettings(next);
    emit();
  }, []);

  const setAccountFolder = useCallback(
    (name: string, path: string) => {
      patch({ accountFolders: { [name]: path } });
    },
    [patch],
  );

  return { settings, patch, setAccountFolder, hydrated };
}

export function getShtoraSettings(): ShtoraSettings {
  return cloneSettings(current());
}

export function patchShtoraSettings(partial: ShtoraSettingsPatch) {
  if (typeof window === "undefined") return;
  const prev = current();
  const next = applyPatch(prev, partial);
  if (typeof partial.dropboxToken === "string" && !next.dropboxToken && prev.dropboxToken) {
    next.dropboxToken = prev.dropboxToken;
  }
  if (typeof partial.dropboxRefreshToken === "string" && !next.dropboxRefreshToken && prev.dropboxRefreshToken) {
    next.dropboxRefreshToken = prev.dropboxRefreshToken;
  }
  if (typeof partial.hikerToken === "string" && !next.hikerToken && prev.hikerToken) {
    next.hikerToken = prev.hikerToken;
  }
  if (typeof partial.tikhubToken === "string" && !next.tikhubToken && prev.tikhubToken) {
    next.tikhubToken = prev.tikhubToken;
  }
  memory = next;
  writeSettings(next);
  emit();
}
