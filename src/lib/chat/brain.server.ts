import { parseArc, type ChatArc } from "./arc";
import { asBond, beatFromBond, photoAllowed, photoPolicyLine, stageFrom, voiceFor } from "./bond";
import { dayLine, dayNow, isHeatNight } from "./day";
import { looksLikeClothesAsk, looksLikeDescribeAsk, looksLikePhotoAsk, looksLikeCatalogAsk, looksLikeRefuse, storyFacts, stripChatMeta, stripChatTic, scrubMemory } from "./functions";
import { turnPolicy } from "./policy";
import {
  clothesFromBlob,
  clothesToRu,
  isAtWorkNow,
  isNowAtWorkLine,
  isWeekendAt,
  isWorkPlace,
  looksLikeWorkStatus,
  preferClothes,
  sceneRule,
  specificClothes,
  worldFromText,
  type ChatWorld,
} from "./world";

export type BrainTurn = {
  role: "user" | "assistant";
  text: string;
  kind?: "text" | "photo" | "story" | "post" | "heart" | "action" | "circle";
  at?: number;
  heartByUser?: boolean;
  heartByHer?: boolean;
};

export type BrainInput = {
  username: string;
  fullName?: string;
  history?: BrainTurn[];
  persona?: string;
  mood?: string;
  memory?: string;
  backstory?: string;
  warmth?: number;
  trust?: number;
  heat?: number;
  irrit?: number;
  guilt?: number;
  spark?: number;
  userImageDataUrl?: string;
  hour?: string;
  silentHours?: number;
  worldLine?: string;
  lastSnippet?: string;
  arc?: ChatArc;
  world?: ChatWorld;
  slot?: "sleep" | "morning" | "work" | "weekend" | "evening" | "night";
  chatApiKey?: string;
  chatModel?: string;
  chatEngine?: "claude" | "grok";
  brainId?: string;
};

export type BrainOk = {
  ok: true;
  text: string;
  bubbles: string[];
  photoKind: string;
  scene: string;
  once: boolean;
  mood?: string;
  memory?: string;
  reactHeart?: boolean;
  place?: string;
  clothes?: string;
  hair?: string;
  warmthDelta: number;
  arc: ChatArc;
  brainId?: string;
};

export type BrainFail = { ok: false; error: string };

const PHOTO_KINDS = new Set(["none", "selfie", "mirror", "full", "side", "back", "belly", "spicy", "pov", "gallery", "roll", "feed", "circle"]);

export class CharacterBrain {
  constructor(
    private readonly opts: { temperature?: number; json?: boolean } = {},
  ) {}

  async reply(input: BrainInput): Promise<BrainOk | BrainFail> {
    const facts = storyFacts(input.backstory);
    const bond = bondOf(input);
    const last = (input.history ?? []).at(-1);
    const asked =
      last?.role === "user" && last.kind !== "heart"
        ? looksLikePhotoAsk(last.text || "")
        : false;
    const askedClothes = last?.role === "user" ? looksLikeClothesAsk(last.text || "") : false;
    const run = (live: BrainInput) => {
      const system = this.system(live, facts, bond, asked, last);
      const history = this.history(live);
      const policy = turnPolicy({
        bond,
        girlfriend: Boolean(facts.girlfriend),
        text: last?.text || "",
        namedClothes: Boolean(specificClothes(live.world?.clothes)),
        busy: isAtWorkNow(live.world?.place),
        night: isHeatNight(),
      });
      const close = sceneRule(live.world, Date.now(), false, askedClothes, last?.role === "user" ? last.text || "" : "", {
        hot: policy.tone === "hot" || policy.tone === "flirt",
      });
      return completeChat({ ...live, brainId: undefined }, [{ role: "system", content: system }, ...history, { role: "system", content: close }], tempFor(bond, Boolean(facts.girlfriend)), true);
    };
    const out = await run(input);
    if (!out.ok) return out;
    const parsed = this.parse(out.content, facts, bond, asked, input.memory, input.arc, last, input.username, input.history, input.world, askedClothes);
    if (!parsed.ok) return parsed;
    return { ...parsed, brainId: out.id || input.brainId };
  }

