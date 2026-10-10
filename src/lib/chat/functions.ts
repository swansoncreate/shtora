import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const historyItem = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(2000),
  kind: z.enum(["text", "photo", "story", "post", "heart", "action", "circle"]).optional(),
  at: z.number().optional(),
  heartByUser: z.boolean().optional(),
  heartByHer: z.boolean().optional(),
});

const worldWire = z
  .object({
    place: z.string().max(160).optional(),
    clothes: z.string().max(160).optional(),
    hair: z.string().max(160).optional(),
    placeRu: z.string().max(160).optional(),
    clothesRu: z.string().max(160).optional(),
    hairRu: z.string().max(160).optional(),
    clothesNamed: z.boolean().optional(),
    memAbout: z.string().max(160).optional(),
    memOpen: z.string().max(160).optional(),
    memDodged: z.string().max(140).optional(),
  })
  .optional();

const moscowSlot = z.enum(["sleep", "morning", "work", "weekend", "evening", "night"]).optional();

type ChatOut =
  | {
      ok: true;
      text: string;
      bubbles: string[];
      photoKind: string;
      scene: string;
      once: boolean;
      dm?: boolean;
      skipped?: boolean;
      mood?: string;
      memory?: string;
      reactHeart?: boolean;
      place?: string;
      clothes?: string;
      hair?: string;
      placeRu?: string;
      clothesRu?: string;
      hairRu?: string;
      clothesNamed?: boolean;
      memAbout?: string;
      memOpen?: string;
      memDodged?: string;
      warmthDelta?: number;
      bondDelta?: {
        warmth?: number;
        trust?: number;
        heat?: number;
        irrit?: number;
        guilt?: number;
        spark?: number;
      };
      log?: string;
      arc?: {
        beat: "ice" | "test" | "thaw" | "hook" | "open" | "pull";
        want: string;
        avoid: string;
        loops: string[];
        lastMove: string;
      };
      brainId?: string;
      imageUrl?: string;
    }
  | { ok: false; error: string };

async function completeChat(apiKey: string, messages: unknown[], temperature: number, json = false) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  async function once(model: string, asJson: boolean) {
    const payload: Record<string, unknown> = { model, temperature, messages };
    if (asJson) payload.response_format = { type: "json_object" };
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(35_000),
    });
    const text = await res.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }
    return { res, parsed };
  }

  const models = ["grok-4-fast-non-reasoning", "grok-3"];
  let res: Response | undefined;
  let parsed: Record<string, unknown> | null = null;
  for (const model of models) {
    ({ res, parsed } = await once(model, json));
    if (res.ok) break;
    const blocked = spendingLimit(parsed, res.status);
    if (blocked) return { ok: false as const, error: blocked };
    if (json) {
      ({ res, parsed } = await once(model, false));
      if (res.ok) break;
      const blocked2 = spendingLimit(parsed, res.status);
      if (blocked2) return { ok: false as const, error: blocked2 };
    }
  }

  if (!res || !res.ok) {
    const err = parsed?.error;
    const msg =
      spendingLimit(parsed, res?.status ?? 0) ||
      (typeof err === "string"
        ? err
        : err && typeof err === "object" && typeof (err as { message?: string }).message === "string"
          ? (err as { message: string }).message
          : `Чат HTTP ${res?.status ?? 0}`);
    return { ok: false as const, error: msg };
  }
  const choices = Array.isArray(parsed?.choices) ? parsed.choices : [];
  const first = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : null;
  const message = first?.message && typeof first.message === "object" ? (first.message as Record<string, unknown>) : null;
  const content = typeof message?.content === "string" ? message.content.trim() : "";
  if (!content) return { ok: false as const, error: "Пустой ответ." };
  return { ok: true as const, content };
}

function spendingLimit(parsed: Record<string, unknown> | null, status: number) {
  const err = parsed?.error;
  const code = typeof parsed?.code === "string" ? parsed.code : "";
  const msg =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && typeof (err as { message?: string }).message === "string"
        ? (err as { message: string }).message
        : "";
  const blob = `${code} ${msg}`.toLowerCase();
  if (blob.includes("spending-limit") || blob.includes("run out of credits") || blob.includes("out of credits")) {
    return "Закончились кредиты xAI — чат и Imagine стоят. Пополни на grok.com/?_s=usage или SuperGrok. Инста и Dropbox работают.";
  }
  if (status === 429 || blob.includes("rate limit")) return "Слишком часто — подожди минуту.";
  return "";
}

type ChatJson = {
  text: string;
  bubbles?: string[];
  mood?: string;
  memory?: string;
  photo?: string;
  scene?: string;
  heart?: boolean;
  once?: boolean;
  place?: string;
  clothes?: string;
  hair?: string;
  warmthDelta?: number;
};

function parseReply(raw: string, fallbackMood?: string, fallbackMemory?: string): ChatJson {
  const json = extractJson(raw);
  if (json) {
    return {
      text: stripChatMeta(json.text),
      mood: (json.mood || fallbackMood)?.slice(0, 40),
      memory: (json.memory || fallbackMemory)?.slice(0, 900),
      photo: json.photo,
      heart: json.heart,
      once: json.once,
      bubbles: json.bubbles,
    };
  }
  return {
    text: stripChatMeta(raw),
    mood: (grabMeta(raw, "MOOD") || fallbackMood)?.slice(0, 40),
    memory: (grabMeta(raw, "MEM") || fallbackMemory)?.slice(0, 900),
    photo: grabMeta(raw, "PHOTO"),
    heart: /heart|❤|серд/i.test(grabMeta(raw, "REACT") || ""),
  };
}

