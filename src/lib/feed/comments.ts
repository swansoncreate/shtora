import { asBond } from "@/lib/chat/bond";
import { chatReply } from "@/lib/chat/functions";
import { queuePublicDm, publicCommentText } from "@/lib/chat/life";
import { asWarmth, getThread, hydrateChats } from "@/lib/chat/store";
import { worldPrompt } from "@/lib/chat/world";
import { characterCanon, getShtoraSettings } from "@/lib/shtora-settings";

const KEY = "shtora-feed-comments-v2";

export type FeedComment = {
  id: string;
  postId: string;
  username: string;
  author: string;
  role: "user" | "owner" | "other";
  text: string;
  at: number;
  heart?: boolean;
};

type Store = Record<string, FeedComment[]>;

const GHOST = ["lera.ss", "nastia.room", "kit.kit", "polina.ww"];
const LINES = ["+", "огонь", "где это", "жиза", "красиво", "это ты сама?", "сегодня огонь", "😍", "можно в лс", "нереал"];

const listeners = new Set<() => void>();

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn());
}

export function subscribeComments(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function commentsFor(postId: string, now = Date.now()): FeedComment[] {
  return (read()[postId] ?? []).filter((c) => c.at <= now);
}

export function commentCount(postId: string, now = Date.now()) {
  return commentsFor(postId, now).length;
}

function nid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function addComment(row: Omit<FeedComment, "id"> & { id?: string }) {
  const store = read();
  const item: FeedComment = { ...row, id: row.id || nid(), text: row.text.trim().slice(0, 400) };
  store[row.postId] = [...(store[row.postId] ?? []), item];
  write(store);
  return item;
}

function hash(s: string) {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return n;
}

export function seedPostCrowd(postId: string, owner: string, favorites: string[]) {
  if (commentsFor(postId, Date.now() + 86400000).some((c) => c.role === "other")) return;
  const others = [
    ...favorites.map((n) => n.toLowerCase()).filter((n) => n && n !== owner.toLowerCase()),
    ...GHOST,
  ];
  const n = 1 + (hash(postId) % 2);
  const picked = others.slice(0, 6).sort((a, b) => hash(postId + a) - hash(postId + b)).slice(0, n);
  picked.forEach((author, i) => {
    addComment({
      postId,
      username: owner,
      author,
      role: "other",
      text: LINES[hash(postId + author) % LINES.length] || "+",
      at: Date.now() + (2 + i * 7 + (hash(author) % 12)) * 60_000,
    });
  });
}

export function heartComment(postId: string, id: string) {
  const store = read();
  store[postId] = (store[postId] ?? []).map((c) => (c.id === id ? { ...c, heart: true } : c));
  write(store);
}

export async function replyToComment(postId: string, username: string, caption: string, userText: string) {
  await hydrateChats();
  const userRow = addComment({
    postId,
    username,
    author: "ты",
    role: "user",
    text: userText,
    at: Date.now(),
  });
  if (getThread(username)) queuePublicDm(username, userText);
  const delay = 4_000 + Math.random() * 10_000;
  const heartOnly = Math.random() < 0.22;
  window.setTimeout(() => {
    if (heartOnly) {
      heartComment(postId, userRow.id);
      return;
    }
    void replyNow(postId, username, caption, userText).then((row) => {
      if (row && Math.random() < 0.45) heartComment(postId, userRow.id);
    });
  }, delay);
  return userRow;
}

async function replyNow(postId: string, username: string, caption: string, userText: string) {
  const thread = getThread(username);
  const bond = asBond(thread?.bond, asWarmth(thread?.warmth));
  const prior = commentsFor(postId, Date.now() + 86400000).map((c) => ({
    role: (c.role === "owner" ? "assistant" : "user") as "user" | "assistant",
    text: c.role === "other" ? `${c.author}: ${c.text}` : c.text,
    kind: "text" as const,
  }));
  const settings = getShtoraSettings();
  const result = await chatReply({
    data: {
      username,
      fullName: thread?.fullName,
      history: [
        {
          role: "user",
          text: `ПУБЛИЧНЫЙ коммент под постом, не директ. коротко и холодно, как при всех. не интим. подпись: ${caption || "без подписи"}`,
          kind: "post",
        },
        ...prior.slice(-8),
        { role: "user", text: userText, kind: "text" },
      ],
      persona: thread?.persona,
      mood: thread?.mood,
      memory: thread?.memory,
      backstory: characterCanon(username),
      warmth: bond.warmth,
      trust: bond.trust,
      heat: bond.heat,
      irrit: bond.irrit,
      worldLine: worldPrompt(thread?.world),
      chatApiKey: settings.chatApiKey,
      chatModel: settings.chatModel,
    },
  });
  if (!result || !("ok" in result) || !result.ok) return null;
  const text = publicCommentText(result.text || "");
  if (!text) return null;
  return addComment({
    postId,
    username,
    author: username,
    role: "owner",
    text: text.slice(0, 80),
    at: Date.now(),
  });
}
