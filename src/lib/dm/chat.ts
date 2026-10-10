import { asBond, pullOf, stageFrom, type BondDelta } from "@/lib/chat/bond";
import { runChatModel, type BrainInput, type BrainTurn } from "@/lib/chat/brain.server";
import { dayNow, isHeatNight } from "@/lib/chat/day";
import { looksLikeDirtyTalk, storyFacts } from "@/lib/chat/functions";
import { cameraKindFromText, isAtWorkNow, type ChatWorld } from "@/lib/chat/world";
import { dmFlags, type DmMove } from "./flags";
import { type DmJson } from "./post";
import { classifierSystem, dmSystem, eventLine } from "./prompt";
import { scoreDm } from "./score";
import { dmHint, settleMove } from "./settle";
import { consumeVoice } from "./voice-walk";
import { z } from "zod";
import { fitDmWorld } from "./world";
import { serverDiagnostic } from "@/lib/server/diagnostics.server";

export type DmResult = {
  ok: true;
  dm: true;
  skipped?: boolean;
  text: string;
  bubbles: string[];
  photoKind: string;
  scene: string;
  once: boolean;
  mood?: string;
  memory?: string;
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
  bondDelta?: BondDelta;
  log?: string;
};

const TEMP: Record<string, number> = {
  ice: 0.62,
  test: 0.68,
  person: 0.74,
  crack: 0.78,
  secret: 0.8,
  fall: 0.82,
  snap: 0.6,
};

export class DmChat {
  async reply(input: BrainInput): Promise<DmResult | { ok: false; error: string }> {
    return this.run(input, false);
  }

  async ping(input: BrainInput): Promise<DmResult | { ok: false; error: string }> {
    return this.run(input, true);
  }

  private async run(input: BrainInput, ping: boolean): Promise<DmResult | { ok: false; error: string }> {
    const bond = asBond(
      { warmth: input.warmth, trust: input.trust, heat: input.heat, irrit: input.irrit, guilt: input.guilt, spark: input.spark },
      input.warmth ?? 40,
    );
    const facts = storyFacts(input.backstory);
    const stage = stageFrom(bond, facts.girlfriend);
    const day = dayNow();
    const slot = input.slot || day.slot;
    const traceId = input.traceId || `dm-${Date.now().toString(36)}`;
    const world = fitDmWorld(input.world, slot);
    serverDiagnostic("info", "dm", "turn started", {
      traceId,
      ping,
      historyCount: (input.history || []).length,
      worldFieldCount: Object.keys(input.world || {}).length,
      slot,
      hasUserImage: Boolean(input.userImageDataUrl),
    });
    const pull = pullOf(bond);
    if (ping && pingClosed(stage, slot, pull, world.memOpen)) return this.empty(pingClosed(stage, slot, pull, world.memOpen) || "ping-closed");
    const last = [...(input.history ?? [])].reverse().find((m) => m.role === "user");
    const text = last?.text || input.lastSnippet || "";
    const hinted = dmHint(text);
    const camera = cameraKindFromText(text);
    const classifierStartedAt = Date.now();
    const judged = await this.classify(input, text, hinted.hint, hinted.hintNude);
    serverDiagnostic("info", "dm", "classifier finished", {
      traceId,
      move: judged.move,
      confidence: judged.confidence,
      durationMs: Date.now() - classifierStartedAt,
    });
    const settled = settleMove(judged, hinted.hint, hinted.hintNude, text);
    const { move, nude, confidence } = settled;
    const hint = hinted.hint;
    const flags = dmFlags({
      bond,
      girlfriend: Boolean(facts.girlfriend),
      move,
      nude,
      dirty: looksLikeDirtyTalk(text),
      named: Boolean(world.clothesNamed && world.clothes),
      busy: isAtWorkNow(world.place) && slot === "work",
      recent: recentPhotoFrom(input.history),
      night: isHeatNight(),
    });
    const system = dmSystem({
      name: input.fullName?.trim() || input.username,
      username: input.username,
      persona: input.persona,
      backstory: input.backstory,
      world,
      flags,
      ping,
      event: eventLine(last?.kind, text),
      slotLabel: day.slot === slot ? day.label : slot,
      onShift: slot === "work",
    });
    const messages = this.messages(input, system);
    const temp = TEMP[stage] ?? 0.74;
    const resolved = await consumeVoice({
      text,
      onShift: slot === "work",
      stage,
      flags,
      move,
      camera,
      world,
      slot,
      hint,
      confidence,
      recent: recentPhotoFrom(input.history),
      first: await this.shot(input, messages, temp),
      again: (note) => this.shot(input, [...messages, { role: "system", content: note }], temp),
    });
    if ("failed" in resolved) return { ok: false, error: resolved.failed };
    return this.pack(
      input,
      resolved.world,
      resolved.bubbles,
      resolved.photo,
      resolved.scene,
      text,
      nude,
      looksLikeDirtyTalk(text),
      !world.clothesNamed && Boolean(resolved.world.clothesNamed),
      resolved.log,
      flags,
      resolved.json,
    );
  }