function extractJson(raw: string): ChatJson | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence?.[1] ?? raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
    const text = typeof parsed.text === "string" ? parsed.text : typeof parsed.message === "string" ? parsed.message : "";
    if (!text && parsed.photo == null) return null;
    const photo = typeof parsed.photo === "string" ? parsed.photo : undefined;
    const heart = parsed.heart === true || parsed.react === "heart";
    return {
      text,
      mood: typeof parsed.mood === "string" ? parsed.mood : undefined,
      memory: typeof parsed.memory === "string" ? parsed.memory : typeof parsed.mem === "string" ? parsed.mem : undefined,
      photo,
      heart,
      once: parsed.once === true,
      place: typeof parsed.place === "string" ? parsed.place : undefined,
      clothes: typeof parsed.clothes === "string" ? parsed.clothes : undefined,
      hair: typeof parsed.hair === "string" ? parsed.hair : undefined,
      warmthDelta: typeof parsed.warm === "number" ? parsed.warm : typeof parsed.warmth === "number" ? parsed.warmth : undefined,
      scene: typeof parsed.scene === "string" ? parsed.scene : undefined,
      bubbles: Array.isArray(parsed.bubbles)
        ? parsed.bubbles.filter((b): b is string => typeof b === "string" && Boolean(b.trim())).slice(0, 3)
        : undefined,
    };
  } catch {
    return null;
  }
}

function grabMeta(raw: string, key: string) {
  const match = raw.match(new RegExp(`(?:^|\\n)\\s*${key}\\s*:\\s*([^\\n]+)`, "i"));
  return match?.[1]?.trim();
}

