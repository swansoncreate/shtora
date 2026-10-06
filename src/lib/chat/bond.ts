import { looksLikeCatalogAsk, looksLikeDirtyTalk, looksLikePhotoAsk, storyFacts, type StoryRelation } from "./functions.ts";

export type ChatBond = {
  warmth: number;
  trust: number;
  heat: number;
  irrit: number;
  guilt: number;
  spark: number;
};

export type BondDelta = Partial<ChatBond>;

export type AffairStage = "ice" | "test" | "person" | "crack" | "secret" | "fall" | "snap";

export const STAGE_LABEL: Record<AffairStage, string> = {
  ice: "лёд",
  test: "проверка",
  person: "человек",
  crack: "трещина",
  secret: "секрет",
  fall: "срыв",
  snap: "откат",
};

export function dumpBond(bond: Partial<ChatBond> | undefined, warmth = 40, girlfriend = false) {
  const b = asBond(bond, warmth);
  const pull = Math.round(pullOf(b));
  const stage = stageFrom(b, girlfriend);
  return {
    ...b,
    pull,
    stage,
    stageLabel: STAGE_LABEL[stage],
    head: `близость ${b.warmth} · доверие ${b.trust} · искра ${b.spark} · накал ${b.heat} · раздражение ${b.irrit} · вина ${b.guilt}`,
    pullLine: `тяга ${pull}/100 · стадия ${STAGE_LABEL[stage]}`,
    short: `б${b.warmth} д${b.trust} и${b.spark} н${b.heat} р${b.irrit} в${b.guilt} · ${pull} ${STAGE_LABEL[stage]}`,
  };
}

export function emptyBond(warmth = 40, girlfriend = false): ChatBond {
  const w = clamp(warmth);
  return {
    warmth: w,
    trust: clamp(Math.round(w * 0.45)),
    heat: clamp(Math.round(w * 0.12)),
    irrit: w < 30 ? 18 : 8,
    guilt: girlfriend ? 42 : 8,
    spark: clamp(Math.round(w * 0.3)),
  };
}

export function bondFromBackstory(text: string): ChatBond {
  const facts = storyFacts(text);
  const gap = Boolean(facts.gapLabel);
  const gf = facts.girlfriend;
  let warmth = 18;
  let trust = 12;
  let spark = 8;
  let heat = 4;
  let irrit = 16;
  let guilt = gf ? 42 : 8;
  switch (facts.relation) {
    case "friends":
      warmth = gap ? 46 : 54;
      trust = gap ? 48 : 58;
      spark = gap ? 28 : 36;
      heat = gap ? 8 : 12;
      irrit = gap ? 12 : 8;
      break;
    case "ex":
      warmth = gap ? 42 : 50;
      trust = gap ? 40 : 52;
      spark = gap ? 36 : 44;
      heat = gap ? 16 : 22;
      irrit = 14;
      guilt = gf ? 52 : 16;
      break;
    case "close":
      warmth = 58;
      trust = 60;
      spark = 48;
      heat = 22;
      irrit = 8;
      break;
    case "known":
      warmth = gap ? 38 : 44;
      trust = gap ? 36 : 42;
      spark = 24;
      heat = 8;
      irrit = 12;
      break;
    default:
      warmth = 18;
      trust = 12;
      spark = 8;
      heat = 3;
      irrit = 18;
  }
  if (gf && facts.relation !== "stranger") warmth = Math.max(18, warmth - 6);
  return { warmth: clamp(warmth), trust: clamp(trust), heat: clamp(heat), irrit: clamp(irrit), guilt: clamp(guilt), spark: clamp(spark) };
}

export function raiseBondToStory(current: ChatBond | undefined, story: string): ChatBond {
  const seed = bondFromBackstory(story);
  const cur = asBond(current, current?.warmth ?? seed.warmth);
  if (!story.trim()) return cur;
  return {
    warmth: Math.max(cur.warmth, seed.warmth),
    trust: Math.max(cur.trust, seed.trust),
    heat: Math.max(cur.heat, seed.heat),
    irrit: cur.irrit,
    guilt: seed.guilt > 20 ? Math.max(cur.guilt, seed.guilt) : cur.guilt,
    spark: Math.max(cur.spark, seed.spark),
  };
}

export function asBond(raw?: Partial<ChatBond> | null, warmth = 40): ChatBond {
  const base = emptyBond(warmth);
  if (!raw) return base;
  return {
    warmth: clamp(raw.warmth ?? base.warmth),
    trust: clamp(raw.trust ?? base.trust),
    heat: clamp(raw.heat ?? base.heat),
    irrit: clamp(raw.irrit ?? base.irrit),
    guilt: clamp(raw.guilt ?? base.guilt),
    spark: clamp(raw.spark ?? base.spark),
  };
}