  async ping(input: BrainInput): Promise<BrainOk | BrainFail> {
    const facts = storyFacts(input.backstory);
    const bond = bondOf(input);
    const run = (live: BrainInput) => {
      const system = this.system(live, facts, bond, false, undefined, true);
      const history = this.history(live);
      const close = sceneRule(live.world, Date.now(), true, false, "", {
        hot: stageFrom(bond, Boolean(facts.girlfriend)) === "fall" || stageFrom(bond, Boolean(facts.girlfriend)) === "secret",
      });
      return completeChat(
        { ...live, brainId: undefined },
        [
          { role: "system", content: system },
          ...history,
          { role: "user", content: "ты пишешь первая. продолжи ЭТУ жизнь в текущем часу и одежде." },
          { role: "system", content: close },
        ],
        tempFor(bond, Boolean(facts.girlfriend)),
        true,
      );
    };
    const out = await run(input);
    if (!out.ok) return out;
    const parsed = this.parse(out.content, facts, bond, false, input.memory, input.arc, undefined, input.username, input.history, input.world, false);
    if (!parsed.ok) return parsed;
    if (!dayNow().canPing) return { ...parsed, photoKind: "none", scene: "", once: false };
    return parsed;
  }

  private system(
    input: BrainInput,
    facts: ReturnType<typeof storyFacts>,
    bond: ReturnType<typeof asBond>,
    asked: boolean,
    last?: BrainTurn,
    ping = false,
  ) {
    const name = input.fullName?.trim() || input.username;
    const policy = turnPolicy({
      bond,
      girlfriend: Boolean(facts.girlfriend),
      text: last?.text || "",
      namedClothes: Boolean(specificClothes(input.world?.clothes)),
      busy: isAtWorkNow(input.world?.place),
      night: isHeatNight(),
    });

    const event =
      last?.kind === "action"
        ? `Он СДЕЛАЛ в мире: «${last.text}». Это ФАКТ, уже произошло. Не спрашивай «правда ли». Реагируй по стадии: шок / проверка / тепло / вина. Можно не поверить до конца, но факт есть.`
        : last?.kind === "heart" || (last?.kind === "post" && !(last.text || "").trim())
        ? "Он лайкнул ТВОЙ пост в ленте. Кадр ты видишь. Это твоя фотка, не чужая. Не спрашивай «какое фото» и не пиши «зачем сердечко». Реагируй на кадр или на то, что он лайкает, будучи несвободным. Можно сухо, можно про кадр, можно промолчать тоном. Без лекции."
        : last?.kind === "story"
          ? "Он ответил на твою сторис. Картинка — это ТЫ."
          : last?.kind === "post"
            ? "Он пишет под твоим постом. Картинка — твой пост."
            : ping
              ? "Пишешь первая. Голос и длина — СТРОГО по политике выше. Развивай нить чата, не «как дела»."
              : `Последнее его: «${(last?.text || "").slice(0, 120)}». Отвечай на ЭТО. Тон и фото — только из ПОЛИТИКИ КОДА.`;

    const girlfriendHits = (input.history ?? [])
      .filter((h) => h.role === "assistant")
      .slice(-8)
      .filter((h) => /оля|катя|девушк|подруг/.test((h.text || "").toLowerCase())).length;
    const taboo =
      !facts.girlfriend
        ? ""
        : girlfriendHits >= 2
          ? "Про его девушку ты УЖЕ сказала. Не повторяй имя и «у тебя девушка». Либо другой ход, либо короче, либо закрой тему молчанием. Не лекция."
          : looksLikeCatalogAsk(last?.text || "")
            ? "У него девушка / она тебе близкая. Укол один раз, не проповедь. Интим по давлению — нет."
            : asked
              ? "У него девушка — фон, не повод посылать. Обычное фото текущего лука можно."
            : "Фон: у него девушка. Не поминай каждый ход.";

    const gap = facts.gapLabel
      ? `${facts.gapLabel}. Это возобновление, не вчерашний диалог.`
      : (input.silentHours ?? 0) >= 48
        ? `Пауза в чате ~${Math.round(input.silentHours || 0)} ч.`
        : "";

    return `Ты ${name} (@${input.username}). Это личка, не сценарий. Пиши как живой человек с телефона: на его последнюю реплику, своими словами, обычно 1–2 сообщения. Можно с маленькой буквы. Без эссе, без четвёртой стены, без зачитывания правил.
Характер: ${input.persona?.trim() || "как в инсте."}

${facts.text}
${facts.relationLine}
${taboo}
${gap}

${voiceFor(bond, Boolean(facts.girlfriend), ping, facts.relation)}
${policy.line}
${photoPolicyLine(bond, Boolean(facts.girlfriend))}

${event}

Не пиши «ты отправила» про своё фото. Память (mem) — короткая заметка о нём, не инструкция себе.

Ответ строго JSON:
{"bubbles":["..."],"photo":"none","scene":"","place":"","clothes":"","hair":"","mood":"","mem":"","heart":false}
bubbles — то, что она реально отправила бы. place/clothes/hair по-английски.

Где она сейчас (важнее старых фраз про работу):
${input.worldLine || dayLine()}
Выходной, вечер и ночь — она не на смене. Одежда из карточки — то, что на ней, пока сама не переоделась.`;
  }

