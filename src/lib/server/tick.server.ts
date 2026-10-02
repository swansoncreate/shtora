import { stripChatTic } from "@/lib/chat/functions";
import { readAllDiskThreads } from "@/lib/chat/disk.server";
import { runServerAutoSave } from "@/lib/dropbox/autosave.server";
import { createEngine } from "@/lib/instagram/engine/runner";
import { igCache } from "@/lib/instagram/store";
import { DEFAULT_APIFY_TOKEN, PINNED_ACCOUNTS } from "@/lib/instagram/pinned";
import { readServerConfig } from "./config";
import { listSnapshots, readSnapshot, readTickStatus, writeSnapshot, writeTickStatus } from "./snapshots";

let inflight: Promise<Awaited<ReturnType<typeof runTickInner>>> | null = null;
let chatDeadUntil = 0;

async function mapPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(size, queue.length || 1) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item !== undefined) await fn(item);
    }
  });
  await Promise.all(workers);
}

async function runTickInner(opts?: { chats?: boolean; instagram?: boolean; dropbox?: boolean }) {
  const instagram = opts?.instagram !== false;
  const chats = opts?.chats !== false;
  const dropbox = opts?.dropbox !== false;
  const config = await readServerConfig();
  const apifyToken = config?.apifyToken || DEFAULT_APIFY_TOKEN;
  const hikerToken = config?.hikerToken || "";
  const tikhubToken = config?.tikhubToken || "";
  const names = (config?.favorites?.length ? config.favorites : [...PINNED_ACCOUNTS]).map((n) => n.trim().toLowerCase());
  const accounts: { username: string; ok: boolean; stories?: number; highlights?: number; error?: string }[] = [];

  if (instagram && apifyToken) {
    const engine = createEngine({ apify: apifyToken, hiker: hikerToken, tikhub: tikhubToken });
    await mapPool(names.filter(Boolean), 2, async (username) => {
      const prev = await readSnapshot(username);
      const profileAge = prev?.at ? Date.now() - prev.at : Number.POSITIVE_INFINITY;
      try {
        let stories = prev?.stories ?? null;
        try {
          const live = await engine.stories(username, false);
          const rewritten = await import("@/lib/instagram/persist-media.server").then((m) =>
            m.persistAndRewriteStories(live, false),
          );
          stories = igCache.reconcileStories(prev?.stories ?? null, rewritten);
        } catch (err) {
          if (!stories) throw err;
        }
        let profile = prev?.profile ?? null;
        if (!profile || profileAge > 20 * 60 * 60 * 1000) {
          try {
            const live = await engine.profile(username, false);
            const rewritten = await import("@/lib/instagram/persist-media.server").then((m) =>
              m.persistAndRewriteProfile(live),
            );
            profile = igCache.reconcileProfile(prev?.profile ?? null, rewritten);
          } catch {
            /* keep previous profile */
          }
        }
        await writeSnapshot(username, { at: Date.now(), profile, stories });
        accounts.push({
          username,
          ok: true,
          stories: stories?.stories.length ?? 0,
          highlights: stories?.highlights.length ?? 0,
        });
      } catch (err) {
        accounts.push({
          username,
          ok: Boolean(prev?.profile || prev?.stories),
          stories: prev?.stories?.stories.length ?? 0,
          highlights: prev?.stories?.highlights.length ?? 0,
          error: err instanceof Error ? err.message : "не вышло",
        });
      }
    });
  } else if (instagram && (hikerToken || tikhubToken)) {
    const engine = createEngine({ apify: apifyToken, hiker: hikerToken, tikhub: tikhubToken });
    await mapPool(names.filter(Boolean), 2, async (username) => {
      try {
        const prev = await readSnapshot(username);
        if (prev && Date.now() - prev.at < 20 * 60 * 60 * 1000) {
          accounts.push({
            username,
            ok: true,
            stories: prev.stories?.stories.length ?? 0,
            highlights: prev.stories?.highlights.length ?? 0,
          });
          return;
        }
        let profile = null;
        let stories = null;
        let error: string | undefined;
        try {
          profile = await engine.profile(username, false);
        } catch (err) {
          error = err instanceof Error ? err.message : "профиль";
        }
        try {
          stories = await engine.stories(username, false);
        } catch (err) {
          error = error || (err instanceof Error ? err.message : "сторис");
        }
        if (profile || stories) {
          const latest = await readSnapshot(username);
          await writeSnapshot(username, {
            at: Date.now(),
            profile: profile ? igCache.reconcileProfile(latest?.profile ?? prev?.profile ?? null, profile) : latest?.profile ?? prev?.profile ?? null,
            stories: stories ? igCache.reconcileStories(latest?.stories ?? prev?.stories ?? null, stories) : latest?.stories ?? prev?.stories ?? null,
          });
          accounts.push({
            username,
            ok: true,
            stories: stories?.stories.length ?? prev?.stories?.stories.length ?? 0,
            highlights: stories?.highlights.length ?? prev?.stories?.highlights.length ?? 0,
            error,
          });
        } else {
          accounts.push({ username, ok: false, error: error || "не вышло" });
        }
      } catch (err) {
        accounts.push({
          username,
          ok: false,
          error: err instanceof Error ? err.message : "не вышло",
        });
      }
    });
  }

  let pinged = 0;
  let originNote = "";
  const localPing = process.env.SHTORA_PING_LOCAL === "1";
  const front = (process.env.SHTORA_FRONT_ORIGIN || "").replace(/\/$/, "");
  let doChats = Boolean(chats) && Date.now() >= chatDeadUntil;
  if (doChats && localPing) {
    const { readGrokOriginStatus } = await import("./grok-app");
    const origin = await readGrokOriginStatus();
    if (!origin.fresh) {
      doChats = false;
      originNote = "origin протух";
    }
  }
  if (doChats && !localPing && !front) {
    doChats = false;
    originNote = "нет SHTORA_FRONT_ORIGIN";
  }
  if (doChats) {
    const threads = await readAllDiskThreads();
    const now = Date.now();
    for (const thread of threads) {
      const last = thread.messages.at(-1);
      if (!last || last.role !== "assistant") continue;
      if (thread.messages.length < 1) continue;
      const lastUser = [...thread.messages].reverse().find((m) => m.role === "user");
      if (lastUser && now - (lastUser.at || 0) < 2 * 60_000) continue;
      const { dayNow } = await import("@/lib/chat/day");
      const { asBond, pullOf, stageFrom } = await import("@/lib/chat/bond");
      const { storyFacts } = await import("@/lib/chat/functions");
      const { pingClosed } = await import("@/lib/dm/chat");
      const day = dayNow(new Date(now));
      if (!day.canPing) continue;
      const gf = storyFacts(thread.backstory).girlfriend;
      const bond = asBond(thread.bond, thread.warmth ?? 40);
      const stage = stageFrom(bond, gf);
      if (pingClosed(stage, day.slot, pullOf(bond), thread.world?.memOpen)) continue;
      const recent = [...thread.messages].reverse();
      let herStreak = 0;
      for (const m of recent) {
        if (m.role === "assistant") herStreak += 1;
        else break;
      }
      if (herStreak >= 3) continue;
      const worldNow = thread.world;
      const stamp = now;
      const hour = new Date(stamp).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Moscow",
      });
      const recap = thread.messages
        .slice(-12)
        .map((item) => `${item.role === "user" ? "Он" : "Она"}: ${item.text || ""}`)
        .join("\n")
        .slice(0, 1200);
      const kinds = ["text", "photo", "story", "post", "heart", "action", "circle"] as const;
      const history = thread.messages.slice(-48).map((item) => ({
        role: item.role,
        text: (item.text || "").slice(0, 2000),
        kind: kinds.includes(item.kind as (typeof kinds)[number]) ? (item.kind as (typeof kinds)[number]) : undefined,
        at: item.at,
      }));
      try {
        const payload = {
          username: thread.username,
          fullName: thread.fullName,
          persona: thread.persona,
          mood: thread.mood,
          memory: thread.memory,
          backstory: thread.backstory,
          hour,
          lastSnippet: recap || last.text?.slice(0, 400),
          silentHours: Math.max(0, (now - last.at) / 3_600_000),
          world: worldNow,
          slot: day.slot,
          history,
          warmth: bond.warmth,
          trust: bond.trust,
          heat: bond.heat,
          irrit: bond.irrit,
          guilt: bond.guilt,
          spark: bond.spark,
          ...(thread.arc?.beat ? { arc: thread.arc } : {}),
          chatEngine: "grok",
        };
        const out = localPing ? await pingLocal(payload) : await pingPublication(front, payload);
        if (!out.ok) {
          const err = "error" in out ? String(out.error || "") : "";
          if (/кредит|credits|xAI|OpenRouter/i.test(err)) chatDeadUntil = now + 6 * 60 * 60 * 1000;
          continue;
        }
        if (out.skipped) continue;
        const parts = (out.bubbles?.length ? out.bubbles : [out.text]).map((p) => stripChatTic((p || "").trim())).filter(Boolean).slice(0, 3);
        if (!parts.length) continue;
        const nextWorld = {
          ...(worldNow || {}),
          place: out.place || worldNow?.place,
          clothes: out.clothes || worldNow?.clothes,
          hair: out.hair || worldNow?.hair,
          placeRu: out.placeRu || worldNow?.placeRu,
          clothesRu: out.clothesRu || worldNow?.clothesRu,
          hairRu: out.hairRu || worldNow?.hairRu,
          clothesNamed: out.clothesNamed ?? worldNow?.clothesNamed,
          memAbout: out.memAbout ?? worldNow?.memAbout,
          memOpen: out.memOpen ?? worldNow?.memOpen,
          memDodged: out.memDodged ?? worldNow?.memDodged,
        };
        const bump = (n: number, d?: number) => Math.max(0, Math.min(100, n + (d || 0)));
        const bumped = {
          warmth: bump(bond.warmth, out.bondDelta?.warmth),
          trust: bump(bond.trust, out.bondDelta?.trust),
          heat: bump(bond.heat, out.bondDelta?.heat),
          irrit: bump(bond.irrit, out.bondDelta?.irrit),
          spark: bump(bond.spark, out.bondDelta?.spark),
          guilt: bump(bond.guilt, out.bondDelta?.guilt),
        };
        const { appendMessages } = await import("@/lib/chat/disk.server");
        await appendMessages(
          thread.username,
          parts.map((text, i) => ({
            role: "assistant" as const,
            text,
            kind: "text",
            at: stamp + i * 15_000,
            debug: {
              warmth: bumped.warmth,
              trust: bumped.trust,
              heat: bumped.heat,
              irrit: bumped.irrit,
              spark: bumped.spark,
              guilt: bumped.guilt,
              place: nextWorld.placeRu || nextWorld.place,
              clothes: nextWorld.clothesRu || nextWorld.clothes,
              mood: out.mood || thread.mood,
              want: out.log,
              hour: day.hour,
            },
          })),
          {
            username: thread.username,
            mood: out.mood || thread.mood,
            memory: out.memory || thread.memory,
            warmth: bumped.warmth,
            bond: bumped,
            world: nextWorld,
            lastPingAt: stamp,
            updatedAt: stamp,
          },
        );
        pinged += 1;
      } catch {
        /* skip */
      }
    }
  }

  let saved = 0;
  let lastAutoAt = 0;
  const prevTick = await readTickStatus().catch(() => null);
  const autoFresh = typeof prevTick?.lastAutoAt === "number" && Date.now() - prevTick.lastAutoAt < 6 * 60 * 60 * 1000;
  if (!autoFresh && dropbox && config?.autoSave && (config.dropboxToken || config.dropboxRefreshToken) && apifyToken) {
    try {
      const { ensureServerDropboxToken } = await import("@/lib/dropbox/live.server");
      const liveToken = await ensureServerDropboxToken(config.dropboxToken);
      const result = await runServerAutoSave({
        apifyToken,
        dropboxToken: liveToken,
        dropboxRefreshToken: config.dropboxRefreshToken,
        dropboxAppKey: config.dropboxAppKey,
        dropboxAppSecret: config.dropboxAppSecret,
        defaultFolder: config.defaultFolder,
        accountFolders: config.accountFolders,
        savedFiles: config.savedFiles,
        favorites: names,
      });
      saved = result.saved ?? 0;
      if (result.keys?.length) {
        const prev = new Set(config.savedFiles ?? []);
        for (const key of result.keys) prev.add(key);
        const { patchServerConfig } = await import("./config");
        await patchServerConfig({ savedFiles: [...prev] }).catch(() => undefined);
      }
      lastAutoAt = Date.now();
    } catch {
      /* ignore */
    }
  }

  const status = { accounts, pinged, saved, at: Date.now(), lastAutoAt: lastAutoAt || prevTick?.lastAutoAt || 0 };
  await writeTickStatus(status);
  const { slog } = await import("./log.server");
  slog("tick", "done", {
    pinged,
    saved,
    origin: originNote || undefined,
    ok: accounts.filter((a) => a.ok).length,
    fail: accounts.filter((a) => !a.ok).length,
    n: accounts.length,
  });
  const [snapshots, chatDump] = await Promise.all([listSnapshots(), readAllDiskThreads()]);
  const { slimSnapshot } = await import("./snapshots");
  return { ok: true as const, ...status, snapshots: snapshots.map((row) => slimSnapshot(row)), chats: chatDump };
}

