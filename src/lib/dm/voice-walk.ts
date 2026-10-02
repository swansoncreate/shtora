import { specificClothes, type ChatWorld, type DaySlot } from "@/lib/chat/world";
import { looksLikeClothesAsk, looksLikePhotoAsk, looksLikeRefuse, sheOffersPhoto } from "@/lib/chat/functions";
import { offerAllowed, type DmFlags, type DmMove } from "./flags";
import { decideDmMedia } from "./media";
import { cleanBubbles, keepMem, readDmJson, type DmJson } from "./post";
import { fallbackBubble } from "./voice";
import { acceptLook, isBannedClothes } from "./world";

export type ModelRaw = { ok: boolean; raw: string; error?: string };

const FILE_NOTE = "Кадр не ушёл, напиши это сама в одном пузыре. Только JSON, photo_offer none.";
const SHIFT_NOTE = "Сейчас не смена, напиши заново без работы. Один-два пузыря, только JSON.";
const JSON_NOTE = "Прошлый ответ не JSON. Верни только JSON контракта.";
const EMPTY_NOTE = "Напиши один короткий пузырь. Только JSON.";

export function dmLog(row: {
  hint: string;
  move: string;
  confidence: number;
  flags: DmFlags;
  raw: string;
  dropped: string[];
  retry: boolean;
  why: string;
  template: boolean;
  photo: string;
  verbal?: string;
}) {
  return JSON.stringify({
    hint: row.hint,
    move: row.move,
    confidence: Number.isFinite(row.confidence) ? Number(row.confidence.toFixed(2)) : 0.5,
    flags: {
      selfie: row.flags.selfie,
      angle: row.flags.angle,
      gallery: row.flags.gallery,
      circle: row.flags.circle,
      reason: row.flags.reason,
      register: row.flags.register,
    },
    verbal: row.verbal || row.flags.verbal,
    raw: row.raw.slice(0, 800),
    dropped: row.dropped,
    retry: row.retry,
    why: row.why,
    template: row.template,
    photo: row.photo,
    inserted: false,
  });
}

export async function consumeVoice(opts: {
  text: string;
  onShift: boolean;
  stage: string;
  flags: DmFlags;
  move: DmMove;
  camera: "" | "back" | "side" | "full";
  world: ChatWorld;
  slot: DaySlot;
  hint: string;
  confidence: number;
  recent?: boolean;
  first: ModelRaw;
  again: (note: string) => Promise<ModelRaw>;
}) {
  if (!opts.first.ok) return { failed: opts.first.error || "Чат не ответил." } as const;
  let rawText = opts.first.raw;
  let json = readDmJson(opts.first.raw);
  let retry = false;
  let why = "none";
  if (!json) {
    retry = true;
    why = "json";
    const again = await opts.again(JSON_NOTE);
    if (!again.ok) return { failed: again.error || "Чат не ответил." } as const;
    rawText = again.raw;
    json = readDmJson(again.raw);
    if (!json) return done(opts, [fallbackBubble(opts.stage)], "none", "", opts.world, undefined, rawText, ["invalid-json"], true, "json", true);
  }
  let cleaned = cleanBubbles(json.bubbles, opts.text, opts.flags.maxBubbles, opts.onShift);
  if (!cleaned.bubbles.length && cleaned.dropped.includes("shift")) {
    retry = true;
    why = "shift";
    const again = await opts.again(SHIFT_NOTE);
    rawText = again.raw || rawText;
    const next = again.ok ? readDmJson(again.raw) : null;
    if (next) {
      json = next;
      cleaned = cleanBubbles(next.bubbles, opts.text, opts.flags.maxBubbles, opts.onShift);
    }
    if (!cleaned.bubbles.length) return done(opts, [fallbackBubble(opts.stage)], "none", "", opts.world, json, rawText, ["shift"], true, "shift", true);
  } else if (!cleaned.bubbles.length) {
    retry = true;
    why = "json";
    const again = await opts.again(EMPTY_NOTE);
    rawText = again.raw || rawText;
    const next = again.ok ? readDmJson(again.raw) : null;
    if (next) {
      json = next;
      cleaned = cleanBubbles(next.bubbles, opts.text, opts.flags.maxBubbles, opts.onShift);
    }
    if (!cleaned.bubbles.length) return done(opts, [fallbackBubble(opts.stage)], "none", "", opts.world, json, rawText, ["invalid-json"], true, "json", true);
  }
  const promised = sheOffersPhoto(cleaned.bubbles.join(" "));
  const allowed = offerAllowed(opts.flags, json.photo_offer);
  if (promised && json.photo_offer !== "none" && !allowed) {
    retry = true;
    why = "file";
    const again = await opts.again(FILE_NOTE);
    rawText = again.raw || rawText;
    const next = again.ok ? readDmJson(again.raw) : null;
    if (next) {
      const second = cleanBubbles(next.bubbles, opts.text, opts.flags.maxBubbles, opts.onShift);
      if (second.bubbles.length) {
        json = { ...next, photo_offer: "none" };
        cleaned = second;
      }
    }
    json = { ...json, photo_offer: "none" };
  } else if (!allowed) json = { ...json, photo_offer: "none" };
  const nextWorld = acceptLook(
    opts.world,
    {
      clothesRu: json.clothes_ru,
      clothesEn: json.clothes_en,
      placeRu: json.place_ru,
      placeEn: json.place_en,
      hairRu: json.hair_ru,
      hairEn: json.hair_en,
    },
    opts.slot,
  );
  nextWorld.memAbout = keepMem(opts.world.memAbout, json.mem_about_him);
  nextWorld.memOpen = keepMem(opts.world.memOpen, json.mem_open);
  nextWorld.memDodged = keepMem(opts.world.memDodged, json.mem_dodged);
  const clothesOk = Boolean(specificClothes(nextWorld.clothes)) && !isBannedClothes(nextWorld.clothes);
  const said = cleaned.bubbles.join(" ");
  const refused = looksLikeRefuse(said);
  const asked =
    looksLikePhotoAsk(opts.text) ||
    looksLikeClothesAsk(opts.text) ||
    (Boolean(opts.recent) && /задер|задра|^(ещё|еще|давай|выше)\b/i.test(opts.text.trim()));
  if (!refused && json.photo_offer === "none" && opts.flags.selfie && clothesOk && (promised || asked)) {
    json = { ...json, photo_offer: "selfie" };
  }
  if (promised && json.photo_offer !== "none" && (!offerAllowed(opts.flags, json.photo_offer) || ((json.photo_offer === "selfie" || json.photo_offer === "angle") && !clothesOk))) {
    json = { ...json, photo_offer: "none" };
  }
  const media = decideDmMedia({
    offer: json.photo_offer,
    flags: opts.flags,
    move: opts.move,
    camera: opts.camera,
    clothesEn: nextWorld.clothes,
  });
  return done(opts, cleaned.bubbles, media.kind, json.scene_en || media.scene, nextWorld, json, rawText, cleaned.dropped, retry, why, false);
}

function done(
  opts: { hint: string; move: string; confidence: number; flags: DmFlags; world: ChatWorld },
  bubbles: string[],
  photo: string,
  scene: string,
  world: ChatWorld,
  json: DmJson | undefined,
  raw: string,
  dropped: string[],
  retry: boolean,
  why: string,
  template: boolean,
) {
  return {
    bubbles,
    photo,
    scene,
    world,
    json,
    log: dmLog({
      hint: opts.hint,
      move: opts.move,
      confidence: opts.confidence,
      flags: opts.flags,
      raw,
      dropped,
      retry,
      why,
      template,
      photo,
    }),
  } as const;
}
