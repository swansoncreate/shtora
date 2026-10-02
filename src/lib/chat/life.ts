import { asBond, stageFrom, type ChatBond } from "./bond";
import { dayNow, moscowHourAt } from "./day";
import { looksLikeCatalogAsk, looksLikePhotoAsk, storyFacts } from "./functions";
import { getShtoraSettings } from "@/lib/shtora-settings";
import { getCachedStories } from "@/lib/instagram/cache";

type HoldThread = {
  messages: Array<{ id?: string; role: string; text: string; kind?: string; at: number }>;
  bond?: ChatBond;
  warmth?: number;
  heldUntil?: number;
  heldMsgId?: string;
  lastAlmostAt?: number;
};

export type ChatMarks = {
  wounds: string[];
  soft: string[];
};

export function seedMarks(backstory: string): ChatMarks {
  const facts = storyFacts(backstory);
  const wounds: string[] = [];
  const soft: string[] = [];
  if (facts.girlfriend) wounds.push("его девушка — её близкая");
  if (facts.gapLabel) wounds.push(facts.gapLabel);
  if (/из ниоткуда|внезапно|вдруг написал|лайкнул пост/.test((backstory || "").toLowerCase())) {
    wounds.push("написал из ниоткуда");
  }
  return { wounds: wounds.slice(0, 3), soft: soft.slice(0, 3) };
}

export function noteMark(marks: ChatMarks | undefined, kind: "wound" | "soft", line: string): ChatMarks {
  const next: ChatMarks = {
    wounds: [...(marks?.wounds ?? [])],
    soft: [...(marks?.soft ?? [])],
  };
  const list = kind === "wound" ? next.wounds : next.soft;
  const key = line.toLowerCase().slice(0, 28);
  if (list.some((x) => x.toLowerCase().startsWith(key.slice(0, 18)))) return marks ?? next;
  list.unshift(line.slice(0, 80));
  if (kind === "wound") next.wounds = list.slice(0, 3);
  else next.soft = list.slice(0, 3);
  return next;
}

export function marksFromTurn(prev: ChatMarks | undefined, userText: string, backstory: string): ChatMarks {
  let marks = prev ?? seedMarks(backstory);
  const t = userText.toLowerCase();
  if (looksLikeCatalogAsk(t)) marks = noteMark(marks, "wound", "лезет в тело");
  if (/она не узнает|не говори|не рассказ|забей на/.test(t)) marks = noteMark(marks, "wound", "просит молчать про подругу");
  if (/как ты|что делаешь|как смена|как работа|что ела/.test(t) && !looksLikeCatalogAsk(t)) {
    marks = noteMark(marks, "soft", "спросил как она, не только тело");
  }
  if (/прости|извини|ладно не|окей не надо/.test(t)) marks = noteMark(marks, "soft", "остановился когда сказала стоп");
  return marks;
}

export function marksLine(marks?: ChatMarks) {
  if (!marks) return "";
  const w = marks.wounds.length ? `раны: ${marks.wounds.join("; ")}` : "";
  const s = marks.soft.length ? `слабые места: ${marks.soft.join("; ")}` : "";
  return [w, s].filter(Boolean).join(". ");
}

export function busyLine(username: string) {
  const pack = getCachedStories(username)?.data as { items?: unknown[] } | undefined;
  const n = pack?.items?.length ?? 0;
  const day = dayNow();
  if (n > 0) return `у неё сейчас сторис (${n}) — своя жизнь идёт, но в чат она отвечает.`;
  if (day.slot === "weekend") return "выходной: дома или своими делами, не на смене.";
  if (day.slot === "work") return "на работе: короче обычного, но отвечает на вопрос, не одно слово.";
  if (day.slot === "sleep") return "спит / телефон не в руках. если ответит — сонная.";
  return "";
}

export function holdFor(thread: HoldThread, viewing: boolean, alreadyAway: boolean) {
  if (viewing) return 0;
  if (alreadyAway) return 0;
  const last = thread.messages.at(-1);
  if (!last || last.role !== "user") return 0;
  if (thread.heldUntil && thread.heldMsgId === last.id) {
    const left = thread.heldUntil - Date.now();
    if (left > 3 * 60_000) return 8_000 + Math.random() * 12_000;
    return Math.max(0, left);
  }

  const lastHer = [...thread.messages].reverse().find((m) => m.role === "assistant");
  const active = Boolean(lastHer && last.at - lastHer.at < 25 * 60_000);
  const asked = /\?|как ты|что делаешь|как работа|как смена|как настроение/.test((last.text || "").toLowerCase());
  const day = dayNow();
  const bond = asBond(thread.bond, thread.warmth);
  const stage = stageFrom(bond);
  const pressure = looksLikeCatalogAsk(last.text) || looksLikePhotoAsk(last.text);
  const night = (() => {
    const h = moscowHourAt(last.at);
    return h >= 1 && h < 7;
  })();

  if ((day.slot === "sleep" || night) && !viewing && !active) {
    const h = moscowHourAt(Date.now());
    const hours = h >= 1 && h < 7 ? 7 - h : 0;
    if (hours > 0) return Math.min(2 * 3600_000, hours * 3600_000 * 0.35 + Math.random() * 20 * 60_000);
  }

  if (last.kind === "heart" || (last.kind === "post" && !(last.text || "").trim())) {
    return active ? 8_000 + Math.random() * 22_000 : 25_000 + Math.random() * 70_000;
  }

  if (active || asked) {
    if (day.slot === "work") return 5_000 + Math.random() * 18_000;
    return 2_000 + Math.random() * 8_000;
  }

  if (day.slot === "work" && !pressure) return 20_000 + Math.random() * 50_000;
  if ((stage === "ice" || stage === "test" || stage === "snap") && Math.random() < 0.35) {
    return 15_000 + Math.random() * 40_000;
  }
  if (pressure && stage !== "fall" && Math.random() < 0.3) return 20_000 + Math.random() * 40_000;
  return 0;
}