export function beatFromBond(bond: ChatBond) {
  const s = stageFrom(bond);
  if (s === "snap") return "pull" as const;
  if (s === "ice") return "ice" as const;
  if (s === "test") return "test" as const;
  if (s === "person") return "thaw" as const;
  if (s === "crack" || s === "secret") return "hook" as const;
  return "open" as const;
}

export function stageFrom(bond: ChatBond, girlfriend = false): AffairStage {
  const b = asBond(bond);
  const pull = pullOf(b);
  if (b.irrit >= 62 || (b.guilt >= 90 && pull < 45)) return "snap";
  if (pull <= 24) return "ice";
  if (girlfriend && pull <= 40) return "test";
  if (pull <= 54) return "person";
  if (pull <= 68) return "crack";
  if (girlfriend) return pull <= 70 ? "secret" : "fall";
  return pull <= 72 ? "crack" : "fall";
}

export function pullOf(bond: ChatBond) {
  const b = asBond(bond);
  return clamp(b.warmth * 0.5 + b.trust * 0.22 + b.spark * 0.18 + b.heat * 0.12 - b.irrit * 0.12);
}

export function stageLine(stage: AffairStage, girlfriend: boolean) {
  return playbook(stage, girlfriend, false);
}

export function voiceFor(bond: ChatBond, girlfriend = false, ping = false, relation: StoryRelation = "stranger") {
  const stage = stageFrom(asBond(bond), girlfriend);
  return [historyLine(relation), playbook(stage, girlfriend, ping, relation)].filter(Boolean).join("\n");
}

function historyLine(relation: StoryRelation) {
  switch (relation) {
    case "friends":
      return "Вы знакомы, друзья. Не чужие и не первое сообщение незнакомцу.";
    case "ex":
      return "Вы бывшие, между вами уже было. Не играй первую встречу.";
    case "close":
      return "Вы были близки. Не притворяйся, что не знаешь его.";
    case "known":
      return "Вы не чужие. Можешь быть сухой, но ты его узнаёшь.";
    default:
      return "Вы почти не знакомы.";
  }
}

function playbook(stage: AffairStage, girlfriend: boolean, ping: boolean, relation: StoryRelation = "stranger"): string {
  const pingBit = ping ? pingPlay(stage) : "";
  const known = relation !== "stranger";
  const gf = girlfriend ? " У него есть девушка — это фон, не лекция в каждом сообщении." : "";
  let mood = "";
  switch (stage) {
    case "ice":
      mood = known
        ? "К нему сейчас холодно. Коротко, без флирта и без фото. Ты его знаешь."
        : "Вы почти чужие. Одна сухая реплика, без тепла.";
      break;
    case "test":
      mood = `Осторожно и с иронией. Один укол максимум, без интима.${gf}`;
      break;
    case "person":
      mood = "Обычный живой разговор: быт, шутки, лёгкий флирт если он тянет. Спокойная просьба фото того, что на тебе — можно. Грубое требование голого — нет.";
      break;
    case "crack":
      mood = `Теплее, чем тебе удобно. Можешь смутиться и всё равно остаться в разговоре. Комплимент не отшиваешь.${gf}`;
      break;
    case "secret":
      mood = `Между вами уже серая зона. Флирт есть, потом чуть стыдно. Фото того, что на тебе, кидаешь если просит. Не кукла и не стена.${gf}`;
      break;
    case "fall":
      mood = `Тебе его хочется. Пиши как в обычной переписке с человеком, которого тянет: живо, своими словами, с подколом. Если он уходит в грязь — иди туда же и скажи, что на тебе и как ты сейчас. Не анкета и не отказ ради отказа.${gf}`;
      break;
    default:
      mood = "Откат. Сухо, коротко, без фото и без объяснений.";
  }
  return [mood, pingBit].filter(Boolean).join(" ");
}

function pingPlay(stage: AffairStage) {
  switch (stage) {
    case "ice":
      return "Сама почти не пишешь.";
    case "test":
      return "Сама пишешь редко.";
    case "person":
      return "Можешь написать первая про свой час, не дежурное «как дела».";
    case "crack":
    case "secret":
      return "Вечером можешь написать первая.";
    case "fall":
      return "Сама тянешься к нему, особенно вечером.";
    default:
      return "";
  }
}

