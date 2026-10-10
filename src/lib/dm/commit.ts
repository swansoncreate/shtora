import { appendMessage, applyBond, getThread, markThreadRead, patchThread } from "@/lib/chat/store";
import { stripChatTic } from "@/lib/chat/functions";
import { diagnosticLog } from "@/lib/diagnostics";

export type CommitPatch = {
  bubbles?: string[];
  photoKind?: string;
  scene?: string;
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
  bondDelta?: { warmth?: number; trust?: number; heat?: number; irrit?: number; guilt?: number; spark?: number };
  log?: string;
  once?: boolean;
};

export async function commitBubbles(username: string, out: CommitPatch, viewing: boolean, stamp?: number, traceId?: string) {
  const startedAt = Date.now();
  diagnosticLog("info", "dm", "commit started", { traceId, hasOutput: Boolean(out.log), requestedBubbles: out.bubbles?.length || 0 });
  if (!out.log) return { bubbles: [] as string[], world: getThread(username)?.world };
  const live = getThread(username);
  const world = {
    ...(live?.world || {}),
    place: out.place ?? live?.world?.place,
    clothes: out.clothes ?? live?.world?.clothes,
    hair: out.hair ?? live?.world?.hair,
    placeRu: out.placeRu ?? live?.world?.placeRu,
    clothesRu: out.clothesRu ?? live?.world?.clothesRu,
    hairRu: out.hairRu ?? live?.world?.hairRu,
    clothesNamed: out.clothesNamed ?? live?.world?.clothesNamed,
    activity: live?.world?.activity,
    timeContext: live?.world?.timeContext,
    weather: live?.world?.weather,
    sceneId: live?.world?.sceneId,
    memAbout: out.memAbout ?? live?.world?.memAbout,
    memOpen: out.memOpen ?? live?.world?.memOpen,
    memDodged: out.memDodged ?? live?.world?.memDodged,
  };
  await patchThread(username, { world, mood: out.mood, memory: out.memory || live?.memory });
  if (out.bondDelta) await applyBond(username, out.bondDelta);
  const seen = new Set(
    (live?.messages ?? [])
      .filter((m) => m.role === "assistant" && m.text)
      .slice(-8)
      .map((m) => m.text.trim().toLowerCase()),
  );
  const bubbles = (out.bubbles || [])
    .map((part) => stripChatTic(part))
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false;
      const low = part.toLowerCase();
      if (seen.has(low)) return false;
      seen.add(low);
      return true;
    })
    .slice(0, 3);
  const base = stamp || Date.now();
  const start = nextSeq(username);
  let unreadOnce = !viewing;
  for (const [i, part] of bubbles.entries()) {
    await appendMessage(
      username,
      {
        role: "assistant",
        text: part,
        kind: "text",
        at: base + i * 1000,
        seq: start + i,
        debug: {
          place: world.placeRu || world.place,
          clothes: world.clothesRu || world.clothes,
          hair: world.hairRu || world.hair,
          mood: out.mood,
          want: out.log,
        },
      },
      { incrementUnread: unreadOnce },
    );
    unreadOnce = false;
  }
  if (viewing) await markThreadRead(username);
  diagnosticLog("info", "dm", "commit finished", {
    traceId,
    requestedBubbles: out.bubbles?.length || 0,
    persistedBubbles: bubbles.length,
    worldFieldCount: Object.keys(world).filter((key) => world[key as keyof typeof world] !== undefined).length,
  }, Date.now() - startedAt);
  return { bubbles, world };
}

export function nextSeq(username: string) {
  const msgs = getThread(username)?.messages ?? [];
  let max = msgs.length;
  for (const m of msgs) if (typeof m.seq === "number" && m.seq > max) max = m.seq;
  return max + 1;
}
