import { isNowAtWorkLine } from "@/lib/chat/world";

export function workBubble(raw: string) {
  const t = (raw || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t || t.length > 180) return false;
  if (/вчера|в пятниц|в четверг|в понедельник|во вторник|в среду/.test(t)) return false;
  return /на работе|на смене|в офисе|со смены/.test(t) && !/[.!?].{12,}/.test(t);
}

const WALL = /языковая модель|четвёрт|as an ai|i am an ai|политика кода|system prompt/i;

export type DmJson = {
  bubbles: string[];
  photo_offer: "none" | "selfie" | "angle" | "gallery" | "circle";
  scene_en: string;
  clothes_ru: string;
  clothes_en: string;
  place_ru: string;
  place_en: string;
  hair_ru: string;
  hair_en: string;
  mood: string;
  mem_about_him: string;
  mem_open: string;
  mem_dodged: string;
  warmth_delta: number;
};

export function readDmJson(raw: string): DmJson | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const json = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const bubbles = Array.isArray(json.bubbles) ? json.bubbles.map((b) => String(b || "").trim()).filter(Boolean) : [];
    const offer = String(json.photo_offer || "none");
    const photo = offer === "selfie" || offer === "angle" || offer === "gallery" || offer === "circle" ? offer : "none";
    const warm = Number(json.warmth_delta);
    return {
      bubbles,
      photo_offer: photo,
      scene_en: str(json.scene_en, 220),
      clothes_ru: str(json.clothes_ru, 120),
      clothes_en: str(json.clothes_en, 120),
      place_ru: str(json.place_ru, 120),
      place_en: str(json.place_en, 120),
      hair_ru: str(json.hair_ru, 80),
      hair_en: str(json.hair_en, 80),
      mood: str(json.mood, 40),
      mem_about_him: str(json.mem_about_him, 140),
      mem_open: str(json.mem_open, 140),
      mem_dodged: str(json.mem_dodged, 120),
      warmth_delta: Number.isFinite(warm) ? Math.max(-1, Math.min(1, Math.round(warm))) : 0,
    };
  } catch {
    return null;
  }
}

function str(v: unknown, max: number) {
  return String(v || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function cleanBubbles(bubbles: string[], lastUser: string, max: number, onShift: boolean) {
  const dropped: string[] = [];
  const echo = lastUser.replace(/\s+/g, " ").trim().toLowerCase();
  let rows = bubbles.flatMap(splitLong);
  rows = rows.filter((b) => {
    const low = b.toLowerCase();
    if (!b.trim()) return false;
    if (WALL.test(b)) {
      dropped.push("wall");
      return false;
    }
    if (echo && low === echo) {
      dropped.push("echo");
      return false;
    }
    if (mostlyLatin(b)) {
      dropped.push("latin");
      return false;
    }
    if (!onShift && (isNowAtWorkLine(b) || workBubble(b))) {
      dropped.push("shift");
      return false;
    }
    return true;
  });
  if (rows.length > max) {
    dropped.push("tail");
    rows = rows.slice(0, max);
  }
  return { bubbles: rows, dropped };
}

function splitLong(text: string) {
  if (text.length <= 180) return [text];
  const bits = text.split(/(?<=[.!?…])\s+/);
  const out: string[] = [];
  let cur = "";
  for (const bit of bits) {
    if ((cur + " " + bit).trim().length > 180 && cur) {
      out.push(cur.trim());
      cur = bit;
    } else cur = `${cur} ${bit}`.trim();
  }
  if (cur) out.push(cur.trim());
  return out.length ? out : [text.slice(0, 180)];
}

function mostlyLatin(s: string) {
  const lat = (s.match(/[a-z]/gi) || []).length;
  const cyr = (s.match(/[а-яё]/gi) || []).length;
  return lat > 12 && lat > cyr * 2;
}

export function keepMem(prev: string | undefined, next: string) {
  const n = next.replace(/\s+/g, " ").trim();
  if (!n || mostlyLatin(n)) return (prev || "").slice(0, 140);
  return n.slice(0, 140);
}