  private history(input: BrainInput) {
    const merged: BrainTurn[] = [];
    for (const item of (input.history ?? []).slice(-48)) {
      const line = naturalLine(item);
      if (!line.trim() || line === "…") continue;
      const prev = merged.at(-1);
      if (prev && prev.role === item.role) {
        prev.text = `${prev.text}\n${line}`.trim().slice(0, 1600);
        continue;
      }
      merged.push({ ...item, text: line });
    }
    return merged.map((item, i, arr) => {
      const last = i === arr.length - 1;
      if (last && item.role === "user" && input.userImageDataUrl) {
        return {
          role: "user" as const,
          content: [
            { type: "text", text: item.text },
            { type: "image_url", image_url: { url: input.userImageDataUrl } },
          ],
        };
      }
      return { role: item.role, content: item.text };
    });
  }

  private parse(
    raw: string,
    facts: ReturnType<typeof storyFacts>,
    bond: ReturnType<typeof asBond>,
    asked: boolean,
    oldMem?: string,
    prevArc?: ChatArc,
    last?: BrainTurn,
    username?: string,
    history?: BrainTurn[],
    world?: ChatWorld,
    askedClothes = false,
  ): BrainOk | BrainFail {
    const json = readJson(raw);
    const stage = stageFrom(bond, Boolean(facts.girlfriend));
    let bubbles = cleanBubbles(json?.bubbles, json?.text || raw, stage);
    const recent = (history ?? [])
      .filter((h) => h.role === "assistant")
      .slice(-4)
      .map((h) => h.text || "");
    bubbles = dropEcho(bubbles, recent);
    if (!isAtWorkNow(world?.place)) {
      bubbles = bubbles.filter((b) => !looksLikeWorkStatus(b) && !isNowAtWorkLine(b));
    }
    if (askedClothes && !clothesFromBlob(bubbles.join(" "))) {
      const ru = clothesToRu(specificClothes(json?.clothes) || specificClothes(world?.clothes));
      if (ru) bubbles.push(ru);
    }
    if (!bubbles.length) bubbles.push(fallbackLine(stage, last?.text || "", asked, world));
    const namedClothes = Boolean(
      specificClothes(world?.clothes) || clothesFromBlob((history ?? []).filter((h) => h.role === "assistant").slice(-4).map((h) => h.text || "").join("\n")),
    );
    const alreadySent = (history ?? []).filter((h) => h.role === "assistant" && (h.kind === "photo" || h.kind === "circle")).slice(-1).length > 0;
    const policy = turnPolicy({
      bond,
      girlfriend: Boolean(facts.girlfriend),
      text: last?.text || "",
      namedClothes,
      busy: isAtWorkNow(world?.place),
      night: isHeatNight(),
      alreadySent,
    });
    const forceLook = policy.force;
    bubbles = bubbles.filter((b) => !/^\s*ты (отправил|скинул|кинул)/i.test(b));
    let refused = looksLikeRefuse(bubbles.join(" ")) && !forceLook;
    if (forceLook) {
      const kept = bubbles.filter((b) => !looksLikeRefuse(b) && !/не,? не могу|сильно устала|иди уже|поздно уже|не хочу|не надо$/.test(b.toLowerCase()));
      bubbles = kept.length ? kept : ["ну держи"];
      refused = false;
    }
    const agreed = looksLikeSend(bubbles.join(" ")) && !refused;
    let photo = normalizePhoto(json?.photo);
    if (policy.photo === "none") photo = "none";
    if (forceLook) photo = policy.photo;
    if (refused && !forceLook) photo = "none";
    photo = photoAllowed(bond, forceLook ? policy.photo : photo, Boolean(facts.girlfriend || facts.photoRisky));
    if (forceLook) photo = policy.photo;
    if (!dayNow().canPhoto && !isHeatNight() && !forceLook) photo = "none";
    if (agreed && photo === "none" && policy.photo !== "none" && bond.irrit < 45) photo = policy.photo;
    const scene = englishOnly(json?.scene || "").slice(0, 220);
    const lastMove = lastUserMove(last);
    const want = nextWant(json?.want || prevArc?.want || "", lastMove, prevArc?.want || "", stage);
    const arc = parseArc(
      {
        beat: beatFromBond(bond),
        want,
        avoid: json?.avoid,
        loops: sanitizeLoops(json?.loops?.length ? json.loops : prevArc?.loops, lastMove),
        lastMove,
      },
      bond.warmth,
    );
    const fromSpeech = worldFromBubbles(bubbles.join("\n"));
    const clothes = preferClothes(fromSpeech.clothes, preferClothes(json?.clothes, world?.clothes));
    const night = (() => {
      const s = dayNow().slot;
      return s === "evening" || s === "night" || s === "sleep";
    })();
    const modelPlace = cleanField(json?.place);
    let place =
      fromSpeech.place ||
      (isWorkPlace(modelPlace) && !isWorkPlace(world?.place) && night ? world?.place : modelPlace) ||
      world?.place;
    if (isWeekendAt() && isWorkPlace(place)) {
      place = world?.place && !isWorkPlace(world.place) ? world.place : "at home, apartment, weekend daytime";
    }
    let mood = (json?.mood || "").slice(0, 40) || undefined;
    if (mood && /irritat|зл|бесит|annoyed/.test(mood) && bond.warmth >= 70 && bond.irrit < 40) mood = undefined;
    return {
      ok: true,
      text: bubbles.join("\n\n"),
      bubbles,
      photoKind: photo,
      scene: photo === "none" ? "" : scene || "candid vertical adult phone photo of her, no text on image",
      once: Boolean(json?.once) || photo === "spicy" || (photo === "pov" && isHeatNight()),
      mood,
      memory: scrubMemory(mergeMem(oldMem, json?.mem, username), username),
      reactHeart: Boolean(json?.heart),
      place,
      clothes,
      hair: fromSpeech.hair || cleanField(json?.hair) || world?.hair,
      warmthDelta: clamp(Number(json?.warm) || 0, -1, 1),
      arc,
    };
  }
}

