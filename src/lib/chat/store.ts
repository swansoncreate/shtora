import { asBond, bondFromBackstory, dumpBond, type BondDelta, type ChatBond } from "./bond";
import { parseArc, type ChatArc } from "./arc";
import { dumpChatToDisk, eraseChatDisk } from "./disk";
import { herAsk, seedMarks, type ChatMarks } from "./life";
import { chatBackstoryFor, chatSetupFor, setChatSetup } from "@/lib/shtora-settings";
import { storyFacts } from "./functions";
import { openShtoraDb } from "@/lib/shtora-idb";
import { apiFetch } from "@/lib/shtora-origin";
import type { ChatWorld } from "./world";

export type ChatKind = "text" | "photo" | "heart" | "action" | "post" | "story" | "circle";

export type ChatDebug = {
  warmth: number;
  trust: number;
  heat: number;
  irrit: number;
  spark?: number;
  guilt?: number;
  pull?: number;
  stage?: string;
  beat?: string;
  place?: string;
  clothes?: string;
  hair?: string;
  mood?: string;
  memory?: string;
  hour?: number;
  want?: string;
  lastMove?: string;
  imaginePrompt?: string;
  imagineKind?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  kind?: ChatKind;
  at: number;
  seq?: number;
  imageUrl?: string;
  once?: boolean;
  viewed?: boolean;
  acted?: boolean;
  heartByUser?: boolean;
  heartByHer?: boolean;
  debug?: ChatDebug;
};

export type ChatThread = {
  username: string;
  fullName?: string;
  avatar?: string;
  messages: ChatMessage[];
  updatedAt: number;
  unread: number;
  seenAt?: number;
  persona?: string;
  mood?: string;
  memory?: string;
  warmth: number;
  warmthUp?: number;
  warmthDay?: string;
  world?: ChatWorld;
  arc?: ChatArc;
  bond?: ChatBond;
  marks?: ChatMarks;
  lastPingAt?: number;
  lastAlmostAt?: number;
  heldUntil?: number;
  heldMsgId?: string;
  brainId?: string;
  onceSentAt?: number;
  onceDeleteAsked?: boolean;
};

const STORE = "threads";
const READY_KEY = "shtora-chats-ready";
const listeners = new Set<() => void>();
const memory = new Map<string, ChatThread>();

let hydrated = false;
const epoch = new Map<string, number>();
let hydratePromise: Promise<void> | null = null;
const diskTimers = new Map<string, number>();

function emit() {
  listeners.forEach((fn) => fn());
}

let emitFrame = 0;
function emitSoon() {
  if (emitFrame) return;
  emitFrame = window.setTimeout(() => {
    emitFrame = 0;
    emit();
  }, 80);
}

