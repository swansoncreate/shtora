import { asBond, photoTier, pullOf, stageFrom, type AffairStage, type ChatBond } from "@/lib/chat/bond";

export type DmMove = "camera" | "catalog" | "gallery" | "circle" | "look" | "talk";
export type DmRegister = "dry" | "warm" | "flirt" | "hot" | "pullback";

export type DmFlags = {
  stage: AffairStage;
  register: DmRegister;
  teaseOk: boolean;
  maxBubbles: 1 | 2 | 3;
  selfie: boolean;
  angle: boolean;
  gallery: boolean;
  circle: boolean;
  reason: "tier" | "work" | "irrit" | "recent" | "unnamed" | "catalog" | "none";
  nightMirror: boolean;
  verbal: string;
};

export function dmFlags(opts: {
  bond: ChatBond;
  girlfriend: boolean;
  move: DmMove;
  nude: boolean;
  dirty: boolean;
  named: boolean;
  busy: boolean;
  recent: boolean;
  night: boolean;
}): DmFlags {
  const b = asBond(opts.bond);
  const stage = stageFrom(b, opts.girlfriend);
  const tier = photoTier(b, opts.girlfriend);
  const pull = pullOf(b);
  const open = stage === "secret" || stage === "fall";
  let register: DmRegister = "warm";
  let teaseOk = false;
  let maxBubbles: 1 | 2 | 3 = 2;
  if (stage === "snap") {
    register = "pullback";
    maxBubbles = 1;
  } else if (stage === "ice" || stage === "test") {
    register = "dry";
    maxBubbles = 1;
  } else if (stage === "person") {
    register = "warm";
    maxBubbles = 2;
  } else if (stage === "crack") {
    register = "flirt";
    maxBubbles = 2;
    teaseOk = opts.move === "talk" && opts.dirty && !opts.nude;
  } else {
    register = "hot";
    maxBubbles = 3;
    teaseOk = opts.move === "talk";
  }

  let selfie = false;
  let angle = false;
  let gallery = false;
  let circle = false;
  let reason: DmFlags["reason"] = "none";
  if (tier === 0) {
    reason = stage === "snap" || b.irrit >= 62 ? "irrit" : "tier";
  } else {
    const look = (b.warmth >= 68 || pull >= 62) && opts.named && b.irrit < 50;
    if (look) selfie = true;
    else if (!opts.named) reason = "unnamed";
    if (tier >= 2 && b.warmth >= 70 && b.trust >= 48 && b.irrit < 50) angle = true;
    if (tier >= 1) gallery = true;
    if (tier >= 1 && b.trust >= 40) circle = true;
    if (opts.busy && !open) {
      selfie = false;
      angle = false;
      reason = "work";
    }
  }
  if (opts.recent && !open) {
    selfie = false;
    reason = "recent";
  }
  if (opts.nude || opts.move === "catalog") {
    selfie = false;
    angle = false;
    gallery = false;
    circle = false;
    reason = "catalog";
  }
  if (opts.move !== "look" && opts.move !== "camera" && opts.move !== "gallery" && opts.move !== "circle") {
    /* dirty talk does not open extra photo flags */
  }
  const verbal = verbalLine(b, opts.girlfriend, teaseOk, stage);
  return {
    stage,
    register,
    teaseOk,
    maxBubbles,
    selfie,
    angle,
    gallery,
    circle,
    reason,
    nightMirror: Boolean(opts.night && b.heat >= 40 && selfie),
    verbal,
  };
}

function verbalLine(b: ChatBond, girlfriend: boolean, tease: boolean, stage: AffairStage) {
  const lines: string[] = [];
  if (b.warmth < 40) lines.push("сухо, почти не спрашивает обратно");
  else if (b.warmth < 68) lines.push("уже отвечает по-человечески, лук сама не кидает");
  else lines.push("близко, лук может кинуть, если это можно");
  if (b.heat >= 55 && tease) lines.push("держит тот же регистр, не уводит в быт");
  if (b.irrit >= 40 && b.irrit < 62) lines.push("короче обычного, без тепла в хвосте");
  if (b.guilt >= 50 && girlfriend) lines.push("помнит про его девушку, не делает вид что её нет");
  if (b.spark >= 50 && stage !== "snap") lines.push("можно второй пузырь");
  if (b.trust >= 55) lines.push("можно встречный вопрос");
  if (b.heat < 30) lines.push("не начинать грязное самой");
  return lines.join(". ");
}

export function flagPhrase(flags: DmFlags) {
  if (flags.reason === "catalog") return "Голое не кидаешь. Текстом можешь дразнить, если регистр это позволяет, иначе уходишь своим голосом. Файла нет.";
  if (flags.reason === "work") return "Кадр нельзя, ты на смене. Галерея и кружок можно, если ниже сказано.";
  const bits = [
    flags.selfie ? "Селфи можно." : "Селфи нельзя.",
    flags.angle ? "Ракурс можно." : "",
    flags.gallery ? "Старый лук можно." : "",
    flags.circle ? "Кружок можно." : "",
    flags.nightMirror ? "Если кидаешь селфи, то зеркало, не улица." : "",
    flags.teaseOk ? "Грязный разговор держи текстом. Файл сам не предлагай." : "",
  ];
  return bits.filter(Boolean).join(" ");
}

export function offerAllowed(flags: DmFlags, offer: string) {
  if (offer === "selfie") return flags.selfie;
  if (offer === "angle") return flags.angle;
  if (offer === "gallery") return flags.gallery;
  if (offer === "circle") return flags.circle;
  return false;
}