export async function replyWithBrain(input: BrainInput) {
  return new CharacterBrain().reply(input);
}

export async function pingWithBrain(input: BrainInput) {
  return new CharacterBrain().ping(input);
}

function bondOf(input: BrainInput) {
  return asBond(
    {
      warmth: input.warmth,
      trust: input.trust,
      heat: input.heat,
      irrit: input.irrit,
      guilt: input.guilt,
      spark: input.spark,
    },
    input.warmth ?? 40,
  );
}

function tempFor(bond: ReturnType<typeof asBond>, girlfriend: boolean) {
  const s = stageFrom(bond, girlfriend);
  if (s === "ice" || s === "snap") return 0.55;
  if (s === "test") return 0.68;
  if (s === "person") return 0.76;
  if (s === "crack") return 0.82;
  if (s === "secret") return 0.95;
  return 1;
}

function naturalLine(item: BrainTurn) {
  const text = stripChatMeta(item.text || "").trim();
  if (item.kind === "action") return text ? `он сделал: ${text}` : "он сделал то, что ты просила";
  if (item.kind === "heart") return "он лайкнул сообщение / твой пост";
  if (item.kind === "circle") return text || (item.role === "user" ? "он прислал кружок" : "ты отправила кружок");
  if (item.kind === "photo") return text || (item.role === "user" ? "он прислал фото" : "ты отправила фото");
  if (item.kind === "story") return text || "он ответил на сторис";
  if (item.kind === "post") return text || "он лайкнул / ответил на твой пост. кадр видишь.";
  return text;
}

function looksLikeSend(raw: string) {
  const t = raw.toLowerCase();
  return /\b(лови|держи|на тебе|вот она|скинула|кинула|на\s*фото)\b/.test(t);
}

function inferredLoops(history: BrainTurn[] | undefined, arc?: ChatArc) {
  return sanitizeLoops(arc?.loops, lastUserMove((history ?? []).filter((h) => h.role === "user").at(-1)));
}

