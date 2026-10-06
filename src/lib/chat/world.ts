export type ChatWorld = {
  place?: string;
  clothes?: string;
  hair?: string;
  placeRu?: string;
  clothesRu?: string;
  clothesNamed?: boolean;
  hairRu?: string;
  activity?: string;
  timeContext?: string;
  weather?: string;
  sceneId?: string;
  memAbout?: string;
  memOpen?: string;
  memDodged?: string;
};

export type ChatLine = {
  role: "user" | "assistant" | string;
  text?: string;
  at?: number;
};

export type DaySlot = "sleep" | "morning" | "work" | "weekend" | "evening" | "night";

const SKIP = new Set(["не сказано", "unknown", "none", "-", "—", "as usual", "not specified"]);

const GENERIC_CLOTHES =
  /^(home clothes or sleepwear|casual work clothes|sleep clothes or underwear|sleep clothes or nothing much|home clothes or getting dressed|home clothes after work|home clothes|sleep clothes|casual clothes|as usual|nothing much)$/i;

export function emptyWorld(): ChatWorld {
  return {};
}

export function mergeWorld(prev: ChatWorld | undefined, next: ChatWorld | undefined): ChatWorld {
  const out: ChatWorld = { ...(prev || {}) };
  if (clean(next?.place)) out.place = clean(next?.place);
  if (clean(next?.clothes)) out.clothes = clean(next?.clothes);
  if (clean(next?.hair)) out.hair = clean(next?.hair);
  return out;
}