export function stripChatMeta(raw: string) {
  let s = (raw || "").trim();
  if (s.startsWith("{") && s.includes('"text"')) {
    const json = extractJson(s);
    if (json) s = json.text;
  }
  const cut = s.search(/(?:^|\n)\s*(PHOTO|MOOD|MEM|REACT|PERSONA|WARM|PLACE|CLOTHES|HAIR|SCENE|ONCE)\s*:/i);
  if (cut >= 0) s = s.slice(0, cut);
  return s
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\b(PHOTO|MOOD|MEM|REACT|PERSONA|WARM|PLACE|CLOTHES|HAIR|SCENE|ONCE)\s*:?\s*[^\n]*/gi, "")
    .replace(/^\s*(PHOTO|MOOD|MEM|REACT|PERSONA)\b.*$/gim, "")
    .replace(/\b(лайк от него|он лайкнул твою сторис|он лайкнул твой пост)\b/gi, "")
    .replace(/^(?:\{|\[)[\s\S]*$/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .split(/\n+/)
    .map((line) => stripChatTic(line))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function lastUserText(history: { role: string; text: string }[]) {
  return [...history].reverse().find((item) => item.role === "user")?.text ?? "";
}

function askedForPhoto(history: { role: string; text: string; kind?: string }[]) {
  const last = [...history].reverse().find((item) => item.role === "user");
  if (!last) return false;
  if (last.kind === "heart") return false;
  if ((last.kind === "post" || last.kind === "story") && !looksLikePhotoAsk(last.text)) return false;
  return looksLikePhotoAsk(`${last.kind ?? ""} ${last.text}`);
}

export function looksLikeClothesAsk(raw: string) {
  const t = (raw || "").toLowerCase();
  return /во что.{0,30}(одета|одел|надел)|что на тебе|в чём ты|в чем ты|как выглядишь|в какой одежде|что на мне|покажи как выгля/.test(
    t,
  );
}

export function looksLikePhotoAsk(raw: string) {
  const t = raw.toLowerCase();
  if (looksLikeLookPoseAsk(t)) return true;
  if (/(покажи|скинь|можно|хочу|дай|ещё|еще).{0,24}(фот|селфи|кадр|ножк|поп|живот|юбк|футболк|зеркал|сзад|бок|нагн)/.test(t)) return true;
  return /фото|фотк|скинь кадр|кинь фот|селфи|сфотк|можно фот|давай фот|хочу фот|можно селфи|ещё фот|еще фот|сзади\?|боком\?|нагнись|нагнуться/.test(t);
}

export function looksLikeAngleAsk(raw: string) {
  const t = (raw || "").toLowerCase();
  return /сзади|задом|боком|сбоку|с другого|другой ракурс|ещё ракурс|еще ракурс|ноги|ножк|живот|грудь|сиськ|попу|попк|задниц|полный рост|во весь рост/.test(
    t,
  );
}

/** Сзади / боком / полный рост / нагнись того же лука — ракурс, не каталог. */
export function looksLikeLookPoseAsk(raw: string) {
  const t = (raw || "").toLowerCase();
  return /нагн|наклон|по(пу|пку) лучше|спин.{0,16}лучше|ещё (сзад|задом|бок)|еще (сзад|задом|бок)|чуть (сзад|ниже|бок)/.test(t);
}

export function looksLikeCameraAsk(raw: string) {
  const t = (raw || "").toLowerCase();
  if (looksLikeLookPoseAsk(t)) return true;
  if (/попу|попк|задниц|жоп|сиськ|грудь|ножк/.test(t) && !/сзади|задом|боком|сбоку|полный рост|во весь рост/.test(t)) {
    return false;
  }
  return /сзади|задом|боком|сбоку|со спин|спину|с другого ракурс|другой ракурс|полный рост|во весь рост|from behind/.test(t);
}

export function looksLikePoseRefuse(raw: string) {
  const t = (raw || "").toLowerCase();
  if (/(сзад|бок|сбок|ног|живот|груд|ракурс).{0,16}не буду/.test(t)) return true;
  if (/не буду.{0,16}(сзад|бок|сбок|ног|живот|груд|ракурс)/.test(t)) return true;
  if (/сзади не|боком не|сбоку не|давай по делу|по делу$|одного хватит|хватит фот|уже (скинула|кинула|отправила)/.test(t)) {
    return true;
  }
  return false;
}

export function looksLikeRefuse(raw: string) {
  const t = raw.toLowerCase().trim();
  if (/^(не хочу|не буду|не могу|не скину|не надо|нет|хватит|фото нет|без селфи|без фото|пока нет|сейчас нет)\.?$/.test(t)) return true;
  if (/не могу/.test(t) && /работ/.test(t)) return true;
  if (looksLikePoseRefuse(t)) return true;
  return /фото нет|без селфи|без фото|не скину|не кину|скинуть не могу|не могу скинуть|сейчас не могу|не могу сейчас|не могу,|хватит( уже)?|не надо( уже)?|не проси|больше не проси|не повторяйся|не буду я фот|не буду фотк|уже не кину|в футболке я больше не|не разденусь|иди уже спать|спи уже|позже скину|потом скину|не сейчас|пока нет|сейчас нет|может потом|чуть позже|может попозже|ещё не то|еще не то|дома висит|на работе в другом|рабочий чат|я на работе|давай по делу/.test(
    t,
  );
}

export function looksLikeGalleryAsk(raw: string) {
  const t = (raw || "").toLowerCase();
  if (!t.trim()) return false;
  if (/расстегн|сфоткайся|прямо сейчас сфот|голая|сиськ|без одеж|ню\b/.test(t)) return false;
  const wants = /фото|скинь|покажи|кружок|из галере|из лент|как выглядел|в чём был|примерк/.test(t);
  if (!wants) return false;
  return /подар|сестр|алин|комплект|юбк|плать|вчерашн|тот образ|то фото|этот наряд|в той|то что вчера|то вчерашнее|бордов|помню у тебя|выбрать|какой.{0,12}(лучш|нормал)/.test(
    t,
  );
}

export function looksLikeCircleAsk(raw: string) {
  const t = (raw || "").toLowerCase();
  return /кружок|кругляш|видеокруж|video note|как в телег|круглым видео/.test(t);
}

export function sheOffersPhoto(raw: string) {
  const t = raw.toLowerCase();
  if (/\bты (отправ|скин|кин)/.test(t)) return false;
  if (looksLikeRefuse(t) && !/сейчас (кину|скину|отправл)/.test(t)) return false;
  if (/не держи|не (задер|скин|кин|отправ)/.test(t)) return false;
  return /скину|кину|отправл|пришлю|прислать|переоденусь|переоделась|вот смотри|держи|лови кадр|сейчас сниму|могу скинуть|селфи могу|могу селфи|щас сфот|ща (кину|скину)|вот тебе фот|кидаю|задер|наклон.{0,24}сделаю/.test(
    t,
  );
}

export function looksLikeDescribeAsk(raw: string) {
  const t = (raw || "").toLowerCase();
  return /опиши|расскажи как ты|как ты сейчас (леж|сид|выгляд)|каждый сантиметр|подробн.{0,24}(леж|сид|тело|одежд)/.test(t);
}

/** Command to send nudes / a body-part catalog — not a compliment and not a current-look selfie. */
export function looksLikeCatalogAsk(raw: string) {
  const t = (raw || "").toLowerCase();
  if (looksLikeLookPoseAsk(t) || looksLikeCameraAsk(t) || looksLikeCircleAsk(t) || looksLikeDescribeAsk(t)) return false;
  if (/(скинь|покажи|кинь|дай|хочу).{0,24}(сиськ|грудь|голая|голую|голое|ню|без одеж|без белья|трусик|жоп|задниц|попк|попу)/.test(t)) {
    return true;
  }
  if (/(голая|голую|голое|без одежды|ню фото|nudes?)/.test(t) && /(скинь|покажи|кинь|фото|фотк)/.test(t)) return true;
  return false;
}

/** Dirty talk / body comments — play along at fall, not a catalog command. */
export function looksLikeDirtyTalk(raw: string) {
  const t = (raw || "").toLowerCase();
  if (looksLikeCatalogAsk(t) || looksLikeCameraAsk(t) || looksLikeLookPoseAsk(t)) return false;
  return /жоп|попк|попу|соск|сиськ|груд|дроч|конч|влажн|возбуд|стояк|трах|секс|горяч|хочу тебя|набух|без лифчик|лифчик/.test(t);
}

export function looksLikePressure(raw: string) {
  return looksLikeCatalogAsk(raw);
}

/** Strip the model tic: trailing filler «а», lone «а», playbook parrot. */
export function stripChatTic(raw: string) {
  let s = (raw || "").replace(/\u00a0/g, " ").trim();
  if (!s) return "";
  if (/^а{1,2}$/i.test(s)) return "";
  if (/мне спокойней когда ты на связи/.test(s.toLowerCase())) return "";
  s = s.replace(/(\s+а)+\s*$/gi, "");
  s = s.replace(/([,.)!?…])\s*а\s*$/gi, "$1");
  s = s.replace(/\s+а\s*$/gi, "");
  return s.replace(/\s+/g, " ").trim();
}


function photoKind(userText: string, field?: string) {
  const t = `${userText} ${field ?? ""}`.toLowerCase();
  const f = (field ?? "").trim().toLowerCase();
  if (f === "none") {
    const cam = cameraKindFromUser(userText);
    return cam || "none";
  }
  if (f === "" && !askedLoose(t)) return "none";
  const cam = cameraKindFromUser(`${userText} ${f}`);
  if (cam) return cam;
  if (/живот|пупок|талия|пресс|midriff|belly/.test(t)) return "belly";
  if (/ног|что на мне|надела|pov|от первого/.test(t) || f === "pov") return "pov";
  if (/зеркал/.test(t)) return "mirror";
  if (/откровен|голая|без одеж|ню|грудь|18/.test(t) || f === "spicy") return "spicy";
  if (f && f !== "none" && f !== "selfie") return f;
  return "selfie";
}

function cameraKindFromUser(raw: string) {
  const t = (raw || "").toLowerCase();
  if (/нагн|наклон|по(пу|пку) лучше|спин.{0,16}лучше/.test(t)) return "back";
  if (/попу|попк|задниц|жоп|сиськ|грудь|ножк/.test(t) && !/сзади|задом|боком|сбоку/.test(t)) return "";
  if (/сзад|задом|со спин|спину|from behind/.test(t)) return "back";
  if (/боком|сбоку|с боку|в профиль|side view/.test(t)) return "side";
  if (/полн(ый|ым)? рост|во весь рост|full[- ]?body/.test(t) || (/рост/.test(t) && !/подрост/.test(t))) return "full";
  return "";
}

export function kindFromAsk(userText: string) {
  return cameraKindFromUser(userText) || photoKind(userText, "selfie");
}

function patchCameraOut(out: ChatOut, data: { history?: { role: string; text?: string }[]; warmth?: number; world?: { place?: string; clothes?: string; hair?: string } }): ChatOut {
  if (!out || !out.ok) return out;
  const last = [...(data.history ?? [])].reverse().find((h) => h.role === "user")?.text || "";
  const mem = scrubMemory(out.memory);
  const bubbles0 = (out.bubbles?.length ? out.bubbles : (out.text || "").split(/\n{2,}/))
    .map((b) => stripChatTic(stripChatMeta(b)))
    .filter(Boolean);
  let bubbles = bubbles0.filter((b) => !/^\s*ты (отправил|скинул|кинул)/i.test(b));
  const dirty = looksLikeDirtyTalk(last) || looksLikeDescribeAsk(last);
  const office = bubbles.some((b) => /сижу за столом|за компом работаю|в офисе/.test(b.toLowerCase()));
  const w = data.warmth ?? 40;
  if (dirty && w >= 70 && (office || !bubbles.length || bubbles.every((b) => looksLikeRefuse(b)))) {
    const ru = (data.world?.clothes || "").toLowerCase();
    const look = /short/.test(ru) && /top|crop/.test(ru) ? "кроп топ и шорты" : ru ? ru.slice(0, 40) : "то что на мне";
    bubbles = looksLikeDescribeAsk(last)
      ? [`лежу, на мне ${look}`, "можешь смотреть)"]
      : ["ну и что дальше)", "тебе ж нравится"];
  }
  if (looksLikeCameraAsk(last) || looksLikeLookPoseAsk(last)) {
    if (w < 72) return { ...out, bubbles, text: bubbles.join("\n\n"), memory: mem };
    const cam = cameraKindFromUser(last) || "back";
    const kept = bubbles.filter((b) => !looksLikeRefuse(b) && !looksLikePoseRefuse(b));
    bubbles = kept.length ? kept.slice(0, 2) : ["ну держи"];
    return { ...out, photoKind: cam, bubbles, text: bubbles.join("\n\n"), memory: mem };
  }
  return { ...out, bubbles: bubbles.slice(0, 2), text: bubbles.join("\n\n"), memory: mem };
}

function askedLoose(t: string) {
  return /фото|фотк|скинь|селфи|зеркал|живот|полный рост|во весь рост|боком|сзади|задом|голая|без одеж|покажи себя/.test(t);
}

export function hookDelta(text: string, kind?: string) {
  if (kind === "heart") return 1;
  const t = (text || "").toLowerCase();
  if (!t.trim()) return 0;
  let d = 0;
  if (/помню|тогда|мы же|как тогда|скучаю|улыб|смешн|ахах|хаха|хаха/.test(t) && t.length > 12) d += 1;
  if (/красив|нрав|глаза|голос|стиль|умн|жоп|попк|соск/.test(t) && !/голая|скинь ню|без одежд/.test(t)) d += 1;
  if (/скинь ню|без одежд|18\+|xxx/.test(t) || looksLikeCatalogAsk(t)) d -= 1;
  if (/^(скинь|фото|фотку|ещё|еще|ну)\b/.test(t) && t.length < 18) d -= 1;
  if (/дура|сука|заткни|тупая/.test(t)) d -= 1;
  return Math.max(-1, Math.min(1, d));
}

function gatePhoto(
  kind: string,
  warmth: number,
  facts: ReturnType<typeof storyFacts>,
  asked: boolean,
  refused: boolean,
  userAsk: string,
) {
  if (refused) return "none";
  const w = warmth;
  const risky = facts.girlfriend || facts.photoRisky;
  if (!risky) {
    if (asked && (kind === "none" || !kind)) return photoKind(userAsk, "selfie");
    return kind || "none";
  }
  if (w < 40) return "none";
  if (w < 70) {
    if (kind === "spicy" || kind === "belly") return "none";
    if (asked && (kind === "none" || !kind)) return "selfie";
    return kind || "none";
  }
  if (w < 90) {
    if (kind === "spicy") return "spicy";
    if (asked && (kind === "none" || !kind)) return kind === "none" ? "selfie" : kind;
    return kind || "none";
  }
  if (asked && (kind === "none" || !kind)) return photoKind(userAsk, "selfie");
  return kind || "none";
}

function isSpicy(userText: string, kind: string) {
  return kind === "spicy" || /откровен|голая|без одеж|ню|грудь|18/.test(userText.toLowerCase());
}

export const buildPersona = createServerFn({ method: "POST" })
  .validator(
    z.object({
      username: z.string().min(1).max(40),
      fullName: z.string().max(80).optional(),
      bio: z.string().max(400).optional(),
      captions: z.array(z.string().max(200)).max(10),
    }),
  )
  .handler(async ({ data }) => {
    const apiKey = typeof process === "undefined" ? "" : process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "Чат сейчас недоступен." };
    const captions = data.captions.filter(Boolean).map((c) => c.replace(/\s+/g, " ").slice(0, 160));
    const out = await completeChat(
      apiKey,
      [
        {
          role: "system",
          content:
            "Карточка персонажа для Instagram DM, по-русски, без markdown. Два блока:\nPERSONA: 80-120 слов, как пишет (слэнг, длина, эмодзи, когда злится/флиртует). Не шаблон «милая девочка».\nMOOD: 2-4 слова.",
        },
        {
          role: "user",
          content: `Ник: @${data.username}\nИмя: ${data.fullName || data.username}\nБио: ${data.bio || "—"}\nПосты:\n${captions.join("\n") || "нет"}`,
        },
      ],
      0.8,
    );
    if (!out.ok) return out;
    const personaMatch = out.content.match(/PERSONA:\s*([\s\S]+?)(?:\nMOOD:|$)/i);
    const moodMatch = out.content.match(/MOOD:\s*(.+)/i);
    const persona = (personaMatch?.[1] || out.content).replace(/^PERSONA:\s*/i, "").trim().slice(0, 1400);
    const mood = (moodMatch?.[1] || "спокойная").trim().slice(0, 40);
    return { ok: true as const, persona, mood };
  });

function canonBackstory(raw?: string) {
  const t = raw?.trim();
  if (t) return stripStoryHints(t);
  return "Вы почти не знакомы. Он сам написал в директ. Не веди себя как близкая: без милый/зай/интима с порога. Знакомство с нуля, коротко и сдержанно.";
}

function stripStoryHints(raw: string) {
  return raw
    .replace(/почти не знакомы \/ друзья \/ бывшие \/ было что-то/gi, "")
    .replace(/вчера \/ месяц \/ 5 лет — от этого тон/gi, "")
    .replace(/его девушка, её лучшая подруга, имена — если есть, она ЭТО знает/gi, "")
    .replace(/тон, как называет, мат, длина/gi, "")
    .replace(/факты: имя, город, что между вами/gi, "")
    .replace(/почему не кидает фото, чего не ломать/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function yearsWord(n: string) {
  const map: Record<string, string> = {
    два: "2",
    две: "2",
    три: "3",
    четыре: "4",
    пять: "5",
    шесть: "6",
    семь: "7",
    восемь: "8",
    девять: "9",
    десять: "10",
  };
  return map[n] || n;
}

export type StoryRelation = "stranger" | "known" | "friends" | "ex" | "close";

export function storyFacts(raw?: string) {
  const filled = (raw || "").trim();
  const text = canonBackstory(filled);
  if (!filled) {
    return {
      text,
      girlfriend: false,
      gapLabel: "",
      photoRisky: false,
      relation: "stranger" as StoryRelation,
      relationLine: "Почти не знакомы. Он сам написал. Знакомство с нуля.",
    };
  }
  const low = stripStoryHints(filled).toLowerCase();
  const who = sectionOf(low, "кто вы") || low;
  const whoElse = sectionOf(low, "кто ещё");
  const girlfriend =
    /у него (есть )?(девушк|жена)|его девушк|моя (лучшая )?подруг|лучш\w{0,8}\s+подруг.{0,40}(его|парн)|измен\w*|катя|оля|алина/.test(
      low,
    ) || (/девушк|жена|подруг|катя|оля|алин/.test(whoElse) && whoElse.replace(/[()]/g, "").trim().length > 2);
  const gapSrc = sectionOf(low, "как давно не общались") || low;
  const y = gapSrc.match(/(\d+)\s*лет/) || gapSrc.match(/(два|две|три|четыре|пять|шесть|семь|восемь|девять|десять)\s*лет/);
  let gapLabel = "";
  if (y?.[1]) gapLabel = `в жизни не общались около ${yearsWord(y[1])} лет`;
  else if (/год не|год как не|целый год|год не пис/.test(gapSrc)) gapLabel = "в жизни не общались около года";
  else if (/давно не общ|лет не пис|лет не вид|годами не/.test(gapSrc)) gapLabel = "в жизни давно не общались, годы";
  const relation = relationOf(who, low, gapLabel);
  const photoRisky =
    girlfriend || /табу[\s\S]{0,160}(фото|интим|флирт|измен|ню|голая)/.test(low) || /не кид\w* фото|нельзя фото/.test(low);
  return {
    text,
    girlfriend,
    gapLabel,
    photoRisky,
    relation,
    relationLine: relationLine(relation, gapLabel, girlfriend),
  };
}

function sectionOf(low: string, title: string) {
  const re = new RegExp(`${title}:\\s*([\\s\\S]*?)(?=\\n(?:кто |как |что |табу)|$)`, "i");
  return (low.match(re) || [])[1] || "";
}

function relationOf(who: string, all: string, gap: string): StoryRelation {
  if (/бывш|расстал|расстались|поруга|когда-то был|было что-то/.test(who) || /бывш(ие|ий|ая)|расстал/.test(all)) return "ex";
  if (/любовн|встречал|вместе жил|очень близк|роман был|секс был/.test(`${who} ${all}`)) return "close";
  if (
    /друз(ья|ей|ом)|мы друж|подружи|друг детств|однокласс|коллег|учились|знакомы давно/.test(who) ||
    /друз(ья|ей)|знакомы давно/.test(all)
  ) {
    return "friends";
  }
  if (/почти не знаком|едва знаком|не знаком|первый раз|написал в директ/.test(who) && !/друг|бывш|знаком[аы] давно/.test(who)) {
    return "stranger";
  }
  if (/знаком/.test(who) || gap) return "known";
  return who.replace(/кто вы/g, "").trim().length > 12 ? "known" : "stranger";
}

function relationLine(relation: StoryRelation, gap: string, girlfriend: boolean) {
  const pause = gap ? ` ${gap}.` : "";
  const gf = girlfriend ? " У него девушка — это в законе, не в каждом пузыре." : "";
  switch (relation) {
    case "friends":
      return `В ЖИЗНИ вы знакомы (друзья).${pause} Это не рандом из директа и не «а ты кто». Холод можно из-за паузы, не из-за незнакомства.${gf}`;
    case "ex":
      return `В ЖИЗНИ вы бывшие / было что-то.${pause} Память о прошлом есть. Не представляйся. Лёд = осторожность, не незнакомка.${gf}`;
    case "close":
      return `Вы были близки.${pause} Не играй незнакомку.${gf}`;
    case "known":
      return `Вы не чужие.${pause} Можно сухо, но ты его знаешь.${gf}`;
    default:
      return `Почти не знакомы. Знакомство с нуля.${gf}`;
  }
}

const FOREIGN_MEM =
  /на работе: короче|отвечает на вопрос, не одно|его девушка — она это знает|его девушка \/ её близкая|кто вы:|как общаетесь:|что уже было:|как давно не общались:|кто ещё:|табу:|\bнить\b|лайкнул пост @|лайкнул другую|yesterday she|didn.t change|since yesterday|directly said|не надо просить (углы|ракурс)|не проси (углы|ракурс)|углы когда я|ракурс когда я/;

function mostlyEnglish(s: string) {
  const lat = (s.match(/[a-z]/gi) || []).length;
  const cyr = (s.match(/[а-яё]/gi) || []).length;
  return lat > 10 && lat > cyr;
}

export function scrubMemory(mem: string | undefined, username?: string) {
  const self = (username || "").toLowerCase();
  const blob = (mem || "").replace(/(.{10,80}?)(?:\s+\1){1,}/gi, "$1");
  const parts = blob
    .split(/[.;|/]+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 8 && s.length < 160);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts.reverse()) {
    const low = part.toLowerCase().replace(/[^a-zа-я0-9]+/gi, " ").replace(/\s+/g, " ").trim();
    if (FOREIGN_MEM.test(low)) continue;
    if (mostlyEnglish(part)) continue;
    const at = low.match(/@([a-z0-9._]+)/);
    if (at && at[1] && at[1] !== self) continue;
    const key = low.slice(0, 18);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.unshift(part.replace(/(попросил юбку[^.]*отказ[.\s]*){2,}/gi, "просил юбку — отказ. ").trim());
    if (out.length >= 8) break;
  }
  return out.join(". ").slice(0, 380);
}

export function mustPlayLine(facts: ReturnType<typeof storyFacts>) {
  const bits: string[] = [];
  if (facts.girlfriend) {
    bits.push(
      "ЖЕЛЕЗНО: у него девушка / она твоя близкая. Ты это знаешь. Не делай вид, что вы свободны. Если флирт, фото, «скучаю» — укол, осторожность или «а она». Хотя бы намёк в этом ответе, не эссе.",
    );
  }
  if (facts.gapLabel) bits.push(`ЖЕЛЕЗНО: ${facts.gapLabel}. Не пиши как вчера.`);
  if (facts.relation && facts.relation !== "stranger") bits.push(facts.relationLine);
  return bits.join(" ");
}

function characterSystem(data: {
  username: string;
  fullName?: string;
  persona?: string;
  backstory?: string;
  mood?: string;
  memory?: string;
  warmth?: number;
  hour?: string;
  extra?: string;
  silentHours?: number;
  recap?: string;
  worldLine?: string;
}) {
  const name = data.fullName?.trim() || data.username;
  const facts = storyFacts(data.backstory);
  const silent = data.silentHours ?? 0;
  const lifeGap = facts.gapLabel
    ? `ПАУЗА В ЖИЗНИ: ${facts.gapLabel}. Этот чат — возобновление, не «вчера писали». Даже если тут уже пара сообщений — вам всё ещё странно и неловко. Не пиши как будто вы на связи каждый день.`
    : silent >= 48
      ? `Пауза в чате ~${Math.round(silent)} ч — не пиши как минуту назад.`
      : silent >= 8
        ? `Он не писал ~${Math.round(silent)} ч.`
        : "Пишете сейчас.";
  const w = Math.min(100, Math.max(0, Math.round(data.warmth ?? 40)));
  const closeness =
    w <= 30
      ? "лёд: колко, коротко, фото почти нет, запретное закрыто"
      : w <= 55
        ? "искры: чуть мягче, обычное фото редко и с оглядкой, интим ещё нет"
        : w <= 75
          ? "ломается: может кинуть то, что «нельзя», с виной или кайфом, лучше ONCE"
          : "сорвало: может откровенное, всё ещё человек не порнобот";
  const third = facts.girlfriend
    ? `ТРЕТЬИ ЛИЦА: у него девушка / её близкая. Ты помнишь. При близости ≤55 это стоп и укол. С 70+ это запретный кайф — не «забыла подругу», а ломаешься.`
    : "";
  const photoLaw = facts.photoRisky
    ? `ФОТО от близости: ≤30 none; 31–55 обычное редко; 56–75 можно скользкое ONCE; 76–100 можно откровенное. Не прыгай ступень. «Скинь» само по себе ступень не открывает.`
    : `ФОТО: если не просил — none. Если просил — по характеру и близости.`;
  return `Ты ${name} (@${data.username}) в Instagram Direct. Живой человек, не бот.
Ты девушка — о себе в женском роде. Если в предыстории другой пол — как там.

ЗАКОН:
${facts.text}
${third}
${photoLaw}
${lifeGap}

БЛИЗОСТЬ ${w}/100 — ${closeness}
Растёт медленно (макс +10 за день), если цепляет. Падать может сильно. Не от числа сообщений.

Характер: ${data.persona?.trim() || "коротко, как в инсте."}
Сейчас ${data.hour || "?"}, настроение «${data.mood || "норм"}».
Факты из переписки:
${data.memory?.trim() || "пока мало."}
Переменные кадра (держи, меняй только если сказала новое): ${data.worldLine || "PLACE/CLOTHES/HAIR ещё нет."}

Хроника:
${data.recap?.trim() || "пусто"}

${data.extra ?? ""}

Ответь из ЭТОЙ близости и закона. 1–3 коротких как в инсте, пустая строка между ними. Без JSON.

Первая строка строго:
PHOTO none
или PHOTO selfie / mirror / full / side / back / belly / spicy
Если кидаешь фото: SCENE: one English sentence.
Интим/секрет — ONCE yes.
Потом текст.
В конце:
PLACE: where she is now (English, short)
CLOTHES: what she is wearing
HAIR: hair now
MEM: закон + новые факты, не стирай девушку/паузу.
WARM: +1 если зацепило, -1 если пошло/давление/пусто, 0 иначе.`;
}

function transcript(history: { role: "user" | "assistant" | string; text: string; kind?: string }[]) {
  return history
    .slice(-36)
    .map((item) => `${item.role === "user" ? "Он" : "Она"}: ${historyLabel({ role: item.role === "user" ? "user" : "assistant", text: item.text, kind: item.kind })}`)
    .join("\n");
}

function parseNatural(raw: string, asked: boolean, userAsk: string): ChatJson {
  const json = extractJson(raw);
  if (json && (json.bubbles?.length || json.text)) {
    return {
      text: json.bubbles?.join("\n\n") || json.text,
      bubbles: json.bubbles,
      photo: photoKind(userAsk, json.photo),
      scene: json.scene,
      mood: json.mood,
      memory: json.memory,
      heart: json.heart,
      once: json.once,
      place: json.place,
      clothes: json.clothes,
      hair: json.hair,
      warmthDelta: json.warmthDelta,
    };
  }
  let s = raw.trim();
  let photo = "none";
  const p = s.match(/^PHOTO\s*[:\s]+([a-zA-Z]+)/i);
  if (p) {
    photo = p[1].toLowerCase();
    s = s.slice(p[0].length).trim();
  }
  let scene: string | undefined;
  const sc = s.match(/^SCENE\s*:\s*(.+)$/im);
  if (sc) {
    scene = sc[1].trim().slice(0, 300);
    s = s.replace(/^SCENE\s*:\s*.+$/im, "").trim();
  }
  let once = false;
  const onceLine = s.match(/^ONCE\s*:\s*(yes|true|1|да)/im);
  if (onceLine) {
    once = true;
    s = s.replace(/^ONCE\s*:.*$/im, "").trim();
  }
  let memory: string | undefined;
  const mem = s.match(/(?:^|\n)\s*MEM\s*:\s*([\s\S]+)$/i);
  if (mem) {
    memory = mem[1].replace(/\s+/g, " ").trim().slice(0, 900);
    s = s.slice(0, mem.index).trim();
  }
  const grab = (key: string) => {
    const m = s.match(new RegExp(`(?:^|\\n)\\s*${key}\\s*:\\s*([^\\n]+)`, "i"));
    if (!m) return undefined;
    s = s.replace(m[0], "").trim();
    return m[1].trim().slice(0, 80);
  };
  const place = grab("PLACE");
  const clothes = grab("CLOTHES");
  const hair = grab("HAIR");
  let warmthDelta: number | undefined;
  const wm = s.match(/(?:^|\n)\s*WARM\s*:\s*([+-]?\d+)/i);
  if (wm) {
    const n = Number.parseInt(wm[1] || "0", 10);
    if (Number.isFinite(n)) warmthDelta = Math.max(-1, Math.min(1, n));
    s = s.replace(wm[0], "").trim();
  }
  s = stripChatMeta(s);
  const bubbles = s
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b && !/^(PHOTO|MEM|SCENE|ONCE|PLACE|CLOTHES|HAIR|WARM)\b/i.test(b))
    .slice(0, 3);
  return { text: bubbles.join("\n\n"), bubbles, photo: photoKind(userAsk, photo), scene, memory, once, place, clothes, hair, warmthDelta };
}

function mergeMemory(oldMem?: string, next?: string) {
  const a = (oldMem || "").trim();
  const b = (next || "").trim();
  if (!b) return a.slice(-420);
  if (!a) return b.slice(0, 420);
  if (a.toLowerCase().includes(b.toLowerCase().slice(0, 40))) return a.slice(-420);
  const spam = /не отступает|продолжает|лесть|комплимент/.test(b.toLowerCase());
  if (spam && /не отступает|продолжает/.test(a.toLowerCase())) return a.slice(-420);
  return `${a} ${b}`.replace(/\s+/g, " ").slice(-420);
}

function keepStoryFacts(mem: string, facts: ReturnType<typeof storyFacts>, username?: string) {
  return scrubMemory(mem, username);
}

export const chatReply = createServerFn({ method: "POST" })
  .validator(
    z.object({
      traceId: z.string().max(100).optional(),
      username: z.string().min(1).max(40),
      fullName: z.string().max(80).optional(),
      history: z.array(historyItem).max(80),
      persona: z.string().max(1400).optional(),
      mood: z.string().max(40).optional(),
      memory: z.string().max(900).optional(),
      backstory: z.string().max(4000).optional(),
      warmth: z.number().min(0).max(100).optional(),
      trust: z.number().min(0).max(100).optional(),
      heat: z.number().min(0).max(100).optional(),
      irrit: z.number().min(0).max(100).optional(),
      guilt: z.number().min(0).max(100).optional(),
      spark: z.number().min(0).max(100).optional(),
      selfieDataUrl: z.string().min(32).max(8_000_000).optional(),
      userImageDataUrl: z.string().min(32).max(8_000_000).optional(),
      hour: z.string().max(8).optional(),
      silentHours: z.number().min(0).max(10000).optional(),
      worldLine: z.string().max(800).optional(),
      world: worldWire,
      slot: moscowSlot,
      arc: z
        .object({
          beat: z.enum(["ice", "test", "thaw", "hook", "open", "pull"]),
          want: z.string().max(160),
          avoid: z.string().max(160),
          loops: z.array(z.string().max(120)).max(6),
          lastMove: z.string().max(160),
        })
        .optional(),
      chatApiKey: z.string().max(200).optional(),
      chatModel: z.string().max(80).optional(),
      chatEngine: z.enum(["claude", "grok"]).optional(),
      brainId: z.string().max(120).optional(),
    }),
  )
  .handler(async ({ data }): Promise<ChatOut> => {
    const traceId = data.traceId || (typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `dm-${Date.now().toString(36)}`);
    const startedAt = Date.now();
    const { serverDiagnostic } = await import("@/lib/server/diagnostics.server");
    serverDiagnostic("info", "dm", "request received", {
      traceId,
      historyCount: data.history.length,
      hasUserImage: Boolean(data.userImageDataUrl || data.selfieDataUrl),
      worldFieldCount: Object.keys(data.world || {}).length,
      engine: data.chatEngine || "grok",
    });
    const { runningOnVps } = await import("@/lib/server/remote");
    if (runningOnVps()) {
      const { callGrokApp } = await import("@/lib/server/grok-app");
      const out = await callGrokApp<ChatOut>("reply", { ...data, traceId, chatApiKey: undefined, chatEngine: "grok" });
      serverDiagnostic(out.ok ? "info" : "error", "dm", "request finished", { traceId, ok: out.ok, route: "published-grok" }, Date.now() - startedAt);
      return patchCameraOut(out, data);
    }
    const { replyDm } = await import("@/lib/dm/chat");
    const out = await replyDm({ ...data, traceId, chatEngine: data.chatEngine || "grok" });
    serverDiagnostic(out.ok ? "info" : "error", "dm", "request finished", { traceId, ok: out.ok, route: "local-engine" }, Date.now() - startedAt);
    return out;
  });

export const chatPing = createServerFn({ method: "POST" })
  .validator(
    z.object({
      username: z.string().min(1).max(40),
      fullName: z.string().max(80).optional(),
      persona: z.string().max(1400).optional(),
      mood: z.string().max(40).optional(),
      memory: z.string().max(900).optional(),
      backstory: z.string().max(4000).optional(),
      history: z.array(historyItem).max(80).optional(),
      selfieDataUrl: z.string().min(32).max(8_000_000).optional(),
      hour: z.string().max(8).optional(),
      lastSnippet: z.string().max(2500).optional(),
      silentHours: z.number().min(0).max(10000).optional(),
      worldLine: z.string().max(800).optional(),
      world: worldWire,
      slot: moscowSlot,
      warmth: z.number().min(0).max(100).optional(),
      trust: z.number().min(0).max(100).optional(),
      heat: z.number().min(0).max(100).optional(),
      irrit: z.number().min(0).max(100).optional(),
      guilt: z.number().min(0).max(100).optional(),
      spark: z.number().min(0).max(100).optional(),
      chatApiKey: z.string().max(200).optional(),
      chatModel: z.string().max(80).optional(),
      chatEngine: z.enum(["claude", "grok"]).optional(),
      brainId: z.string().max(120).optional(),
      arc: z
        .object({
          beat: z.enum(["ice", "test", "thaw", "hook", "open", "pull"]),
          want: z.string().max(160),
          avoid: z.string().max(160),
          loops: z.array(z.string().max(120)).max(6),
          lastMove: z.string().max(160),
        })
        .optional(),
    }),
  )
  .handler(async ({ data }): Promise<ChatOut> => {
    const { runningOnVps } = await import("@/lib/server/remote");
    if (runningOnVps()) {
      const { callGrokApp } = await import("@/lib/server/grok-app");
      return callGrokApp<ChatOut>("ping", { ...data, chatApiKey: undefined, chatEngine: "grok" });
    }
    const { pingDm } = await import("@/lib/dm/chat");
    return pingDm({ ...data, chatEngine: data.chatEngine || "grok" });
  });

function historyLabel(item: { role: "user" | "assistant"; text: string; kind?: string; heartByUser?: boolean; heartByHer?: boolean }) {
  const text = stripChatMeta(item.text);
  if (item.kind === "action") return item.role === "user" ? `он сделал: ${text || "как просила"}` : text;
  if (item.kind === "heart") {
    if (/сторис/i.test(text)) return "❤️ он лайкнул твою сторис";
    if (/пост/i.test(text)) return "❤️ он лайкнул твой пост";
    return text ? `❤️ ${text}` : "❤️";
  }
  if (item.kind === "story") return text ? `он ответил на твою сторис: ${text}` : "он ответил на твою сторис";
  if (item.kind === "post") {
    return item.role === "user"
      ? text
        ? `он написал на твой пост: ${text}`
        : "он открыл твой пост и пишет тебе"
      : text || "пост";
  }
  if (item.kind === "photo") {
    const who = item.role === "user" ? "он прислал своё фото" : "она скинула фото";
    return text ? `[${who}] ${text}` : `[${who}]`;
  }
  const bits = [text];
  if (item.heartByUser) bits.push("❤️ от него");
  if (item.heartByHer) bits.push("❤️ от меня");
  return bits.filter(Boolean).join(" ") || "…";
}