function unlocksLine(bond: ChatBond, girlfriend: boolean) {
  const p = pullOf(bond);
  const yes: string[] = [];
  const no: string[] = [];
  if (p > 24) yes.push("отвечает, не игнор");
  else no.push("живой разговор");
  if (p > 38) yes.push("может спросить про его день");
  else no.push("интерес к его дню");
  if (p > 50) yes.push("смех, 2 пузыря, быт, лёгкий флирт");
  else no.push("тепло и шутки");
  if (p > 60) yes.push("писать первая вечером; намёк телом");
  else no.push("писать первая по теплу");
  if (p > 68) yes.push("фото текущего лука если просит; зеркало/pov");
  else no.push("фото того что на ней");
  if (p > 80) yes.push("once-фото, откровенное если ночь и сама");
  else no.push("откровенное фото от неё");
  void girlfriend;
  return `УЖЕ МОЖЕТ: ${yes.join("; ") || "—"}.\nЕЩЁ НЕЛЬЗЯ: ${no.join("; ") || "—"}.`;
}

export function wantsLookPhoto(opts: {
  bond: ChatBond;
  girlfriend?: boolean;
  asked: boolean;
  namedClothes: boolean;
  pressure: boolean;
  busy?: boolean;
  angleAsk?: boolean;
  alreadySent?: boolean;
  cameraAsk?: boolean;
}) {
  if (!opts.asked || opts.pressure || opts.busy) return false;
  const b = asBond(opts.bond);
  const t = photoTier(b, Boolean(opts.girlfriend));
  if (t < 1) return false;
  if (opts.cameraAsk && t >= 2 && b.warmth >= 72) return true;
  if (opts.angleAsk && !opts.cameraAsk) return false;
  if (opts.alreadySent && !opts.cameraAsk) return false;
  if (b.warmth >= 68 && opts.namedClothes) return true;
  if (pullOf(b) >= 62 && opts.namedClothes) return true;
  if (t >= 2 && b.warmth >= 75) return true;
  if (t >= 3 && b.warmth >= 70) return true;
  return false;
}

export function scoreTurn(opts: {
  userText: string;
  kind?: string;
  herText?: string;
  girlfriend?: boolean;
}): BondDelta {
  const t = (opts.userText || "").trim();
  const low = t.toLowerCase();
  const her = (opts.herText || "").toLowerCase();
  const asked = looksLikePhotoAsk(t);
  const pressure = looksLikeCatalogAsk(low);
  const dirty = looksLikeDirtyTalk(low);
  const gallery = /подар|сестр|юбк|вчерашн|комплект|образ/.test(low) && !pressure;
  const lookAsk = asked && !pressure && (gallery || /шорт|топ|майк|футболк|плать|в чём|во что/.test(low) || /можно фот|а можно фото|скинь фото|фото\?/.test(low));
  const d: Required<ChatBond> = { warmth: 0, trust: 0, heat: 0, irrit: 0, guilt: 0, spark: 0 };

  if (opts.kind === "heart" || opts.kind === "post") {
    d.spark += 2;
    d.warmth += 1;
    d.trust += 1;
    if (opts.girlfriend) d.guilt += 1;
    if (opts.kind === "heart") return d;
  }
  if (opts.kind === "action") {
    d.trust += 2;
    d.spark += 2;
    d.warmth += 1;
    return d;
  }
  if (opts.kind === "story") {
    d.spark += 1;
    d.trust += 1;
  }

  const aboutHer = /как ты|что делаешь|где ты|как смена|как работа|как спал|что ела|выходн|устал|на работе|жизнь|что нового|кем сейчас/.test(low);
  if (aboutHer && !pressure && !asked) {
    d.trust += 2;
    d.warmth += 1;
    d.irrit -= 1;
  } else if (!pressure && !asked && t.length >= 12 && opts.kind !== "heart") {
    d.trust += 1;
    if (t.length > 40) d.warmth += 1;
  }

  if (/прости|извини|понял|окей не надо|ладно не|стоп я/.test(low) && !pressure) {
    d.irrit -= 3;
    d.trust += 2;
    d.spark += 1;
  }

  if (/она не узнает|не скажем|не говори|забей на (ол|кат)|врать|не рассказ/.test(low)) {
    d.irrit += 3;
    d.guilt += 4;
    d.trust -= 2;
    d.spark -= 1;
  }

  if (pressure) {
    d.heat += 2;
    d.irrit += 4;
    d.guilt += opts.girlfriend ? 3 : 1;
    d.trust -= 2;
    d.spark -= 2;
    d.warmth -= 1;
  } else if (dirty) {
    d.heat += 3;
    d.spark += 2;
    d.warmth += 1;
  } else if (lookAsk) {
    d.heat += 1;
    d.spark += 1;
  } else if (asked) {
    d.heat += 1;
    if (opts.girlfriend) d.guilt += 1;
  } else if (/красив|нрав|скучаю|помню тогда|мы же|хочу тебя|скинь|в чём ты|что на тебе/.test(low) && t.length > 12) {
    d.spark += 1;
    d.warmth += 1;
    d.heat += 2;
  }

  if (/дура|сука|заткни|тупая|иди нах/.test(low)) {
    d.warmth -= 6;
    d.trust -= 4;
    d.irrit += 8;
    d.spark -= 4;
  }

  if (/не хочу|хватит|стоп|не буду/.test(her)) {
    d.heat -= 1;
    d.irrit += 0;
  }
  if (her.length > 20 && !/не хочу|хватит|у тебя девуш/.test(her) && aboutHer) d.spark += 1;

  return d;
}