function clean(raw?: string) {
  const t = (raw || "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!t || SKIP.has(t.toLowerCase())) return "";
  return t;
}

export function specificClothes(raw?: string) {
  const t = clean(raw);
  if (!t) return "";
  if (GENERIC_CLOTHES.test(t)) return "";
  return t;
}

export function preferClothes(next?: string, prev?: string) {
  const a = specificClothes(next);
  const b = specificClothes(prev);
  if (!a) return b;
  if (!b) return a;
  const na = piecesFrom(a).length;
  const nb = piecesFrom(b).length;
  if (na < nb) return b;
  if (na === nb && a.length + 8 < b.length) return b;
  return a;
}

export function isWorkPlace(place?: string) {
  return /work|office|офис|смен/.test((place || "").toLowerCase()) && !/home|дом|apartment|bed/.test((place || "").toLowerCase());
}

export function isGenericClothes(raw?: string) {
  return !specificClothes(raw);
}

const COLOR: Array<[RegExp, string]> = [
  [/бордов|burgundy/, "burgundy"],
  [/винн|марсал|wine/, "wine"],
  [/чёрн|черн|\bblack\b/, "black"],
  [/бел(ое|ая|ый|ую)|\bwhite\b/, "white"],
  [/красн|\bred\b/, "red"],
  [/син(ее|яя|ий|юю)|\bblue\b/, "blue"],
  [/голуб/, "light blue"],
  [/зелён|зелен/, "green"],
  [/роз(ов)/, "pink"],
  [/бежев/, "beige"],
  [/коричнев/, "brown"],
  [/сер(ое|ая|ый|ую)|\bgrey\b|\bgray\b/, "grey"],
];

type Kind = "top" | "bottom" | "extra" | "set";

const ITEM: Array<[RegExp, string, Kind]> = [
  [/плать|\bdress\b/, "dress", "set"],
  [/комплект|matching set/, "matching set", "set"],
  [/пижам|\bpajama/, "pajamas", "set"],
  [/халат|\brobe\b/, "robe", "extra"],
  [/пиджак|блейз|\bblazer\b/, "blazer", "extra"],
  [/юбк|\bskirt\b/, "skirt", "bottom"],
  [/джинс|\bjeans\b/, "jeans", "bottom"],
  [/леггин|\blegging/, "leggings", "bottom"],
  [/шорт|велосипедк|\bshorts\b|bicycle shorts|bike shorts/, "shorts", "bottom"],
  [/футболк|t-shirt|\btee\b/, "t-shirt", "top"],
  [/рубашк|(?<![t-])shirt\b/, "shirt", "top"],
  [/блуз|\bblouse\b/, "blouse", "top"],
  [/топ(?:е|а|ом|у)?(?![а-яa-z])|cropp?ed top|crop top/, "cropped top", "top"],
  [/маечк|майк|tank/, "tank top", "top"],
  [/худи|толстов|\bhoodie\b/, "hoodie", "top"],
  [/свитер|кофт|\bsweater\b/, "sweater", "top"],
  [/боди|\bbodysuit\b/, "bodysuit", "top"],
  [/бель|трус|\bunderwear\b/, "underwear", "set"],
];

type Piece = { word: string; kind: Kind; color: string };

function piecesFrom(raw: string): Piece[] {
  const t = (raw || "").toLowerCase();
  if (!t.trim()) return [];
  const color = COLOR.find(([re]) => re.test(t))?.[1] || "";
  const out: Piece[] = [];
  for (const [re, word, kind] of ITEM) {
    if (re.test(t)) out.push({ word, kind, color });
  }
  return out;
}

function paint(p: Piece) {
  return [p.color, p.word].filter(Boolean).join(" ");
}

export function clothesFromBlob(raw: string) {
  const t = (raw || "").toLowerCase();
  if (!t.trim()) return "";
  if (/голая|без ничего|ничего не надет/.test(t)) return "nothing much, just from bed";
  if (/сним.{0,16}(джинс|штаны)|(джинс|штаны).{0,12}сним|без джинс/.test(t) && /майк|футболк|топ/.test(t)) {
    return withColor(t, "t-shirt or tank, no jeans");
  }
  if (/одной футболк|только.{0,10}футболк|в футболке одной/.test(t)) return withColor(t, "only a t-shirt");
  if (/опустил|приподн|до пупк|задрал/.test(t) && /футболк|майк/.test(t)) {
    return withColor(t, "oversized t-shirt pulled up");
  }
  const items = piecesFrom(t);
  if (!items.length) return "";
  const unique = [...new Map(items.map((p) => [p.word, p])).values()].slice(0, 3);
  return unique.map(paint).join(" and ");
}

function withColor(t: string, base: string) {
  const color = COLOR.find(([re]) => re.test(t))?.[1] || "";
  return [color, base].filter(Boolean).join(" ");
}

const RU_COLOR: Array<[RegExp, string]> = [
  [/\bburgundy\b/, "бордовая"],
  [/\bwine\b/, "винная"],
  [/\bblack\b/, "чёрная"],
  [/\bwhite\b/, "белая"],
  [/\bred\b/, "красная"],
  [/\blight blue\b/, "голубая"],
  [/\bblue\b/, "синяя"],
  [/\bgreen\b/, "зелёная"],
  [/\bpink\b/, "розовая"],
  [/\bbeige\b/, "бежевая"],
  [/\bbrown\b/, "коричневая"],
  [/\bgrey\b|\bgray\b/, "серая"],
];

const RU_ITEM: Array<[RegExp, string]> = [
  [/tank top/, "майка"],
  [/t-shirt/, "футболка"],
  [/blouse/, "блузка"],
  [/jeans/, "джинсы"],
  [/skirt/, "юбка"],
  [/dress/, "платье"],
  [/hoodie/, "худи"],
  [/sweater/, "свитер"],
  [/blazer/, "пиджак"],
  [/shorts/, "шорты"],
  [/leggings/, "леггинсы"],
  [/pajamas/, "пижама"],
  [/robe/, "халат"],
  [/bodysuit/, "боди"],
  [/underwear/, "бельё"],
  [/matching set/, "комплект"],
  [/no jeans[^.]*|jeans off/, "без джинс"],
];

export function clothesToRu(raw?: string) {
  let s = (raw || "").trim();
  if (!s || GENERIC_CLOTHES.test(s)) return "";
  for (const [re, word] of RU_COLOR) s = s.replace(re, word);
  for (const [re, word] of RU_ITEM) s = s.replace(re, word);
  s = s.replace(/\band\b/g, "и").replace(/,/g, " и").replace(/\s+/g, " ").trim();
  return s;
}

type Fit = {
  top: string;
  bottom: string;
  extra: string;
  hair: string;
  place: string;
  namedAt: number;
  homeAt: number;
};

function fitFromWorld(world?: ChatWorld): Fit {
  const clothes = specificClothes(world?.clothes);
  const fit: Fit = {
    top: "",
    bottom: "",
    extra: "",
    hair: clean(world?.hair),
    place: clean(world?.place),
    namedAt: 0,
    homeAt: 0,
  };
  if (!clothes) return fit;
  for (const p of piecesFrom(clothes) || guessPieces(clothes)) applyPiece(fit, p, false);
  if (!fit.top && !fit.bottom && !fit.extra) fit.top = clothes;
  return fit;
}

function guessPieces(clothes: string): Piece[] {
  const t = clothes.toLowerCase();
  const color = COLOR.find(([re]) => re.test(t))?.[1] || "";
  const out: Piece[] = [];
  for (const [re, word, kind] of ITEM) if (re.test(t)) out.push({ word, kind, color });
  return out;
}

function applyPiece(fit: Fit, p: Piece, remove: boolean) {
  const word = paint(p);
  if (remove) {
    if (p.kind === "top" || p.kind === "set") fit.top = "";
    if (p.kind === "bottom" || p.kind === "set") fit.bottom = p.kind === "bottom" ? "off" : "";
    if (p.kind === "extra") fit.extra = "";
    if (p.word === "blouse" && fit.extra.toLowerCase().includes("blouse")) fit.extra = "";
    return;
  }
  if (p.kind === "set") {
    fit.top = word;
    fit.bottom = p.word === "dress" || p.word === "matching set" ? "" : word;
    fit.extra = "";
    return;
  }
  if (p.kind === "top") fit.top = keepDetail(fit.top, word, p);
  if (p.kind === "bottom") fit.bottom = keepDetail(fit.bottom, word, p);
  if (p.kind === "extra") fit.extra = keepDetail(fit.extra, word, p);
}

function keepDetail(prev: string, next: string, p: Piece) {
  const lowPrev = (prev || "").toLowerCase();
  const lowNext = (next || "").toLowerCase();
  if (!prev) return next;
  if (lowPrev.includes(p.word) && lowPrev.length > lowNext.length && !p.color) return prev;
  if (p.color) return next;
  const prevColor = COLOR.find(([re]) => re.test(lowPrev))?.[1];
  if (prevColor && !COLOR.find(([re]) => re.test(lowNext))?.[1]) {
    return `${prevColor} ${next}`.replace(/\s+/g, " ").trim();
  }
  return next;
}

function dressLine(fit: Fit) {
  const bits: string[] = [];
  if (fit.extra && fit.extra !== fit.top) bits.push(fit.extra);
  if (fit.top) bits.push(fit.top);
  if (fit.bottom === "off") bits.push("no jeans, legs bare");
  else if (fit.bottom && fit.bottom !== fit.top) bits.push(fit.bottom);
  return [...new Set(bits)].join(" and ");
}

function applySpeech(fit: Fit, raw: string, role: string, at: number) {
  const t = (raw || "").toLowerCase();
  if (!t.trim()) return;
  const slot = slotFromHour(moscowHour(at), at);
  const homeTalk = /дома уже|уже дома|вот только дома|добрал|у себя|на диване|в квартир|переодел/.test(t);
  const leaveTalk = /выехал|выхожу|еду домой|доезж|в машине|еду минут/.test(t);
  const workTalk = /на работе|в офисе|на смене|ещё на работ|еще на работ|собираюсь на работ/.test(t);
  const overtime = /задерж|овертайм|ещё сижу|до десят|до одиннадцат/.test(t);
  const bedTalk = /в кровати|спальн|сплю|лежу/.test(t);
  const bathTalk = /ванн|душ/.test(t);
  const kitchenTalk = /кухн/.test(t);
  const streetTalk = /улиц|гуля|парк/.test(t);
  const cafeTalk = /кафе|кофейн|ресторан/.test(t);

  if (role !== "user") {
    if (homeTalk || /халат|пижам/.test(t)) {
      fit.place = placeFor("home", slot);
      fit.homeAt = at;
    } else if (leaveTalk) {
      fit.place = "inside a car, going home";
    } else if (bedTalk) fit.place = "bedroom at home";
    else if (bathTalk) fit.place = "bathroom at home";
    else if (kitchenTalk) fit.place = "home kitchen";
    else if (cafeTalk) fit.place = "cafe";
    else if (streetTalk) fit.place = "outdoors, street";
    else if (workTalk) {
      if (isWeekendAt(at) && !looksLikeWeekendShift(t)) {
        if (isWorkPlace(fit.place)) fit.place = placeFor("home", slot);
      } else {
        const onlyWork = looksLikeWorkStatus(t) && t.length < 48;
        const sameDayHome = fit.homeAt && moscowDay(fit.homeAt) === moscowDay(at);
        const night = slot === "sleep" || slot === "night";
        const evening = slot === "evening";
        if (night || slot === "weekend") {
          if (isWorkPlace(fit.place)) fit.place = placeFor("home", slot);
        } else if (evening && (sameDayHome || (onlyWork && !overtime))) {
          /* stay home */
        } else if (onlyWork && sameDayHome) {
          /* ignore */
        } else {
          fit.place = "at work, indoor office";
        }
      }
    }
  }

  if (role === "user") return;

  const takingOff =
    !/не сня|ещё не раздел|еще не раздел|не решил/.test(t) &&
    /сняла\b|уже сня|без джинс|джинсы (уже )?(сня|нет)|не в джинс/.test(t);
  const under = /под (блуз|рубашк|пиджак)/.test(t);
  const blouseStill = /блузк.{0,12}не сня|не сня.{0,12}блуз/.test(t);
  const pieces = piecesFrom(t);

  if (takingOff && pieces.length) {
    for (const p of pieces) applyPiece(fit, p, true);
    fit.namedAt = at;
  } else if (pieces.length) {
    for (const p of pieces) {
      if (under && p.kind === "top") {
        if (/blouse/.test(fit.top) && !fit.extra) fit.extra = fit.top;
        fit.top = paint(p);
      } else applyPiece(fit, p, false);
    }
    if (blouseStill && !fit.extra) fit.extra = "blouse";
    fit.namedAt = at;
  } else if (/голая|без ничего|ничего не надет/.test(t) && role !== "user") {
    fit.top = "nothing much, just from bed";
    fit.bottom = "off";
    fit.extra = "";
    fit.namedAt = at;
  } else if (/одной футболк|только.{0,10}футболк/.test(t) && role !== "user") {
    fit.top = withColor(t, "t-shirt");
    fit.bottom = "off";
    fit.namedAt = at;
  }

  if (/хвост|собрал.*волос|ponytail/.test(t)) fit.hair = "hair in a ponytail";
  else if (/распуст|волосы распущен|hair down/.test(t)) fit.hair = "hair down";
  else if (/пучок/.test(t)) fit.hair = "hair in a bun";
}

function worldFromFit(fit: Fit): ChatWorld {
  return {
    place: fit.place || undefined,
    clothes: dressLine(fit) || undefined,
    hair: fit.hair || undefined,
  };
}

export function worldFromText(blob: string, prev?: ChatWorld): ChatWorld {
  const fit = fitFromWorld(prev);
  for (const line of blob.split("\n")) applySpeech(fit, line, "assistant", Date.now());
  return mergeWorld(prev, worldFromFit(fit));
}

export function rebuildWorld(lines: ChatLine[] | undefined, now = Date.now(), prev?: ChatWorld): ChatWorld {
  const rows = (lines ?? []).filter((m) => (m.text || "").trim());
  const fit = fitFromWorld(undefined);
  let lastAt = rows[0]?.at || now;
  for (const row of rows) {
    const at = row.at || lastAt;
    if (at - lastAt > 40 * 60_000) clockFit(fit, at, lastAt);
    applySpeech(fit, row.text || "", row.role, at);
    lastAt = at;
  }
  clockFit(fit, now, lastAt);
  const out = worldFromFit(fit);
  const clothes = preferClothes(out.clothes, prev?.clothes) || out.clothes;
  const place = out.place || prev?.place;
  const hair = out.hair || prev?.hair;
  return clockWorld({ place, clothes, hair, sceneId: prev?.sceneId }, now, lastAt, fit.namedAt);
}

export type WorldAdvance = {
  prev?: ChatWorld;
  herText?: string;
  userText?: string;
  model?: ChatWorld;
  lastAt?: number;
  now?: number;
  slot?: DaySlot;
  slotWorld?: ChatWorld;
  history?: ChatLine[];
};

export function advanceWorld(input: WorldAdvance): ChatWorld {
  const now = input.now ?? Date.now();
  if (input.history?.length) {
    const rebuilt = rebuildWorld(input.history, now, input.prev);
    return mergeNamed(rebuilt, input.model, input.herText, now);
  }
  const slot = input.slot || slotFromHour(moscowHour(now), now);
  const fit = fitFromWorld(input.prev);
  if (input.userText) applySpeech(fit, input.userText, "user", now);
  if (input.herText) applySpeech(fit, input.herText, "assistant", now);
  const lastAt = input.lastAt || now;
  clockFit(fit, now, lastAt);
  let world = worldFromFit(fit);
  world = mergeNamed(world, input.model, input.herText, now);
  if (!world.place) world.place = (input.slotWorld || defaultWorld(slot)).place;
  if (!specificClothes(world.clothes)) {
    world.clothes = specificClothes(input.prev?.clothes) || (input.slotWorld || defaultWorld(slot)).clothes;
  }
  if (!world.hair) world.hair = input.prev?.hair || (input.slotWorld || defaultWorld(slot)).hair;
  return clockWorld(world, now, lastAt, fit.namedAt);
}

function mergeNamed(world: ChatWorld, model?: ChatWorld, herText?: string, now = Date.now()): ChatWorld {
  const fromHer = clothesFromBlob(herText || "");
  const clothes = preferClothes(fromHer, preferClothes(model?.clothes, world.clothes));
  const place = clean(model?.place) && !staleWork(model?.place, now, world.place) ? clean(model?.place) : world.place;
  const hair = clean(model?.hair) || world.hair;
  return { ...world, place, clothes: clothes || world.clothes, hair };
}

function staleWork(place: string | undefined, now: number, current?: string) {
  if (!isWorkPlace(place)) return false;
  if (isWeekendAt(now)) return true;
  const slot = slotFromHour(moscowHour(now), now);
  if (slot === "sleep" || slot === "night" || slot === "weekend") return true;
  if ((slot === "evening" || slot === "morning") && current && !isWorkPlace(current)) return true;
  return false;
}

function clockFit(fit: Fit, now: number, lastAt: number) {
  const next = clockWorld(worldFromFit(fit), now, lastAt, fit.namedAt);
  fit.place = next.place || fit.place;
  if (next.clothes && !specificClothes(dressLine(fit))) {
    const pieces = guessPieces(next.clothes);
    if (pieces.length) {
      fit.top = "";
      fit.bottom = "";
      fit.extra = "";
      for (const p of pieces) applyPiece(fit, p, false);
    }
  }
  fit.hair = next.hair || fit.hair;
}

function clockWorld(world: ChatWorld, now: number, lastAt: number, namedAt = 0): ChatWorld {
  const hour = moscowHour(now);
  const slot = slotFromHour(hour, now);
  const def = defaultWorld(slot);
  const hoursGone = lastAt ? Math.max(0, (now - lastAt) / 3_600_000) : 0;
  const hoursNamed = namedAt ? Math.max(0, (now - namedAt) / 3_600_000) : hoursGone;
  let place = world.place || "";
  let clothes = world.clothes || "";
  let hair = world.hair || "";

  if (isWeekendAt(now) && isWorkPlace(place)) {
    place = hour >= 10 && hour < 18 ? "at home, apartment, weekend daytime" : def.place || "at home, apartment";
    if (isWorkClothes(clothes) || !specificClothes(clothes)) {
      clothes = def.clothes || "home clothes";
    }
  }

  if (slot === "sleep" || slot === "night") {
    if (isWorkPlace(place)) {
      place = def.place || place;
      if (!specificClothes(clothes) || isWorkClothes(clothes)) clothes = def.clothes || clothes;
    }
  }
  if (slot === "evening" && isWorkPlace(place)) {
    if (hour >= 20 || hoursGone >= 1.2) {
      place = def.place || place;
      if (!specificClothes(clothes) || isWorkClothes(clothes)) clothes = def.clothes || clothes;
    }
  }
  if (slot === "morning") {
    if ((isNightPlace(place) || isWorkPlace(place)) && hoursGone >= 4) place = def.place || place;
    if (hoursNamed >= 10 && (!namedAt || moscowHour(namedAt) >= 22 || moscowHour(namedAt) < 6)) {
      if (!specificClothes(clothes) || /sleep|pajama|underwear|nothing much/.test((clothes || "").toLowerCase())) {
        clothes = def.clothes || clothes;
      }
    }
  }
  if (slot === "work" && hoursGone >= 8 && (isNightPlace(place) || !place)) {
    place = def.place || place;
    if (!specificClothes(clothes)) clothes = def.clothes || clothes;
  }
  if (namedAt && moscowDay(namedAt) !== moscowDay(now) && hoursNamed >= 10) {
    clothes = def.clothes || clothes;
  }
  if (!place) place = def.place || "at home, apartment";
  if (!clothes) clothes = clothesFor(place, def.clothes);
  if (!hair) hair = def.hair || "as usual";
  return { ...world, place, clothes, hair };
}

function slotFromHour(hour: number, at = Date.now()): DaySlot {
  if (hour >= 1 && hour < 7) return "sleep";
  if (hour < 10) return "morning";
  if (hour < 18) return isWeekendAt(at) ? "weekend" : "work";
  if (hour < 23) return "evening";
  return "night";
}

export function isWeekendAt(at = Date.now()) {
  const w = new Date(at).toLocaleDateString("en-US", { weekday: "short", timeZone: "Europe/Moscow" });
  return w === "Sat" || w === "Sun";
}

export function moscowWhen(at = Date.now()) {
  const d = new Date(at);
  return {
    weekday: d.toLocaleDateString("ru-RU", { weekday: "long", timeZone: "Europe/Moscow" }),
    date: d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" }),
    time: clock(at),
    weekend: isWeekendAt(at),
    hour: moscowHour(at),
    ymd: moscowDay(at),
  };
}

/** Hard calendar: Sat/Sun she is not at the office, even if old lines said so. */
export function isAtWorkNow(place?: string, at = Date.now()) {
  if (isWeekendAt(at)) return false;
  if (slotFromHour(moscowHour(at), at) !== "work") return false;
  return isWorkPlace(place);
}

export function defaultWorld(slot: DaySlot): ChatWorld {
  if (slot === "sleep") return { place: "bedroom at home, dark, bed", clothes: "sleep clothes", hair: "messy from sleep" };
  if (slot === "morning") return { place: "home, kitchen or bathroom", clothes: "home clothes", hair: "as usual" };
  if (slot === "weekend") return { place: "at home, apartment, weekend daytime", clothes: "home clothes", hair: "as usual" };
  if (slot === "work") return { place: "at work, indoor office", clothes: "casual work clothes", hair: "as usual" };
  if (slot === "evening") return { place: "at home, apartment, evening lamp", clothes: "home clothes", hair: "down or as usual" };
  return { place: "bedroom or sofa at home, dim lamp", clothes: "sleep clothes", hair: "down" };
}

function isWorkClothes(clothes?: string) {
  return /work clothes|office/.test((clothes || "").toLowerCase()) && !specificClothes(clothes);
}

function isNightPlace(place?: string) {
  return /bed|sleep|dark/.test((place || "").toLowerCase());
}

function clothesFor(place: string, fallback?: string) {
  const p = place.toLowerCase();
  if (/work|office/.test(p)) return "casual work clothes";
  if (/sleep|bed/.test(p)) return "sleep clothes";
  if (/home|apartment|kitchen|sofa/.test(p)) return "home clothes";
  return fallback || "casual clothes";
}

function placeFor(kind: "home" | "work", slot: DaySlot) {
  if (kind === "work") return slot === "weekend" ? "at home, apartment, weekend daytime" : "at work, indoor office";
  if (slot === "sleep" || slot === "night") return "bedroom at home";
  if (slot === "evening") return "at home, apartment, evening lamp";
  if (slot === "weekend") return "at home, apartment, weekend daytime";
  return "at home, apartment";
}

function moscowDay(at: number) {
  return new Date(at).toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
}

export function moscowHour(at = Date.now()) {
  const raw = new Date(at).toLocaleString("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Europe/Moscow",
  });
  const h = Number.parseInt(raw, 10);
  return Number.isFinite(h) ? h : new Date(at).getHours();
}