function lastUserMove(last?: BrainTurn) {
  if (!last || last.role !== "user") return "";
  if (last.kind === "heart" || last.kind === "post") return "лайкнул пост";
  if (last.kind === "action") return `сделал: ${(last.text || "").trim().slice(0, 80)}`;
  if (last.kind === "story") return (last.text || "ответил на сторис").trim().slice(0, 120);
  return stripChatMeta(last.text || "").trim().slice(0, 120);
}

function nextWant(raw: string, lastMove: string, prevWant: string, stage?: string) {
  const t = lastMove.toLowerCase();
  const open = stage === "fall" || stage === "secret" || stage === "crack";
  if (looksLikeCatalogAsk(lastMove)) {
    return open ? "он просит голое. фото нет, в тексте можно дразнить." : "он просит каталог. отказ, не лекция.";
  }
  if (looksLikeDescribeAsk(lastMove) || /жоп|попк|сиськ|грудь|дроч|соск/.test(t)) {
    return open ? "" : "он про тело. коротко по стадии, не лекция.";
  }
  if (/(скинь|покажи|надень|можно|хочу|ещё|выше).{0,24}(ножк|юбк|фигур|футболк)/.test(t)) {
    return "он просит кадр/одежду. не переспрашивать. по стадии: отказ, укол или одно движение.";
  }
  const retreated = /отстаю|прости|жду|удачи|как ты|как работа|как смена|что сейчас делаешь|не буду|хватит/.test(t);
  if (retreated && /закрыть|зачем пишет|понять к чему|не дать ничего/.test(`${raw} ${prevWant}`)) {
    return "проверить, отстал ли; можно про день";
  }
  if (/нить/.test((raw || prevWant || "").toLowerCase())) return "";
  return (raw || prevWant || "").slice(0, 160);
}

function sanitizeLoops(loops: string[] | undefined, lastMove: string) {
  const push = lastMove.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of loops ?? []) {
    const t = line.trim();
    if (!t) continue;
    if (/^(нить|ход|тема)$/i.test(t)) continue;
    if (/да или нет|что решила|зачем пишет|можем или нет|а чего именно/i.test(t)) continue;
    if (push && t.toLowerCase().slice(0, 24) === push.slice(0, 24)) continue;
    const key = t.toLowerCase().slice(0, 36);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t.slice(0, 120));
    if (out.length >= 4) break;
  }
  return out;
}

function normalizePhoto(raw?: string) {
  const v = (raw || "none").trim().toLowerCase();
  return PHOTO_KINDS.has(v) ? v : "none";
}