  private pack(
    input: BrainInput,
    world: ChatWorld,
    bubbles: string[],
    photoKind: string,
    scene: string,
    text: string,
    nude: boolean,
    dirty: boolean,
    namedNow: boolean,
    log: string,
    flags: ReturnType<typeof dmFlags>,
    json?: DmJson,
  ): DmResult {
    const facts = storyFacts(input.backstory);
    const delta = scoreDm({
      userText: text,
      nude,
      dirty,
      girlfriend: Boolean(facts.girlfriend),
      memAbout: world.memAbout,
      namedNow,
      warmthDelta: json?.warmth_delta,
    });
    const memory = [world.memAbout, world.memOpen, world.memDodged].filter(Boolean).join(". ").slice(0, 380);
    return {
      ok: true,
      dm: true,
      text: bubbles.join("\n\n"),
      bubbles,
      photoKind,
      scene,
      once: false,
      mood: json?.mood || flags.register,
      memory,
      place: world.place,
      clothes: world.clothes,
      hair: world.hair,
      placeRu: world.placeRu,
      clothesRu: world.clothesRu,
      hairRu: world.hairRu,
      clothesNamed: world.clothesNamed,
      memAbout: world.memAbout,
      memOpen: world.memOpen,
      memDodged: world.memDodged,
      warmthDelta: json?.warmth_delta,
      bondDelta: delta,
      log,
    };
  }

  private empty(why: string): DmResult {
    return {
      ok: true,
      dm: true,
      skipped: true,
      text: "",
      bubbles: [],
      photoKind: "none",
      scene: "",
      once: false,
      log: why,
    };
  }

  private async classify(input: BrainInput, text: string, hint: DmMove, hintNude: boolean) {
    const tail = (input.history ?? []).slice(-4).map((m) => `${m.role}: ${(m.text || "").slice(0, 180)}`).join("\n");
    const out = await this.ask(
      input,
      [
        { role: "system", content: classifierSystem() },
        { role: "user", content: `hint: ${hint}, hint_nude: ${hintNude}\n${tail}\nсейчас: ${text.slice(0, 240)}` },
      ],
      0.2,
    );
    const first = out.ok ? parseMove(out.content) : null;
    if (first && first.confidence !== 0) return first;
    const againRaw = await this.ask(
      input,
      [
        { role: "system", content: classifierSystem() },
        { role: "user", content: `hint: ${hint}, hint_nude: ${hintNude}\n${tail}\nсейчас: ${text.slice(0, 240)}` },
      ],
      0.2,
    );
    const again = againRaw.ok ? parseMove(againRaw.content) : null;
    if (!again || again.confidence === 0) return { move: "talk" as DmMove, nude: Boolean(again?.nude), confidence: 0.5 };
    return again;
  }

  private messages(input: BrainInput, system: string) {
    const history = (input.history ?? []).slice(-48).map((item) => ({
      role: item.role,
      content: (item.text || "").slice(0, 800) || "…",
    }));
    const last = history.at(-1);
    if (last && input.userImageDataUrl && last.role === "user") {
      history[history.length - 1] = {
        role: "user",
        content: [
          { type: "text", text: String(last.content) },
          { type: "image_url", image_url: { url: input.userImageDataUrl } },
        ] as unknown as string,
      };
    }
    return [{ role: "system", content: system }, ...history];
  }

  private async shot(input: BrainInput, messages: unknown[], temperature: number) {
    const out = await this.ask(input, messages, temperature);
    return { ok: out.ok, raw: out.content, error: out.error };
  }

  private async ask(input: BrainInput, messages: unknown[], temperature: number) {
    const startedAt = Date.now();
    let requestBytes = 0;
    try {
      requestBytes = JSON.stringify(messages).length;
    } catch {
      requestBytes = -1;
    }
    serverDiagnostic("info", "model", "request started", {
      traceId: input.traceId || "untraced",
      engine: input.chatEngine || "grok",
      modelConfigured: Boolean(input.chatModel),
      temperature,
      messageCount: Array.isArray(messages) ? messages.length : 0,
      requestBytes,
    });
    const out = await runChatModel(input, messages, temperature, true);
    serverDiagnostic(out.ok ? "info" : "error", "model", out.ok ? "request finished" : "request failed", {
      traceId: input.traceId || "untraced",
      engine: input.chatEngine || "grok",
      ok: out.ok,
      responseChars: out.ok ? out.content.length : 0,
      errorPresent: !out.ok,
    }, Date.now() - startedAt);
    if (!out.ok) return { ok: false as const, error: out.error, content: "" };
    return { ok: true as const, content: out.content, error: "" };
  }
}

const dmMoveSchema = z.object({
  move: z.enum(["camera", "catalog", "gallery", "circle", "look", "talk"]),
  nude_ask: z.boolean().optional().default(false),
  confidence: z.number().min(0).max(1),
});

function parseMove(raw: string): { move: DmMove; nude: boolean; confidence: number } | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = dmMoveSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    if (!parsed.success) return null;
    return {
      move: parsed.data.move,
      nude: Boolean(parsed.data.nude_ask),
      confidence: parsed.data.confidence,
    };
  } catch {
    return null;
  }
}

function recentPhotoFrom(history?: BrainTurn[]) {
  const now = Date.now();
  return (history ?? []).some(
    (m) => m.role === "assistant" && (m.kind === "photo" || m.kind === "circle") && typeof m.at === "number" && now - m.at < 8 * 60_000,
  );
}

export function pingClosed(stage: string, slot: string, pull: number, memOpen?: string) {
  if (stage === "ice" || stage === "snap") return "ping-closed";
  if ((slot === "sleep" || slot === "night") && (pull < 60 || !memOpen)) return "ping-night";
  return "";
}

export async function replyDm(input: BrainInput) {
  return new DmChat().reply(input);
}

export async function pingDm(input: BrainInput) {
  return new DmChat().ping(input);
}