export function moscowHourAt(at: number) {
  return moscowHour(at);
}

export function lightForHour(hour = moscowHour()) {
  if (hour >= 5 && hour < 8) return "early morning, cool blue window light";
  if (hour < 11) return "soft morning daylight";
  if (hour < 16) return "midday daylight, not studio";
  if (hour < 19) return "golden hour, warm sun";
  if (hour < 23) return "evening indoor lamp, warm tungsten";
  return "late night, dim lamp, faint phone glow";
}

export function photoKindFromChat(blob: string, fallback = "selfie") {
  const chunks = blob
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .reverse();
  for (const chunk of chunks) {
    const hit = kindFromLine(chunk);
    if (hit) return hit;
  }
  return fallback;
}

function kindFromLine(raw: string) {
  const t = raw.toLowerCase();
  const cam = cameraKindFromText(t);
  if (cam) return cam;
  if (/зеркал/.test(t)) return "mirror";
  if (/ножк|стопы|бедра|с ног|ног(и|ики)\b/.test(t)) return "pov";
  if (/пупк|живот|опустил|приподн|задрал/.test(t)) return "pov";
  if (/двер/.test(t)) return "mirror";
  if (/только.{0,10}футболк|одной футболк/.test(t)) return "mirror";
  return "";
}

/** Camera angle from the user's ask — not a body-part catalog. */
export function cameraKindFromText(raw: string): "back" | "side" | "full" | "" {
  const t = (raw || "").toLowerCase();
  if (/нагн|наклон|по(пу|пку) лучше|спин.{0,16}лучше/.test(t)) return "back";
  if (/попу|попк|задниц|жоп|сиськ|грудь|ножк/.test(t) && !/сзади|задом|боком|сбоку/.test(t)) return "";
  if (/сзад|задом|со спин|спину|from behind|shot from the back/.test(t)) return "back";
  if (/боком|сбоку|с боку|в профиль|three-quarter|side view|side profile/.test(t)) return "side";
  if (/полн(ый|ым)? рост|во весь рост|full[- ]?body/.test(t)) return "full";
  return "";
}