export function nightNote(at: number) {
  const h = moscowHourAt(at);
  if (h >= 1 && h < 7) return `он писал в ${String(h).padStart(2, "0")} ночи.`;
  return "";
}

const LIKE_KEY = "shtora-like-log-v1";
const JEAL_KEY = "shtora-jealous-v1";
const DM_KEY = "shtora-public-dm-v1";

type LikeRow = { username: string; at: number };
type JealRow = { username: string; other: string; at: number };
type DmRow = { username: string; at: number; text: string };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function noteLike(username: string) {
  const name = username.trim().toLowerCase();
  const log = readJson<LikeRow[]>(LIKE_KEY, []).filter((r) => Date.now() - r.at < 6 * 3600_000);
  log.push({ username: name, at: Date.now() });
  writeJson(LIKE_KEY, log.slice(-20));
  const favorites = (getShtoraSettings().favorites || []).map((n) => n.toLowerCase()).filter((n) => n && n !== name);
  const due = readJson<JealRow[]>(JEAL_KEY, []);
  for (const other of favorites) {
    if (due.some((r) => r.username === other && Date.now() - r.at < 8 * 3600_000)) continue;
    if (Math.random() > 0.55) continue;
    due.push({ username: other, other: name, at: Date.now() + 40_000 + Math.random() * 8 * 60_000 });
  }
  writeJson(JEAL_KEY, due.slice(-12));
}

export function takeJealousDue(): JealRow[] {
  const rows = readJson<JealRow[]>(JEAL_KEY, []);
  const now = Date.now();
  const due = rows.filter((r) => r.at <= now);
  writeJson(JEAL_KEY, rows.filter((r) => r.at > now));
  return due;
}

export function queuePublicDm(username: string, userText: string) {
  const rows = readJson<DmRow[]>(DM_KEY, []);
  rows.push({
    username: username.trim().toLowerCase(),
    at: Date.now() + 25_000 + Math.random() * 3 * 60_000,
    text: userText.slice(0, 180),
  });
  writeJson(DM_KEY, rows.slice(-12));
}

export function takePublicDmDue(): DmRow[] {
  const rows = readJson<DmRow[]>(DM_KEY, []);
  const now = Date.now();
  const due = rows.filter((r) => r.at <= now);
  writeJson(DM_KEY, rows.filter((r) => r.at > now));
  return due;
}

export type HerAsk = {
  key: string;
  did: string;
  photo?: boolean;
  girlfriend?: boolean;
};

export function herAsk(text: string): HerAsk | null {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return null;
  if (/удал\w*.{0,24}(кат|ол|девушк|из друз)|убери .{0,12}(кат|ол)|блокн|исключи её|удали её/.test(t)) {
    return { key: "unfriend", did: "удалил катю/олю из друзей", girlfriend: true };
  }
  if (/не пиши ей|не общайся с ней|прекрати с ней|удали переписк/.test(t)) {
    return { key: "stop-gf", did: "перестал писать девушке", girlfriend: true };
  }
  if (/поклян|пообещ/.test(t)) return { key: "swear", did: "поклялся ей" };
  if (/сво(ё|е) фото|скинь себя|покажи себя|а ты скинь|давай сво(ё|е)|своё лицо/.test(t)) {
    return { key: "his-photo", did: "скинул ей своё фото", photo: true };
  }
  if (/удали (то )?фото|сотри (это )?фото/.test(t)) return { key: "delete-photo", did: "удалил то фото" };
  if (/позвон/.test(t)) return { key: "call", did: "позвонил ей" };
  if (/приезж|приди|давай встрет|увидимся/.test(t)) return { key: "meet", did: "согласился встретиться" };
  if (/\b(сделай это|ну сделай|докажи)\b/.test(t)) return { key: "do", did: "сделал, как просила" };
  return null;
}

export function herAskFromStreak(texts: string[]) {
  return herAsk(texts.filter(Boolean).join("\n"));
}

export function publicCommentText(raw: string) {
  const t = raw.replace(/\s+/g, " ").trim();
  const cut = t.split(/[.!?]/)[0] || t;
  return cut.slice(0, 42) || "+";
}
