export const BEATS = ["ice", "test", "thaw", "hook", "open", "pull"] as const;
export type ChatBeat = (typeof BEATS)[number];

export type ChatArc = {
  beat: ChatBeat;
  want: string;
  avoid: string;
  loops: string[];
  lastMove: string;
};

export function emptyArc(warmth = 40): ChatArc {
  return { beat: beatFromWarmth(warmth), want: "", avoid: "", loops: [], lastMove: "" };
}

export function beatFromWarmth(warmth: number): ChatBeat {
  if (warmth <= 28) return "ice";
  if (warmth <= 52) return "thaw";
  if (warmth <= 74) return "hook";
  return "open";
}

export function parseArc(raw: unknown, warmth = 40): ChatArc {
  const base = emptyArc(warmth);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const beat = BEATS.includes(o.beat as ChatBeat) ? (o.beat as ChatBeat) : base.beat;
  const loops = Array.isArray(o.loops)
    ? o.loops.filter((x): x is string => typeof x === "string" && Boolean(x.trim())).map((x) => x.trim().slice(0, 120)).slice(0, 6)
    : base.loops;
  return {
    beat,
    want: typeof o.want === "string" ? o.want.trim().slice(0, 160) : "",
    avoid: typeof o.avoid === "string" ? o.avoid.trim().slice(0, 160) : "",
    loops,
    lastMove: typeof o.lastMove === "string" ? o.lastMove.trim().slice(0, 160) : "",
  };
}

export function arcLine(arc?: ChatArc) {
  if (!arc) return "сцены ещё нет — это начало, не знакомство с нуля если в законе вы уже знакомы.";
  const loops = arc.loops.length ? arc.loops.map((l) => `• ${l}`).join("\n") : "пока нет незакрытых нитей";
  return `бит: ${arc.beat}
хочет от разговора: ${arc.want || "ещё не ясно"}
избегает: ${arc.avoid || "—"}
нити (подхвати или закрой, не бросай):
${loops}
прошлый ход: ${arc.lastMove || "—"}`;
}
