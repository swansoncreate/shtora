import { clothesToRu, isWorkPlace, specificClothes, type ChatWorld, type DaySlot } from "@/lib/chat/world";

const BAN =
  /^(home clothes|casual|outfit|clothes|default|none|n\/a|regular clothes|ordinary clothes|sleep clothes|casual clothes|casual work clothes|work clothes|home clothes or sleepwear|home clothes or getting dressed|sleep clothes or nothing much|sleep clothes or underwear|as usual|nothing much)$/i;

const SLOT: Record<DaySlot, { placeRu: string; placeEn: string; clothesRu: string; clothesEn: string; hairRu: string; hairEn: string }> = {
  sleep: {
    placeRu: "дома, в кровати",
    placeEn: "bedroom at home, dark",
    clothesRu: "майка и шорты, волосы собраны",
    clothesEn: "worn tee and shorts, hair tied up",
    hairRu: "собраны",
    hairEn: "tied up",
  },
  morning: {
    placeRu: "дома, утро",
    placeEn: "home, morning light",
    clothesRu: "худи и домашние шорты",
    clothesEn: "grey hoodie and lounge shorts",
    hairRu: "как обычно",
    hairEn: "as usual",
  },
  work: {
    placeRu: "на работе",
    placeEn: "at work, indoor",
    clothesRu: "рабочая одежда смены, волосы убраны",
    clothesEn: "work clothes, hair tied back",
    hairRu: "убраны",
    hairEn: "tied back",
  },
  weekend: {
    placeRu: "дома, выходной",
    placeEn: "at home, apartment, weekend",
    clothesRu: "футболка и джинсы",
    clothesEn: "tee and jeans",
    hairRu: "как обычно",
    hairEn: "as usual",
  },
  evening: {
    placeRu: "дома, вечер",
    placeEn: "at home, apartment, evening",
    clothesRu: "худи, волосы распущены",
    clothesEn: "hoodie, hair down",
    hairRu: "распущены",
    hairEn: "down",
  },
  night: {
    placeRu: "дома, поздно",
    placeEn: "bedroom at home, dim lamp",
    clothesRu: "майка, дома",
    clothesEn: "tee, at home",
    hairRu: "распущены",
    hairEn: "down",
  },
};

const SLOT_EN = new Set(Object.values(SLOT).map((row) => row.clothesEn.toLowerCase()));

export function isBannedClothes(raw?: string) {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return true;
  return BAN.test(t);
}

export function fitDmWorld(prev: ChatWorld | undefined, slot: DaySlot): ChatWorld {
  const stub = SLOT[slot] || SLOT.evening;
  const old = (prev?.clothes || "").trim();
  const cyr = /[а-яё]/i.test(old);
  const concrete = Boolean(specificClothes(old)) && !isBannedClothes(old) && !SLOT_EN.has(old.toLowerCase());
  const named = Boolean(prev?.clothesNamed) || concrete;
  let place = prev?.place || stub.placeEn;
  let placeRu = prev?.placeRu || stub.placeRu;
  if (slot !== "work" && isWorkPlace(place)) {
    place = stub.placeEn;
    placeRu = stub.placeRu;
  }
  let clothes = prev?.clothes || "";
  let clothesRu = prev?.clothesRu || "";
  if (!named || isBannedClothes(clothes)) {
    clothes = stub.clothesEn;
    clothesRu = stub.clothesRu;
  } else if (cyr) {
    clothesRu = clothesRu || old;
    clothes = !isBannedClothes(prev?.clothes) && !cyr ? prev?.clothes || "" : "";
  } else {
    clothesRu = clothesRu || clothesToRu(clothes) || clothes;
  }
  if (/[а-яё]/i.test(clothesRu) && /[a-z]/i.test(clothesRu)) {
    clothesRu = clothesRu.replace(/\b[a-z][a-z-]*\b/gi, " ").replace(/\s+/g, " ").trim();
  }
  return {
    ...(prev || {}),
    place,
    placeRu,
    clothes: clothes || undefined,
    clothesRu,
    clothesNamed: named && !isBannedClothes(cyr ? clothesRu : clothes),
    hair: prev?.hair && prev.hair !== "as usual" ? prev.hair : stub.hairEn,
    hairRu: prev?.hairRu || stub.hairRu,
    memAbout: prev?.memAbout,
    memOpen: prev?.memOpen,
    memDodged: prev?.memDodged,
  };
}

export function acceptLook(prev: ChatWorld, next: { clothesRu?: string; clothesEn?: string; placeRu?: string; placeEn?: string; hairRu?: string; hairEn?: string }, slot: DaySlot): ChatWorld {
  const out = { ...prev };
  const en = (next.clothesEn || "").replace(/\s+/g, " ").trim();
  const ru = (next.clothesRu || "").replace(/\s+/g, " ").trim();
  const lone = /^(shirt|jeans|skirt|top|dress)$/i.test(en);
  if (en && !lone && !isBannedClothes(en) && specificClothes(en) && !SLOT_EN.has(en.toLowerCase()) && !/[а-яё]/i.test(en)) {
    out.clothes = en.slice(0, 120);
    out.clothesNamed = true;
  }
  if (ru && /[а-яё]/i.test(ru) && !/[a-z]/i.test(ru) && ru.length > 2 && !isBannedClothes(ru) && !/^и\s/i.test(ru) && !/^(юбка|джинсы|рубашка|платье|шорты|футболка)$/i.test(ru)) {
    out.clothesRu = ru.slice(0, 120);
    out.clothesNamed = true;
  }
  const placeEn = (next.placeEn || "").trim();
  const placeRu = (next.placeRu || "").trim();
  if (placeEn && !(slot !== "work" && isWorkPlace(placeEn))) out.place = placeEn.slice(0, 120);
  if (placeRu && /[а-яё]/i.test(placeRu)) out.placeRu = placeRu.slice(0, 120);
  if (next.hairEn && !/as usual/i.test(next.hairEn)) out.hair = next.hairEn.slice(0, 80);
  if (next.hairRu && /[а-яё]/i.test(next.hairRu)) out.hairRu = next.hairRu.slice(0, 80);
  return out;
}