export function worldPrompt(world?: ChatWorld) {
  const place = world?.place || "match the chat, not a generic backdrop";
  const clothes = specificClothes(world?.clothes) || world?.clothes || "the clothes she is wearing in this chat";
  const hair = world?.hair || "same hair as the source unless the chat said otherwise";
  return `PLACE: ${place}. CLOTHES: ${clothes}. HAIR: ${hair}.`;
}

export function sceneCard(world?: ChatWorld, at = Date.now()) {
  const hour = moscowHour(at);
  const slot = slotFromHour(hour, at);
  const when = moscowWhen(at);
  const w = world || {};
  const workNow = isAtWorkNow(w.place, at);
  const label =
    slot === "sleep"
      ? "ночь, спит / телефон рядом"
      : slot === "weekend" || (when.weekend && hour >= 10 && hour < 18)
        ? "выходной, день"
        : slot === "morning"
          ? when.weekend
            ? "выходное утро"
            : "утро"
          : slot === "work"
            ? workNow
              ? "будний день, на работе"
              : "будний день"
            : slot === "evening"
              ? when.weekend
                ? "выходной вечер дома"
                : "вечер дома"
              : "поздно";
  const ru = clothesToRu(w.clothes);
  return [
    `сейчас ${when.weekday} ${when.date}, ${when.time} МСК, ${label}`,
    `место: ${w.place || "ещё не ясно"}`,
    `одежда: ${w.clothes || "ещё не ясно"}${ru ? ` (${ru})` : ""}`,
    `волосы: ${w.hair || "как обычно"}`,
  ].join(". ");
}