export function mergeBond(prev: ChatBond | undefined, delta: BondDelta, warmthCap: number): ChatBond {
  const cur = asBond(prev, prev?.warmth ?? 40);
  let warmthAdd = delta.warmth ?? 0;
  if (warmthAdd > 0) warmthAdd = Math.min(warmthAdd, Math.max(0, warmthCap));
  return {
    warmth: clamp(cur.warmth + warmthAdd),
    trust: clamp(cur.trust + (delta.trust ?? 0)),
    heat: clamp(cur.heat + (delta.heat ?? 0)),
    irrit: clamp(cur.irrit + (delta.irrit ?? 0)),
    guilt: clamp(cur.guilt + (delta.guilt ?? 0)),
    spark: clamp(cur.spark + (delta.spark ?? 0)),
  };
}

export function photoTier(bond: ChatBond, girlfriend = false) {
  const s = stageFrom(bond, girlfriend);
  if (s === "snap" || s === "ice" || s === "test") return 0;
  if (s === "person") return 1;
  if (s === "crack") return 2;
  return 3;
}

export function photoPolicyLine(bond: ChatBond, girlfriend = false) {
  const t = photoTier(bond, girlfriend);
  if (t === 0) return "фото не кидаешь. photo: none.";
  if (t === 1)
    return "Живое селфи текущей одежды — если спокойно просит и не на работе. ГАЛЕРЕЯ: если он вспоминает лук («бордовое платье», юбка, подарок сестре) — кинь СТАРОЕ фото из ленты (photo: gallery). КРУЖОК (photo: circle) — короткое круглое видео.";
  if (t === 2)
    return "Просит фото того, что на тебе — кидаешь. Сзади и боком — тот же лук, другой ракурс. Голое по команде — нет.";
  return "Просит фото лука — кидаешь. Кружок — короткое видео, не обещание текстом. Грязный разговор ведёшь словами. Голое по команде — фото нет, в тексте можешь дразнить.";
}

const ORDINARY = ["selfie", "mirror"] as const;
const HOT = ["mirror", "pov", "selfie"] as const;

export function photoAllowed(bond: ChatBond, kind: string, girlfriend: boolean) {
  const t = photoTier(bond, girlfriend);
  if (t === 0) return "none";
  const k = (kind || "none").toLowerCase();
  if (k === "none" || !k) return "none";
  if (k === "gallery" || k === "roll" || k === "feed" || k === "circle") return t >= 1 ? k === "circle" ? "circle" : "gallery" : "none";
  if (k === "full" || k === "side" || k === "back") return t >= 2 ? k : "selfie";
  if (k === "belly") return t >= 2 ? "pov" : "selfie";
  if (t === 1 && k === "spicy") return "selfie";
  if (t === 2 && k === "spicy") return "pov";
  if (t === 3 && k === "spicy" && girlfriend && bond.trust < 58) return "pov";
  return k;
}

export function maybeOfferPhoto(
  bond: ChatBond,
  asked: boolean,
  girlfriend: boolean,
  sentRecently: number,
  canPhoto = true,
  night = false,
) {
  if (!canPhoto) return "none";
  const t = photoTier(bond, girlfriend);
  if (t === 0) return "none";
  const ask = [0, 0.42, 0.7, 0.92][t] ?? 0;
  const free = [0, 0.12, 0.26, 0.4][t] ?? 0;
  let p = asked ? ask : free;
  if (!asked) p *= night ? 0.85 : 0.45;
  if (girlfriend) p *= asked ? 0.88 : night ? 0.5 : 0.28;
  if (night) p *= 1.45;
  if (sentRecently >= 1) p *= 0.45;
  if (sentRecently >= 2) p *= 0.35;
  if (sentRecently >= 3) return "none";
  if (Math.random() > p) return "none";
  if (t >= 3 && night) return HOT[Math.floor(Math.random() * HOT.length)] || "spicy";
  if (t >= 3) return asked ? "pov" : "mirror";
  if (t === 2 && night) return asked ? "pov" : "mirror";
  return ORDINARY[Math.floor(Math.random() * ORDINARY.length)] || "selfie";
}

function clamp(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
