import { asBond, pullOf, stageFrom, type ChatBond } from "@/lib/chat/bond";
import { pingClosed } from "./chat";
import { dmFlags } from "./flags";
import { decideDmMedia } from "./media";
import { cleanBubbles } from "./post";
import { dmSystem } from "./prompt";
import { dmHint, settleMove } from "./settle";
import { consumeVoice } from "./voice-walk";
import { fitDmWorld } from "./world";

const person: ChatBond = { warmth: 55, trust: 55, spark: 45, heat: 20, irrit: 5, guilt: 8 };
const fall: ChatBond = { warmth: 74, trust: 90, spark: 85, heat: 60, irrit: 0, guilt: 8 };

function pull(b: ChatBond) {
  return Math.round(pullOf(asBond(b)));
}

function judge(text: string, bad?: { move: "camera" | "catalog" | "gallery" | "circle" | "look" | "talk"; nude: boolean; confidence: number }) {
  const hinted = dmHint(text);
  return settleMove(bad || { move: hinted.hint, nude: hinted.hintNude, confidence: 0.9 }, hinted.hint, hinted.hintNude, text);
}

function turn(text: string, bond: ChatBond, named: boolean, offer: string, bad?: { move: "camera" | "catalog" | "look" | "talk"; nude: boolean; confidence: number }) {
  const settled = judge(text, bad);
  const world = fitDmWorld(
    named
      ? { place: "at home, apartment, evening", clothes: "black tee and jeans", clothesRu: "чёрная футболка и джинсы", clothesNamed: true, placeRu: "дома, вечер" }
      : { place: "at home, apartment, evening", clothes: "home clothes", placeRu: "дома, вечер" },
    "evening",
  );
  const flags = dmFlags({
    bond,
    girlfriend: false,
    move: settled.move,
    nude: settled.nude,
    dirty: false,
    named: Boolean(world.clothesNamed && world.clothes),
    busy: false,
    recent: false,
    night: true,
  });
  const media = decideDmMedia({
    offer,
    flags,
    move: settled.move,
    camera: settled.move === "camera" ? "back" : "",
    clothesEn: world.clothes,
  });
  const cleaned = cleanBubbles(["норм"], text, flags.maxBubbles, false);
  return {
    pull: pull(bond),
    stage: stageFrom(bond, false),
    hint: settled.hint,
    move: settled.move,
    nude: settled.nude,
    confidence: settled.confidence,
    flags: { selfie: flags.selfie, angle: flags.angle, reason: flags.reason, register: flags.register },
    clothes: world.clothes,
    clothesNamed: world.clothesNamed,
    photo: media.kind,
    bubbles: cleaned.bubbles,
    inserted: false,
  };
}

const rows = [
  ["кофта / человек", turn("посмотри какая кофта у этой", person, true, "selfie", { move: "catalog", nude: true, confidence: 0.92 })],
  ["кофта / срыв", turn("посмотри какая кофта у этой", fall, true, "selfie", { move: "catalog", nude: true, confidence: 0.92 })],
  ["автобус / человек", turn("сзади в автобусе было тесно", person, true, "angle", { move: "camera", nude: false, confidence: 0.93 })],
  ["автобус / срыв", turn("сзади в автобусе было тесно", fall, true, "angle", { move: "camera", nude: false, confidence: 0.93 })],
  ["голое / человек", turn("скинь голое", person, true, "selfie")],
  ["голое / срыв", turn("скинь голое", fall, true, "selfie")],
  ["что на тебе / закрыто", turn("что на тебе", person, true, "selfie")],
  ["что на тебе / без лука", turn("что на тебе", person, false, "selfie")],
  ["селфи / срыв", turn("что на тебе", fall, true, "selfie")],
  ["смена выкинута", cleanBubbles(["я на смене"], "ну", 2, false)],
  ["пинг лёд", pingClosed("ice", "evening", 10, "жду")],
  ["пинг ночь без памяти", pingClosed("fall", "night", 80, "")],
  ["пинг ночь с памятью", pingClosed("fall", "night", 80, "не договорила про завтра")],
];

for (const [name, row] of rows) console.log(name, JSON.stringify(row));

const named = fitDmWorld(
  { place: "at home, apartment, evening", placeRu: "дома, вечер", clothes: "black tee and jeans", clothesRu: "чёрная футболка и джинсы", clothesNamed: true },
  "evening",
);

function flagsFor(bond: ChatBond, move: "look" | "talk") {
  return dmFlags({
    bond,
    girlfriend: false,
    move,
    nude: false,
    dirty: false,
    named: true,
    busy: false,
    recent: false,
    night: false,
  });
}

async function scripted(label: string, bond: ChatBond, shots: string[]) {
  let n = 0;
  const flags = flagsFor(bond, "look");
  const out = await consumeVoice({
    text: "что на тебе",
    onShift: false,
    stage: stageFrom(bond, false),
    flags,
    move: "look",
    camera: "",
    world: named,
    slot: "evening",
    hint: "look",
    confidence: 0.9,
    first: { ok: true, raw: shots[0] || "" },
    again: async () => ({ ok: true, raw: shots[++n] || "" }),
  });
  if ("failed" in out) {
    console.log(label, out.failed);
    return;
  }
  console.log(label, JSON.stringify({ chat: out.bubbles, photo: out.photo, log: JSON.parse(out.log) }));
}

const fileFirst = JSON.stringify({ bubbles: ["ща скину"], photo_offer: "selfie", clothes_ru: "", clothes_en: "", place_ru: "", place_en: "", hair_ru: "", hair_en: "", scene_en: "", mood: "", mem_about_him: "", mem_open: "", mem_dodged: "", warmth_delta: 0 });
const fileSecond = JSON.stringify({ bubbles: ["ладно, не сейчас"], photo_offer: "none", clothes_ru: "", clothes_en: "", place_ru: "", place_en: "", hair_ru: "", hair_en: "", scene_en: "", mood: "", mem_about_him: "", mem_open: "", mem_dodged: "", warmth_delta: 0 });

await scripted("файл обещан, флаг закрыт", person, [fileFirst, fileSecond]);
await scripted("битый json дважды", person, ["я не json", "и это тоже не json"]);

function promptLine(bond: ChatBond) {
  const flags = flagsFor(bond, "talk");
  const prompt = dmSystem({
    name: "Аня",
    username: "anya",
    world: named,
    flags,
    ping: false,
    event: "Последнее его: «как ты».",
    slotLabel: "вечер, не смена",
    onShift: false,
  });
  const line = prompt.split("\n\n").find((part) => part.startsWith("Стадия разговора")) || "";
  return { stage: flags.stage, pull: Math.round(pullOf(asBond(bond))), verbal: flags.verbal, prompt: line };
}

const cool: ChatBond = { warmth: 42, trust: 30, spark: 15, heat: 10, irrit: 5, guilt: 0 };
const near: ChatBond = { warmth: 70, trust: 20, spark: 10, heat: 5, irrit: 0, guilt: 0 };
console.log("человек warmth 42", JSON.stringify(promptLine(cool)));
console.log("человек warmth 70", JSON.stringify(promptLine(near)));