type PingOut = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  text?: string;
  bubbles?: string[];
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
  log?: string;
  bondDelta?: { warmth?: number; trust?: number; heat?: number; irrit?: number; spark?: number; guilt?: number };
};

async function pingLocal(data: Record<string, unknown>): Promise<PingOut> {
  const { chatPing } = await import("@/lib/chat/functions");
  return chatPing({ data }) as Promise<PingOut>;
}

async function pingPublication(origin: string, data: Record<string, unknown>): Promise<PingOut> {
  const { rpcKey } = await import("./remote");
  const key = rpcKey();
  if (!key) return { ok: false, error: "rpc key not configured" };
  const res = await fetch(`${origin}/api/grok-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shtora-Key": key },
    body: JSON.stringify({ op: "ping", data }),
    signal: AbortSignal.timeout(90_000),
  });
  const json = (await res.json().catch(() => null)) as PingOut | null;
  if (!json || typeof json !== "object") return { ok: false, error: `ping ${res.status}` };
  return json;
}

export function runTick(opts?: { chats?: boolean; instagram?: boolean; dropbox?: boolean }) {
  if (!inflight) {
    inflight = runTickInner(opts).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export function ensureTickLoop() {
  const g = globalThis as { __shtoraTickLoop?: boolean };
  if (g.__shtoraTickLoop) return;
  g.__shtoraTickLoop = true;
  setTimeout(() => {
    void runTick().catch(() => undefined);
  }, 2500);
  setInterval(() => {
    void runTick({ instagram: false, dropbox: false }).catch(() => undefined);
  }, 8 * 60 * 1000);
  setInterval(() => {
    void runTick().catch(() => undefined);
  }, 30 * 60 * 1000);
}
