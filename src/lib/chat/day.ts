import { moscowHour, moscowHourAt, moscowWhen, advanceWorld, type ChatWorld, type DaySlot } from "./world";

export type { DaySlot };

export type DayMoment = {
  hour: number;
  slot: DaySlot;
  label: string;
  world: ChatWorld;
  canPhoto: boolean;
  canPing: boolean;
  replyMs: (viewing: boolean) => number;
  pingHint: string;
};

export function dayNow(now = new Date()): DayMoment {
  const hour = moscowHour(now.getTime());
  const when = moscowWhen(now.getTime());
  const off = when.weekend;
  const dayName = when.weekday;
  if (hour >= 1 && hour < 7) {
    return {
      hour,
      slot: "sleep",
      label: `${dayName}, ${hour}:00, спит / телефон на беззвуке`,
      world: { place: "bedroom at home, dark, bed", clothes: "sleep clothes or nothing much", hair: "as usual, messy from sleep" },
      canPhoto: true,
      canPing: false,
      replyMs: (v) => (v ? 5000 + Math.random() * 8000 : 50_000 + Math.random() * 120_000),
      pingHint: "спит. если ответит — сонная, коротко. на срыве может кинуть кадр с кровати и опять молчать.",
    };
  }
  if (hour < 10) {
    return {
      hour,
      slot: "morning",
      label: `${dayName}, ${hour}:00, ${off ? "выходное утро дома" : "утро, собирается"}`,
      world: { place: "home, kitchen or bathroom, morning light", clothes: "home clothes or getting dressed", hair: "as usual" },
      canPhoto: true,
      canPing: true,
      replyMs: (v) => (v ? 400 + Math.random() * 800 : 8_000 + Math.random() * 16_000),
      pingHint: off ? "выходное утро: кофе, без сборов на работу." : "утро: кофе, сборы, коротко. не любовная сцена.",
    };
  }
  if (hour < 18 && !off) {
    return {
      hour,
      slot: "work",
      label: `${dayName}, ${hour}:00, будний день, на работе / в делах`,
      world: { place: "at work, indoor, not home", clothes: "casual work clothes", hair: "as usual" },
      canPhoto: hour >= 12 && hour <= 14,
      canPing: true,
      replyMs: (v) => (v ? 400 + Math.random() * 900 : 18_000 + Math.random() * 35_000),
      pingHint: "коротко из рабочего чата. не эротика, не длинные разборы. может пропасть.",
    };
  }
  if (hour < 18 && off) {
    return {
      hour,
      slot: "weekend",
      label: `${dayName}, ${hour}:00, выходной, день`,
      world: { place: "at home, apartment, weekend daytime", clothes: "casual clothes", hair: "as usual" },
      canPhoto: true,
      canPing: true,
      replyMs: (v) => (v ? 1200 + Math.random() * 2500 : 12_000 + Math.random() * 25_000),
      pingHint: `сегодня ${dayName}, выходной. дома или в городе, НЕ на работе и НЕ на смене.`,
    };
  }
  if (hour < 23) {
    return {
      hour,
      slot: "evening",
      label: `${dayName}, ${hour}:00, ${off ? "выходной вечер дома" : "вечер дома"}`,
      world: { place: "at home, apartment, evening lamp, sofa or bed", clothes: "home clothes or sleepwear", hair: "down or as usual" },
      canPhoto: true,
      canPing: true,
      replyMs: (v) => (v ? 350 + Math.random() * 700 : 6_000 + Math.random() * 14_000),
      pingHint: off
        ? `сегодня ${dayName}, выходной вечер дома. живее, можно флирт.`
        : "вечер дома. живее, можно флирт. на секрете/срыве — жарче, не начинай ссору.",
    };
  }
  return {
    hour,
    slot: "night",
    label: `${dayName}, ${hour}:00, поздно`,
    world: { place: "bedroom or sofa at home, dim lamp", clothes: "sleep clothes or underwear", hair: "down" },
    canPhoto: true,
    canPing: true,
    replyMs: (v) => (v ? 400 + Math.random() * 900 : 12_000 + Math.random() * 25_000),
    pingHint: "поздно. честнее и грязнее чем днём. может сама кадр. не каталог частей тела.",
  };
}

export function liveWorld(prev?: ChatWorld, herRecent = "", lastAt?: number): ChatWorld {
  const day = dayNow();
  return advanceWorld({
    prev,
    herText: herRecent,
    lastAt,
    slot: day.slot,
    slotWorld: day.world,
  });
}

export function isHeatNight(now = new Date()) {
  const s = dayNow(now).slot;
  return s === "evening" || s === "night" || s === "sleep";
}

export function dayLine() {
  const d = dayNow();
  return `сейчас ${d.label}. ${d.pingHint}`;
}

export { moscowHour, moscowHourAt };
