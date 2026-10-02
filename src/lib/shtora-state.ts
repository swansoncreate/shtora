import { igCache } from "@/lib/instagram/store";
import { ensureSeenBaseline } from "@/lib/instagram/unseen";
import type { IgProfile, IgStories } from "@/lib/instagram/types";
import { apiFetch } from "@/lib/shtora-origin";

export type ShtoraSnapshot = {
  username: string;
  at: number;
  profile: IgProfile | null;
  stories: IgStories | null;
};

export type ShtoraChatSeed = {
  username: string;
  fullName?: string;
  mood?: string;
  memory?: string;
  warmth?: number;
  persona?: string;
  world?: { place?: string; clothes?: string; hair?: string };
  arc?: {
    beat: "ice" | "test" | "thaw" | "hook" | "open" | "pull";
    want: string;
    avoid: string;
    loops: string[];
    lastMove: string;
  };
  bond?: { warmth: number; trust: number; heat: number; irrit: number; guilt?: number; spark?: number };
  updatedAt: number;
  messages: Array<{
    id?: string;
    role: "user" | "assistant";
    text?: string;
    kind?: string;
    at: number;
    imageUrl?: string;
    once?: boolean;
  }>;
};

export type ShtoraState = {
  snapshots: ShtoraSnapshot[];
  chats: ShtoraChatSeed[];
  tickAt: number;
  saved: number;
};

function asState(raw: unknown): ShtoraState {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    snapshots: Array.isArray(o.snapshots) ? (o.snapshots as ShtoraSnapshot[]) : [],
    chats: Array.isArray(o.chats) ? (o.chats as ShtoraChatSeed[]) : [],
    tickAt: typeof o.tickAt === "number" ? o.tickAt : typeof o.at === "number" ? o.at : 0,
    saved: typeof o.saved === "number" ? o.saved : 0,
  };
}

function pickSnap(a?: ShtoraSnapshot, b?: ShtoraSnapshot) {
  if (!a) return b;
  if (!b) return a;
  const newer = (b.at || 0) >= (a.at || 0) ? b : a;
  const older = newer === a ? b : a;
  const stories = newer.stories?.stories ?? [];
  const highlights = newer.stories?.highlights?.length
    ? newer.stories.highlights
    : (older.stories?.highlights ?? []);
  const profile =
    (newer.profile?.posts?.length ?? 0) >= (older.profile?.posts?.length ?? 0)
      ? newer.profile
      : older.profile ?? newer.profile;
  return {
    ...newer,
    profile: profile ?? null,
    stories: newer.stories ? { ...newer.stories, stories, highlights } : older.stories ?? null,
  };
}

function merge(api: ShtoraState, seed: ShtoraState): ShtoraState {
  const map = new Map<string, ShtoraSnapshot>();
  for (const row of [...seed.snapshots, ...api.snapshots]) {
    if (!row?.username) continue;
    const key = row.username.toLowerCase();
    map.set(key, pickSnap(map.get(key), { ...row, username: key }) ?? row);
  }
  return { snapshots: [...map.values()], chats: api.chats, tickAt: api.tickAt || seed.tickAt, saved: api.saved || seed.saved || 0 };
}

async function getJson(url: string): Promise<ShtoraState | null> {
  try {
    const res = url.startsWith("/api/")
      ? await apiFetch(url, { cache: "no-store" })
      : await fetch(url, { cache: url.includes("seed") ? "force-cache" : "no-store" });
    if (!res.ok) return null;
    return asState(await res.json());
  } catch {
    return null;
  }
}

export async function loadShtoraState(): Promise<ShtoraState> {
  const [api, seed] = await Promise.all([getJson("/api/state"), getJson("/shtora-seed/state.json")]);
  if (api && seed) return merge(api, seed);
  return api ?? seed ?? { snapshots: [], chats: [], tickAt: 0, saved: 0 };
}

export function applyStateSnapshots(snapshots: ShtoraSnapshot[]) {
  for (const snap of snapshots) {
    if (!snap?.username) continue;
    if (snap.profile) {
      igCache.writeProfile(
        snap.username,
        igCache.reconcileProfile(igCache.profile(snap.username)?.data ?? null, snap.profile),
        snap.at,
      );
    }
    if (snap.stories) {
      igCache.writeStories(
        snap.username,
        igCache.reconcileStories(igCache.stories(snap.username)?.data ?? null, snap.stories),
        snap.at,
      );
    }
    ensureSeenBaseline(snap.username);
  }
}