function cleanBubbles(bubbles: string[] | undefined, fallback: string, stage?: string) {
  const src = bubbles?.length ? bubbles : stripChatMeta(fallback).split(/\n{2,}/);
  const max = stage === "ice" || stage === "snap" ? 1 : stage === "fall" || stage === "secret" ? 3 : 2;
  return src
    .map((b) =>
      stripChatTic(
        stripChatMeta(b)
          .replace(/^(ты|он)\s*:\s*/i, "")
          .replace(/^["«»“”']+|["«»“”']+$/g, "")
          .replace(/\b(лайк от него|он лайкнул( тв(ою|ой) (пост|сторис))?|PHOTO none|MEM:)\b/gi, ""),
      ),
    )
    .filter((b) => b && !/^(PHOTO|MEM|SCENE|WARM|PLACE|CLOTHES|HAIR)\b/i.test(b))
    .slice(0, max);
}

function normLine(s: string) {
  return s
    .toLowerCase()
    .replace(/[«»"'“”]/g, "")
    .replace(/[.,!?…]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dropEcho(bubbles: string[], recent: string[]) {
  const norms = recent.map(normLine).filter(Boolean);
  return bubbles.filter((b) => {
    const n = normLine(b);
    if (!n) return false;
    if (/а чего именно|и дальше чего|против чего/.test(n) && norms.some((r) => /а чего именно|и дальше чего|против чего/.test(r))) {
      return false;
    }
    return !norms.some((r) => r === n || (n.length >= 8 && r.includes(n)) || (r.length >= 8 && n.includes(r)));
  });
}

function fallbackLine(stage: string, lastText: string, asked: boolean, world?: ChatWorld) {
  if (looksLikeClothesAsk(lastText)) {
    return clothesToRu(world?.clothes) || "как обычно, ничего особенного";
  }
  const body = /попк|попку|\bпопу\b|ножк|юбк|фигур|грудь|жоп|сиськ|дроч|опиши/.test(lastText.toLowerCase());
  if (asked || body) {
    if (stage === "ice" || stage === "test" || stage === "snap") return "не надо";
    if (stage === "person") return "ты серьёзно";
    if (stage === "fall" || stage === "secret") return "ну и";
    return "не в этом тоне";
  }
  if (!isAtWorkNow(world?.place)) {
    const s = dayNow().slot;
    if (s === "sleep" || s === "night") return "сплю уже почти";
    if (s === "evening" || s === "weekend") return "дома уже";
  }
  if (stage === "ice") return "ну";
  return "ладно";
}

function cleanField(s?: string) {
  const t = (s || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!t || /^(none|unknown|не сказано|-|—)$/i.test(t)) return undefined;
  return t;
}

function worldFromBubbles(text: string) {
  const w = worldFromText(text);
  return { place: w.place, clothes: w.clothes, hair: w.hair };
}

function englishOnly(s: string) {
  return s.replace(/[\u0400-\u04FF]/g, " ").replace(/\s+/g, " ").trim();
}

type Parsed = {
  bubbles?: string[];
  text?: string;
  photo?: string;
  scene?: string;
  once?: boolean;
  heart?: boolean;
  place?: string;
  clothes?: string;
  hair?: string;
  mem?: string;
  mood?: string;
  warm?: number;
  intent?: string;
  beat?: string;
  want?: string;
  avoid?: string;
  loops?: string[];
  lastMove?: string;
};

function readJson(raw: string): Parsed | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence?.[1] ?? raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
    const bubbles = Array.isArray(parsed.bubbles)
      ? parsed.bubbles.filter((b): b is string => typeof b === "string" && Boolean(b.trim()))
      : undefined;
    const text = typeof parsed.text === "string" ? parsed.text : typeof parsed.message === "string" ? parsed.message : "";
    return {
      bubbles,
      text,
      photo: typeof parsed.photo === "string" ? parsed.photo : "none",
      scene: typeof parsed.scene === "string" ? parsed.scene : "",
      once: parsed.once === true,
      heart: parsed.heart === true,
      place: typeof parsed.place === "string" ? parsed.place : "",
      clothes: typeof parsed.clothes === "string" ? parsed.clothes : "",
      hair: typeof parsed.hair === "string" ? parsed.hair : "",
      mem: typeof parsed.mem === "string" ? parsed.mem : typeof parsed.memory === "string" ? parsed.memory : "",
      mood: typeof parsed.mood === "string" ? parsed.mood : "",
      warm: typeof parsed.warm === "number" ? parsed.warm : 0,
      intent: typeof parsed.intent === "string" ? parsed.intent : "",
      beat: typeof parsed.beat === "string" ? parsed.beat : "",
      want: typeof parsed.want === "string" ? parsed.want : "",
      avoid: typeof parsed.avoid === "string" ? parsed.avoid : "",
      loops: Array.isArray(parsed.loops)
        ? parsed.loops.filter((b): b is string => typeof b === "string" && Boolean(b.trim()))
        : undefined,
      lastMove: typeof parsed.lastMove === "string" ? parsed.lastMove : "",
    };
  } catch {
    return null;
  }
}

function mergeMem(oldMem?: string, next?: string, username?: string) {
  const self = (username || "").toLowerCase();
  const blob = collapseDupes(`${oldMem || ""} ${next || ""}`);
  const parts = blob
    .split(/[.;|/]+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 8 && s.length < 160);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts.reverse()) {
    const low = part.toLowerCase().replace(/[^a-zа-я0-9]+/gi, " ").replace(/\s+/g, " ").trim();
    if (/не зависает в чате|телефон не в руках|раны:|слабые места:|спит \/|он писал в 0|на работе: короче|отвечает на вопрос, не одно|loops|нить|directly said|yesterday she/.test(low)) continue;
    const lat = (part.match(/[a-z]/gi) || []).length;
    const cyr = (part.match(/[а-яё]/gi) || []).length;
    if (lat > 10 && lat > cyr) continue;
    const at = low.match(/@([a-z0-9._]+)/);
    if (at && at[1] && at[1] !== self) continue;
    const key = low.slice(0, 18);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.unshift(part);
    if (out.length >= 6) break;
  }
  return out.join(". ").slice(0, 320);
}

function collapseDupes(raw: string) {
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/(.{10,80}?)(?:\s+\1){1,}/gi, "$1");
  return s;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

async function completeChat(input: BrainInput, messages: unknown[], temperature: number, json = false) {
  const routes = chatRoutes(input);
  if (!routes.length) return { ok: false as const, error: "Чат сейчас недоступен." };
  const t0 = Date.now();
  const { slog } = await import("@/lib/server/log.server");
  let last = "Чат не ответил.";
  for (const route of routes) {
    const out = await completeOnRoute(route, messages, temperature, json, input.brainId);
    if (out.ok) {
      slog("chat", "ok", { user: input.username, via: route.label, ms: Date.now() - t0, ping: !input.history?.length });
      return out;
    }
    last = out.error || last;
    slog("chat", "fail", { user: input.username, via: route.label, ms: Date.now() - t0, err: last });
    if (out.fatal && routes.indexOf(route) === routes.length - 1) return { ok: false as const, error: out.error };
    continue;
  }
  return { ok: false as const, error: last };
}

export async function runChatModel(input: BrainInput, messages: unknown[], temperature: number, json = true) {
  return completeChat(input, messages, temperature, json);
}

type ChatRoute = {
  key: string;
  url: string;
  models: string[];
  headers: Record<string, string>;
  label: string;
  mode: "chat" | "responses";
};

function chatRoutes(input: BrainInput): ChatRoute[] {
  const routes: ChatRoute[] = [];
  const open = (input.chatApiKey || "").trim();
  const grok: ChatRoute | null = (() => {
    const xai = typeof process === "undefined" ? "" : process.env.XAI_API_KEY || "";
    if (!xai) return null;
    return {
      key: xai,
      url: "https://api.x.ai/v1/chat/completions",
      models: ["grok-4-fast-non-reasoning", "grok-4.6", "grok-4.5", "grok-3"],
      label: "Grok",
      mode: "chat" as const,
      headers: {
        Authorization: `Bearer ${xai}`,
        "Content-Type": "application/json",
      },
    };
  })();
  const claude: ChatRoute | null = open
    ? {
        key: open,
        url: "https://openrouter.ai/api/v1/chat/completions",
        models: [(input.chatModel || "").trim() || "anthropic/claude-sonnet-4"],
        label: "OpenRouter",
        mode: "chat" as const,
        headers: {
          Authorization: `Bearer ${open}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://shtora.app",
          "X-Title": "Shtora",
        },
      }
    : null;
  if (input.chatEngine === "grok" || !open) {
    if (grok) routes.push(grok);
    if (open && claude) routes.push(claude);
  } else {
    if (claude) routes.push(claude);
    if (grok) routes.push(grok);
  }
  return routes;
}

async function completeOnRoute(
  route: ChatRoute,
  messages: unknown[],
  temperature: number,
  json: boolean,
  previousId?: string,
): Promise<{ ok: true; content: string; id?: string } | { ok: false; error: string; fatal?: boolean }> {
  if (route.mode === "responses") {
    return completeResponses(route, messages, temperature, previousId);
  }

  async function once(model: string, asJson: boolean) {
    const payload: Record<string, unknown> = {
      model,
      temperature,
      messages: route.label === "Grok" ? messages : cacheSystem(messages),
    };
    if (asJson) payload.response_format = { type: "json_object" };
    const res = await fetch(route.url, {
      method: "POST",
      headers: route.headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
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

  let res: Response | undefined;
  let parsed: Record<string, unknown> | null = null;
  for (const model of route.models) {
    ({ res, parsed } = await once(model, json));
    if (res.ok) break;
    const blocked = spendingLimit(parsed, res.status, route.label);
    if (blocked) {
      if (/слишком часто|подожди/i.test(blocked)) continue;
      return { ok: false, error: blocked, fatal: true };
    }
    if (res.status === 401) {
      return { ok: false, error: `${route.label}: ключ не принят. Проверь в настройках.`, fatal: true };
    }
    if (res.status === 429) continue;
    if (json) {
      ({ res, parsed } = await once(model, false));
      if (res.ok) break;
      const blocked2 = spendingLimit(parsed, res.status, route.label);
      if (blocked2 && !/слишком часто|подожди/i.test(blocked2)) {
        return { ok: false, error: blocked2, fatal: true };
      }
    }
  }

  if (!res || !res.ok) {
    const err = parsed?.error;
    const msg =
      spendingLimit(parsed, res?.status ?? 0, route.label) ||
      (typeof err === "string"
        ? err
        : err && typeof err === "object" && typeof (err as { message?: string }).message === "string"
          ? (err as { message: string }).message
          : `${route.label} HTTP ${res?.status ?? 0}`);
    return { ok: false, error: msg };
  }
  const choices = Array.isArray(parsed?.choices) ? parsed.choices : [];
  const first = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : null;
  const message = first?.message && typeof first.message === "object" ? (first.message as Record<string, unknown>) : null;
  const content = typeof message?.content === "string" ? message.content.trim() : "";
  if (!content) return { ok: false, error: "Пустой ответ." };
  return { ok: true, content, id: typeof parsed?.id === "string" ? parsed.id : undefined };
}

function cacheSystem(messages: unknown[]) {
  return messages.map((item, i) => {
    if (i !== 0 || !item || typeof item !== "object") return item;
    const row = item as { role?: string; content?: unknown };
    if (row.role !== "system" || typeof row.content !== "string") return item;
    return {
      role: "system",
      content: [{ type: "text", text: row.content, cache_control: { type: "ephemeral" } }],
    };
  });
}

function asTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((bit) => {
        if (!bit || typeof bit !== "object") return "";
        const t = (bit as { text?: string; type?: string }).text;
        return typeof t === "string" ? t : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function outputText(parsed: Record<string, unknown> | null): string {
  if (!parsed) return "";
  if (typeof parsed.output_text === "string" && parsed.output_text.trim()) return parsed.output_text.trim();
  const output = parsed.output;
  if (!Array.isArray(output)) return "";
  const bits: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    const t = asTextContent(content);
    if (t) bits.push(t);
  }
  return bits.join("\n").trim();
}

async function completeResponses(
  route: ChatRoute,
  messages: unknown[],
  temperature: number,
  previousId?: string,
): Promise<{ ok: true; content: string; id?: string } | { ok: false; error: string; fatal?: boolean }> {
  const rows = messages.filter((m): m is { role?: string; content?: unknown } => Boolean(m && typeof m === "object"));
  const system = rows.find((m) => m.role === "system");
  const rest = rows.filter((m) => m.role !== "system");
  const latest = previousId ? rest.slice(-1) : rest;
  const input = latest.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: asTextContent(m.content) || "…",
  }));
  for (const model of route.models) {
    const payload: Record<string, unknown> = {
      model,
      temperature,
      store: true,
      input,
    };
    const instructions = asTextContent(system?.content);
    if (instructions && !previousId) payload.instructions = instructions;
    if (previousId) payload.previous_response_id = previousId;
    const res = await fetch(route.url, {
      method: "POST",
      headers: route.headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });
    const text = await res.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const blocked = spendingLimit(parsed, res.status, route.label);
      if (blocked && !/слишком часто|подожди/i.test(blocked)) return { ok: false, error: blocked, fatal: true };
      if (res.status === 401) return { ok: false, error: `${route.label}: ключ не принят.`, fatal: true };
      continue;
    }
    const content = outputText(parsed);
    if (!content) continue;
    const id = typeof parsed?.id === "string" ? parsed.id : undefined;
    return { ok: true, content, id };
  }
  return { ok: false, error: `${route.label} не ответил.` };
}

function spendingLimit(parsed: Record<string, unknown> | null, status: number, label = "") {
  const err = parsed?.error;
  const code = typeof parsed?.code === "string" ? parsed.code : "";
  const msg =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && typeof (err as { message?: string }).message === "string"
        ? (err as { message: string }).message
        : "";
  const blob = `${code} ${msg}`.toLowerCase();
  if (
    blob.includes("spending-limit") ||
    blob.includes("spending limit") ||
    blob.includes("used all available credits") ||
    blob.includes("run out of credits") ||
    blob.includes("out of credits") ||
    blob.includes("insufficient credits") ||
    blob.includes("payment required") ||
    (blob.includes("permission-denied") && blob.includes("credit"))
  ) {
    return label === "OpenRouter"
      ? "На OpenRouter кончились кредиты. Пополни на openrouter.ai/settings/credits — фото Groku не мешает."
      : "Закончились кредиты xAI — чат и Imagine стоят. Пополни на grok.com/?_s=usage или SuperGrok. Инста и Dropbox работают.";
  }
  if (status === 429 || blob.includes("rate limit")) return "Слишком часто — подожди минуту.";
  return "";
}