export function subscribeChats(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function nid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function asWarmth(n?: number) {
  if (typeof n !== "number" || !Number.isFinite(n)) return 40;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function warmthFromBackstory(story: string) {
  return bondFromBackstory(story).warmth;
}

function clampBond(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function scrubMemory(raw: string | undefined) {
  return (raw || "")
    .replace(/не надо просить (углы|ракурс)[^.]*/gi, " ")
    .replace(/не проси (углы|ракурс)[^.]*/gi, " ")
    .replace(/углы когда я сама не хочу[^.]*/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

function scrubArc(raw: unknown, warmth = 40): ChatArc | undefined {
  if (!raw) return undefined;
  return parseArc(raw, warmth);
}

function snapshotDebug(thread: ChatThread): ChatDebug {
  const gf = storyFacts(chatBackstoryFor(thread.username)).girlfriend;
  const dump = dumpBond(thread.bond, asWarmth(thread.warmth), gf);
  return {
    warmth: dump.warmth,
    trust: dump.trust,
    heat: dump.heat,
    irrit: dump.irrit,
    spark: dump.spark,
    guilt: dump.guilt,
    pull: dump.pull,
    stage: dump.stage,
    beat: thread.arc?.beat,
    place: thread.world?.place,
    clothes: thread.world?.clothes,
    hair: thread.world?.hair,
    mood: thread.mood,
    memory: (thread.memory || "").slice(0, 400),
    hour: new Date(Date.now()).getHours(),
    want: thread.arc?.want,
    lastMove: thread.arc?.lastMove,
  };
}

function slimUrl(url?: string) {
  if (!url) return undefined;
  if (url.startsWith("data:")) return undefined;
  return url.slice(0, 20000);
}

function forIdb(thread: ChatThread): ChatThread {
  return {
    ...thread,
    messages: thread.messages.map((item) => ({
      ...item,
      imageUrl: slimUrl(item.imageUrl),
    })),
  };
}

let diskHydrated = false;

function slim(thread: ChatThread) {
  return {
    username: thread.username,
    fullName: thread.fullName,
    mood: thread.mood,
    memory: thread.memory,
    warmth: thread.warmth,
    persona: thread.persona,
    backstory: chatBackstoryFor(thread.username) || undefined,
    lastPingAt: thread.lastPingAt,
    world: thread.world,
    arc: thread.arc,
    bond: thread.bond,
    updatedAt: thread.updatedAt,
    metricsOk: diskHydrated,
    messages: thread.messages.map((item) => ({
      id: item.id,
      role: item.role,
      text: (item.text || "").slice(0, 8000),
      kind: item.kind,
      at: item.at,
      imageUrl: slimUrl(item.imageUrl),
      once: item.once,
      debug: item.debug,
    })),
  };
}

function openDb(): Promise<IDBDatabase> {
  return openShtoraDb();
}

type RemoteMessage = {
  id?: string;
  role?: string;
  text?: string;
  kind?: string;
  photo?: boolean;
  imageUrl?: string;
  once?: boolean;
  at?: number;
  debug?: ChatDebug;
};

type RemoteThread = {
  username?: string;
  fullName?: string;
  mood?: string;
  memory?: string;
  warmth?: number;
  persona?: string;
  backstory?: string;
  lastPingAt?: number;
  world?: ChatWorld;
  arc?: ChatArc;
  bond?: ChatBond;
  updatedAt?: number;
  messages?: RemoteMessage[];
};

function msgSig(m: { role?: string; at?: number; text?: string; kind?: string }) {
  return `${m.role}:${Math.round((m.at || 0) / 500)}:${(m.text || "").slice(0, 80)}:${m.kind || ""}`;
}

function asMessages(key: string, rows: RemoteMessage[] | undefined): ChatMessage[] {
  return (rows ?? []).map((item, i) => ({
    id: item.id || `d-${key}-${item.at || 0}-${i}`,
    role: item.role === "user" ? "user" : "assistant",
    text: item.text || "",
    kind: (item.kind as ChatKind | undefined) || (item.photo ? "photo" : "text"),
    imageUrl: item.imageUrl,
    once: item.once,
    at: item.at || 0,
    debug: item.debug,
  }));
}

function mergeMessages(local: ChatMessage[], remote: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  const seenId = new Set<string>();
  const seenSig = new Set<string>();
  const add = (m: ChatMessage) => {
    if (m.id && seenId.has(m.id)) return;
    const s = msgSig(m);
    if (seenSig.has(s)) return;
    if (m.id) seenId.add(m.id);
    seenSig.add(s);
    out.push(m);
  };
  for (const m of local) add(m);
  for (const m of remote) add(m);
  return out.sort((a, b) => (a.seq != null && b.seq != null ? a.seq - b.seq : a.at - b.at)).slice(-240);
}

function messagesOverlap(a: ChatMessage[], b: ChatMessage[]) {
  if (!a.length || !b.length) return false;
  const ids = new Set(a.map((m) => m.id).filter(Boolean));
  const sigs = new Set(a.map(msgSig));
  return b.some((m) => (m.id && ids.has(m.id)) || sigs.has(msgSig(m)));
}

function mergeThread(local: ChatThread | undefined, remote: ChatThread): ChatThread {
  if (!local) return remote;
  const localAt = local.updatedAt || 0;
  const remoteAt = remote.updatedAt || 0;
  const newer = localAt >= remoteAt ? local : remote;
  const older = newer === local ? remote : local;
  return {
    ...older,
    ...newer,
    username: newer.username,
    fullName: newer.fullName || older.fullName,
    avatar: local.avatar || newer.avatar || older.avatar,
    messages: mergeMessages(local.messages, remote.messages),
    updatedAt: Math.max(localAt, remoteAt),
    unread: local.unread ?? 0,
    seenAt: local.seenAt,
    marks: local.marks || newer.marks,
    warmth: newer.warmth,
    bond: newer.bond || older.bond,
    world: newer.world || older.world,
    memory: newer.memory || older.memory,
    mood: newer.mood || older.mood,
    arc: newer.arc || older.arc,
    lastPingAt: Math.max(local.lastPingAt || 0, remote.lastPingAt || 0) || newer.lastPingAt,
    warmthUp: local.warmthUp,
    warmthDay: local.warmthDay,
    lastAlmostAt: local.lastAlmostAt,
    heldUntil: local.heldUntil,
    heldMsgId: local.heldMsgId,
    brainId: newer.brainId || older.brainId,
    onceSentAt: newer.onceSentAt || older.onceSentAt,
    onceDeleteAsked: local.onceDeleteAsked,
    persona: newer.persona || older.persona,
  };
}

function remoteToThread(row: RemoteThread): ChatThread | null {
  const key = String(row.username || "").trim().toLowerCase();
  if (!key) return null;
  const raised = asBond(row.bond, asWarmth(row.warmth));
  return {
    username: key,
    fullName: row.fullName || key,
    messages: asMessages(key, row.messages),
    updatedAt: row.updatedAt || Date.now(),
    unread: 0,
    persona: row.persona,
    mood: row.mood,
    memory: scrubMemory(row.memory),
    warmth: raised.warmth,
    world: row.world,
    arc: scrubArc(row.arc, raised.warmth),
    bond: raised,
    lastPingAt: row.lastPingAt,
  };
}

function queueDiskDump(thread: ChatThread) {
  const key = thread.username;
  const prev = diskTimers.get(key);
  if (prev) window.clearTimeout(prev);
  const id = window.setTimeout(() => {
    diskTimers.delete(key);
    void dumpChatToDisk({ data: { thread: slim(thread) } }).catch(() => undefined);
  }, 200);
  diskTimers.set(key, id);
}

function cancelDiskDump(key: string) {
  const prev = diskTimers.get(key);
  if (prev) window.clearTimeout(prev);
  diskTimers.delete(key);
}

const setupTimers = new Map<string, number>();

function rememberSetup(thread: ChatThread) {
  const key = thread.username;
  const prev = setupTimers.get(key);
  if (prev) window.clearTimeout(prev);
  const snapshot = thread;
  const id = window.setTimeout(() => {
    setupTimers.delete(key);
    const bond = asBond(snapshot.bond, asWarmth(snapshot.warmth));
    setChatSetup(key, {
      warmth: bond.warmth,
      trust: bond.trust,
      heat: bond.heat,
      irrit: bond.irrit,
      guilt: bond.guilt,
      spark: bond.spark,
      place: snapshot.world?.place,
      clothes: snapshot.world?.clothes,
      hair: snapshot.world?.hair,
      persona: snapshot.persona,
      mood: snapshot.mood,
    });
  }, 400);
  setupTimers.set(key, id);
}

async function persist(thread: ChatThread) {
  const key = thread.username;
  const nextEpoch = (epoch.get(key) ?? 0) + 1;
  epoch.set(key, nextEpoch);
  memory.set(key, thread);
  emitSoon();
  rememberSetup(thread);
  queueDiskDump(thread);
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    if ((epoch.get(key) ?? 0) !== nextEpoch) return;
    const light = forIdb(thread);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(light);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    if ((epoch.get(key) ?? 0) !== nextEpoch) {
      const live = memory.get(key);
      if (live && live !== thread) {
        const stamp = epoch.get(key) ?? 0;
        const db2 = await openDb();
        if ((epoch.get(key) ?? 0) !== stamp) return;
        await new Promise<void>((resolve, reject) => {
          const tx = db2.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(forIdb(live));
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    }
  } catch {
    /* ignore */
  }
}

function chatsReady() {
  try {
    return localStorage.getItem(READY_KEY) === "1";
  } catch {
    return false;
  }
}

function markChatsReady() {
  try {
    localStorage.setItem(READY_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function hydrateChats(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      localStorage.removeItem("shtora-chat-gone");
    } catch {
      /* ignore */
    }
    if (typeof indexedDB !== "undefined") {
      try {
        const db = await openDb();
        const rows = await new Promise<ChatThread[]>((resolve, reject) => {
          const tx = db.transaction(STORE, "readonly");
          const req = tx.objectStore(STORE).getAll();
          req.onsuccess = () => resolve((req.result as ChatThread[]) ?? []);
          req.onerror = () => reject(req.error);
        });
        for (const row of rows) {
          if (!row?.username) continue;
          const key = row.username.toLowerCase();
          const raised = asBond(row.bond, asWarmth(row.warmth));
          memory.set(key, {
            ...row,
            username: key,
            warmth: raised.warmth,
            bond: raised,
            memory: scrubMemory(row.memory),
            arc: scrubArc(row.arc, raised.warmth),
            messages: Array.isArray(row.messages) ? row.messages : [],
          });
        }
      } catch {
        /* IndexedDB optional */
      }
    }
    try {
      const api = await apiFetch("/api/state").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const threads = Array.isArray(api?.chats) ? api.chats : [];
      for (const raw of threads) {
        const remote = remoteToThread(raw as RemoteThread);
        if (!remote || !remote.messages.length) continue;
        const merged = mergeThread(memory.get(remote.username), remote);
        memory.set(remote.username, merged);
      }
    } catch {
      /* keep idb */
    }
    if (memory.size) markChatsReady();
    diskHydrated = true;
    hydrated = true;
  })();
  return hydratePromise;
}

export async function applyRemoteThreads(threads: RemoteThread[]) {
  await hydrateChats();
  let changed = false;
  for (const row of threads) {
    const remote = remoteToThread(row);
    if (!remote) continue;
    const key = remote.username;
    const local = memory.get(key);
    if (!remote.messages.length && !local) continue;
    if (!remote.messages.length && local) continue;
    const next = mergeThread(local, remote);
    if (local && next === local) continue;
    if (
      local &&
      next.messages.length === local.messages.length &&
      next.updatedAt === local.updatedAt &&
      next.messages.at(-1)?.id === local.messages.at(-1)?.id
    ) {
      continue;
    }
    memory.set(key, next);
    changed = true;
    void persist(next);
  }
  if (changed) emit();
}

export async function flushChatsToDisk() {
  await hydrateChats();
  const threads = [...memory.values()].map(slim);
  if (!threads.length) return { ok: true, n: 0, text: "" };
  try {
    const res = await apiFetch("/api/chat-dump", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threads }),
    });
    const parsed = (await res.json().catch(() => null)) as { n?: number } | null;
    return { ok: res.ok, n: parsed?.n ?? threads.length, text: chatsAsMarkdown() };
  } catch {
    return { ok: false, n: threads.length, text: chatsAsMarkdown() };
  }
}

export function chatsAsJson() {
  return JSON.stringify(
    [...memory.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((t) => ({
        username: t.username,
        fullName: t.fullName,
        warmth: t.warmth,
        bond: t.bond,
        mood: t.mood,
        memory: t.memory,
        world: t.world,
        arc: t.arc,
        marks: t.marks,
        updatedAt: t.updatedAt,
        messages: t.messages,
      })),
    null,
    2,
  );
}

export function chatsAsMarkdown() {
  return [...memory.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((t) => {
      const gf = storyFacts(chatBackstoryFor(t.username)).girlfriend;
      const dump = dumpBond(t.bond, asWarmth(t.warmth), gf);
      const world = [t.world?.place, t.world?.clothes, t.world?.hair].filter(Boolean).join(" / ") || "—";
      const head = [
        `# @${t.username}${t.fullName && t.fullName !== t.username ? ` — ${t.fullName}` : ""}`,
        dump.head,
        dump.pullLine,
        `место: ${world}`,
        t.mood ? `настроение: ${t.mood}` : "",
        t.memory ? `память: ${t.memory}` : "",
        `${t.messages.length} сообщ.`,
      ]
        .filter(Boolean)
        .join("\n");
      const body = t.messages
        .map((m) => {
          const d = m.debug;
          const meta = d
            ? `  [${
                d.spark != null
                  ? `б${d.warmth} д${d.trust} и${d.spark} н${d.heat} р${d.irrit} в${d.guilt ?? 0} · ${d.pull ?? "?"} ${d.stage || ""}`
                  : `${d.warmth}/${d.trust}/${d.heat}/${d.irrit}`
              }${d.place || d.clothes ? ` · ${[d.place, d.clothes].filter(Boolean).join(" / ")}` : ""}]`
            : "";
          return `${m.role === "user" ? "Он" : "Она"}: ${(m.text || "").trim() || (m.imageUrl ? "[фото]" : "")}${meta}`;
        })
        .join("\n");
      return `${head}\n\n${body}`;
    })
    .join("\n\n");
}

export function listThreads(): ChatThread[] {
  return [...memory.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getThread(username: string): ChatThread | undefined {
  return memory.get(username.trim().toLowerCase());
}

export function unreadTotal(): number {
  let n = 0;
  for (const thread of memory.values()) n += thread.unread || 0;
  return n;
}

export async function ensureThread(input: { username: string; fullName?: string; avatar?: string }) {
  await hydrateChats();
  const key = input.username.trim().toLowerCase();
  if (!key) return;
  const prev = memory.get(key);
  if (prev) {
    const next = {
      ...prev,
      fullName: input.fullName || prev.fullName,
      avatar: input.avatar || prev.avatar,
    };
    if (next.fullName !== prev.fullName || next.avatar !== prev.avatar) await persist(next);
    return;
  }
  const story = chatBackstoryFor(key);
  const saved = chatSetupFor(key);
  const bond = saved
    ? asBond(
        {
          warmth: saved.warmth,
          trust: saved.trust,
          heat: saved.heat,
          irrit: saved.irrit,
          guilt: saved.guilt,
          spark: saved.spark,
        },
        saved.warmth ?? 40,
      )
    : bondFromBackstory(story);
  markChatsReady();
  await persist({
    username: key,
    fullName: input.fullName || key,
    avatar: input.avatar,
    messages: [],
    updatedAt: Date.now(),
    unread: 0,
    warmth: bond.warmth,
    bond,
    marks: seedMarks(story),
    mood: saved?.mood || "спокойная",
    persona: saved?.persona,
    world:
      saved?.place || saved?.clothes || saved?.hair
        ? { place: saved.place, clothes: saved.clothes, hair: saved.hair }
        : undefined,
  });
}

export async function appendMessage(
  username: string,
  msg: Omit<Partial<ChatMessage>, "debug"> & { role: "user" | "assistant"; text: string; debug?: Partial<ChatDebug> },
  opts?: { incrementUnread?: boolean },
) {
  await hydrateChats();
  const key = username.trim().toLowerCase();
  await ensureThread({ username: key });
  const thread = memory.get(key);
  if (!thread) return;
  const item: ChatMessage = {
    id: msg.id || nid(),
    role: msg.role,
    text: msg.text || "",
    imageUrl: msg.imageUrl,
    kind: msg.kind || (msg.imageUrl ? "photo" : "text"),
    heartByUser: msg.heartByUser,
    heartByHer: msg.heartByHer,
    once: msg.once,
    viewed: msg.viewed,
    acted: msg.acted,
    at: msg.at || Date.now(),
    seq: msg.seq,
    debug: { ...snapshotDebug(thread), ...(msg.debug || {}) },
  };
  const unread = opts?.incrementUnread ? Math.min(9, (thread.unread || 0) + 1) : thread.unread;
  await persist({
    ...thread,
    messages: [...thread.messages, item].slice(-240),
    updatedAt: item.at,
    unread,
  });
}

export async function patchThread(username: string, patch: Partial<ChatThread>) {
  await hydrateChats();
  const key = username.trim().toLowerCase();
  const thread = memory.get(key);
  if (!thread) return;
  await persist({ ...thread, ...patch, username: key, messages: patch.messages ?? thread.messages });
}

export async function markThreadRead(username: string) {
  await hydrateChats();
  const key = username.trim().toLowerCase();
  const thread = memory.get(key);
  if (!thread || !thread.unread) return;
  await persist({ ...thread, unread: 0, seenAt: Date.now() });
}

export async function markAllChatsRead() {
  await hydrateChats();
  for (const thread of memory.values()) {
    if (thread.unread) await persist({ ...thread, unread: 0 });
  }
}

async function wipeIdb(usernames: string[] | "all") {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      if (usernames === "all") store.clear();
      else for (const name of usernames) store.delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function deleteThread(username: string) {
  await hydrateChats();
  const key = username.trim().toLowerCase();
  epoch.set(key, (epoch.get(key) ?? 0) + 1);
  cancelDiskDump(key);
  const thread = memory.get(key);
  if (thread) {
    const shell: ChatThread = {
      ...thread,
      messages: [],
      unread: 0,
      updatedAt: Date.now(),
      brainId: undefined,
      memory: undefined,
      arc: undefined,
      seenAt: undefined,
      lastPingAt: undefined,
      lastAlmostAt: undefined,
      heldUntil: 0,
      heldMsgId: undefined,
      onceSentAt: undefined,
      onceDeleteAsked: undefined,
      warmthUp: 0,
      warmthDay: "",
    };
    rememberSetup(shell);
    await persist(shell);
  } else {
    emit();
    markChatsReady();
    await wipeIdb([key]);
  }
  await eraseChatDisk({ data: { usernames: [key] } }).catch(() => undefined);
  window.setTimeout(() => {
    void eraseChatDisk({ data: { usernames: [key] } }).catch(() => undefined);
  }, 1200);
}

export async function clearAllChats() {
  await hydrateChats();
  const names = [...memory.keys()];
  for (const name of names) epoch.set(name, (epoch.get(name) ?? 0) + 1);
  for (const key of [...diskTimers.keys()]) cancelDiskDump(key);
  memory.clear();
  emit();
  markChatsReady();
  await wipeIdb("all");
  if (names.length) {
    await eraseChatDisk({ data: { usernames: names } }).catch(() => undefined);
    window.setTimeout(() => {
      void eraseChatDisk({ data: { usernames: names } }).catch(() => undefined);
    }, 1200);
  }
}

export async function setMessageHeart(username: string, id: string, who: "user" | "assistant", on: boolean) {
  await hydrateChats();
  const key = username.trim().toLowerCase();
  const thread = memory.get(key);
  if (!thread) return;
  await persist({
    ...thread,
    messages: thread.messages.map((item) =>
      item.id === id
        ? {
            ...item,
            heartByUser: who === "user" ? on : item.heartByUser,
            heartByHer: who === "assistant" ? on : item.heartByHer,
          }
        : item,
    ),
  });
}

export async function bumpWarmth(username: string, delta: number) {
  await hydrateChats();
  const key = username.trim().toLowerCase();
  const thread = memory.get(key);
  if (!thread || !delta) return;
  const day = new Date().toISOString().slice(0, 10);
  let up = thread.warmthDay === day ? thread.warmthUp || 0 : 0;
  let applied = delta;
  if (delta > 0) {
    applied = Math.min(delta, Math.max(0, 10 - up));
    up += applied;
  }
  if (!applied && delta > 0) return;
  const warmth = asWarmth(thread.warmth + applied);
  const bond = asBond(thread.bond, warmth);
  bond.warmth = warmth;
  await persist({ ...thread, warmth, warmthUp: up, warmthDay: day, bond });
}

export async function applyBond(username: string, delta: BondDelta) {
  await hydrateChats();
  const key = username.trim().toLowerCase();
  const thread = memory.get(key);
  if (!thread) return;
  const prev = asBond(thread.bond, asWarmth(thread.warmth));
  const next: ChatBond = {
    warmth: clampBond(prev.warmth + (delta.warmth || 0)),
    trust: clampBond(prev.trust + (delta.trust || 0)),
    heat: clampBond(prev.heat + (delta.heat || 0)),
    irrit: clampBond(prev.irrit + (delta.irrit || 0)),
    guilt: clampBond(prev.guilt + (delta.guilt || 0)),
    spark: clampBond(prev.spark + (delta.spark || 0)),
  };
  await persist({ ...thread, bond: next, warmth: next.warmth });
}

export async function resetGrokGame(username: string) {
  await hydrateChats();
  const key = username.trim().toLowerCase();
  const thread = memory.get(key);
  if (!thread) return;
  await persist({ ...thread, brainId: undefined });
}

export async function setBondManual(username: string, bond: ChatBond) {
  await hydrateChats();
  const key = username.trim().toLowerCase();
  const thread = memory.get(key);
  if (!thread) return;
  const next = asBond(bond, bond.warmth);
  await persist({ ...thread, bond: next, warmth: next.warmth });
}

export async function applyBackstory(username: string, story: string, opts?: { resetMetrics?: boolean }) {
  await hydrateChats();
  const key = username.trim().toLowerCase();
  await ensureThread({ username: key });
  const thread = memory.get(key);
  if (!thread) return;
  const empty = !thread.messages.length;
  const bond = opts?.resetMetrics
    ? bondFromBackstory(story)
    : asBond(thread.bond, asWarmth(thread.warmth));
  await persist({
    ...thread,
    warmth: bond.warmth,
    bond,
    marks: opts?.resetMetrics ? seedMarks(story) : thread.marks,
    mood: thread.mood || (empty ? "спокойная" : thread.mood),
    brainId: opts?.resetMetrics ? undefined : thread.brainId,
  });
}

export async function viewOncePhoto(username: string, id: string) {
  await hydrateChats();
  const key = username.trim().toLowerCase();
  const thread = memory.get(key);
  if (!thread) return;
  await persist({
    ...thread,
    messages: thread.messages.map((item) => (item.id === id ? { ...item, viewed: true, imageUrl: undefined } : item)),
  });
}

export async function performAction(username: string, id: string) {
  await hydrateChats();
  const key = username.trim().toLowerCase();
  const thread = memory.get(key);
  if (!thread) return null;
  const index = thread.messages.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const streak = thread.messages
    .slice(Math.max(0, index - 4), index + 1)
    .filter((item) => item.role === "assistant")
    .map((item) => item.text || "")
    .join("\n");
  const ask = herAsk(streak);
  const messages = thread.messages.map((item, i) => (i === index ? { ...item, acted: true } : item));
  await persist({ ...thread, messages });
  await appendMessage(key, {
    role: "user",
    text: ask?.did || "сделал, как просила",
    kind: "action",
  });
  return ask;
}