export function sceneRule(world?: ChatWorld, at = Date.now(), ping = false, _askedClothes = false, _lastUser = "", extra?: { hot?: boolean }) {
  const slot = slotFromHour(moscowHour(at), at);
  const when = moscowWhen(at);
  const work = isAtWorkNow(world?.place, at);
  const named = specificClothes(world?.clothes);
  const ru = clothesToRu(named);
  const bits = [
    `ФАКТ СЦЕНЫ СЕЙЧАС (календарь важнее старых реплик): ${sceneCard(world, at)}.`,
    when.weekend
      ? `Сегодня ${when.weekday} — ВЫХОДНОЙ. Ты НЕ на работе и НЕ на смене. Пятница/будни не переносятся. Запрещено писать «на работе», «на смене», «ещё на работе». Дом, город, диван, свои дела.`
      : work
        ? extra?.hot
          ? "Место из карточки. Коротко. Если он пишет грязно или просит описать — играй: одежда и тело из карточки, не канцелярия «сижу за столом в офисе». Не отшивай комплимент тела."
          : "Ты на работе — коротко, без эссе."
        : "Ты НЕ на работе. Запрещено писать «ещё на работе», «на смене», «ещё не раздевалась, на работе».",
    slot === "sleep" ? "Ночь. Сонная, 1 короткое. Не бодрый офис." : "",
    slot === "evening" || slot === "night" ? "Вечер/ночь, ты дома." : "",
    slot === "weekend" ? "Выходной. Дома или в городе, не в офисе." : "",
    ping
      ? "Пишешь первая. Продолжи этот разговор, не здоровайся заново."
      : "Ответь ему как человек, не как анкета.",
    named ? `На тебе сейчас: ${ru || named}.` : "",
  ];
  return bits.filter(Boolean).join(" ");
}

export function looksLikeWorkStatus(raw: string) {
  const t = (raw || "").toLowerCase();
  return /ещё на работе|еще на работе|на работе ещё|на работе еще|ещё не раздел.{0,12}на работе|на смене/.test(t);
}

export function looksLikeWeekendShift(raw: string) {
  const t = (raw || "").toLowerCase();
  return /выходн.{0,18}(работ|смен|офис)|сегодня (работаю|на смене|в офис)|вызвали|подработ/.test(t);
}

export function isNowAtWorkLine(raw: string) {
  const t = (raw || "").toLowerCase();
  if (/вчера|в пятниц|в четверг|в понедельник|во вторник|в среду/.test(t)) return false;
  return (
    looksLikeWorkStatus(t) ||
    /(на работе сейчас|я на работе|уже в офисе|сижу в офисе|на смене сейчас)/.test(t) ||
    /^(ну[, ]*)?(на работе|на смене)\??$/.test(t.trim())
  );
}

function clock(at: number) {
  return new Date(at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Moscow",
  });
}
