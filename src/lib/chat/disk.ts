import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ChatArc } from "./arc";

export type DiskMessage = {
  id?: string;
  role: "user" | "assistant";
  text: string;
  kind?: string;
  at: number;
  imageUrl?: string;
  once?: boolean;
  photo?: boolean;
  debug?: {
    warmth: number;
    trust: number;
    heat: number;
    irrit: number;
    spark?: number;
    guilt?: number;
    pull?: number;
    stage?: string;
    beat?: string;
    place?: string;
    clothes?: string;
    hair?: string;
    mood?: string;
    memory?: string;
    hour?: number;
    want?: string;
    lastMove?: string;
  };
};

export type DiskThread = {
  username: string;
  fullName?: string;
  mood?: string;
  memory?: string;
  warmth?: number;
  persona?: string;
  backstory?: string;
  lastPingAt?: number;
  world?: {
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
  };
  arc?: ChatArc;
  bond?: { warmth?: number; trust?: number; heat?: number; irrit?: number; guilt?: number; spark?: number };
  updatedAt: number;
  messages: DiskMessage[];
};

const debugSnap = z
  .object({
    warmth: z.number(),
    trust: z.number(),
    heat: z.number(),
    irrit: z.number(),
    spark: z.number().optional(),
    guilt: z.number().optional(),
    pull: z.number().optional(),
    stage: z.string().max(20).optional(),
    beat: z.string().max(20).optional(),
    place: z.string().max(120).optional(),
    clothes: z.string().max(120).optional(),
    hair: z.string().max(120).optional(),
    mood: z.string().max(200).optional(),
    memory: z.string().max(400).optional(),
    hour: z.number().optional(),
    want: z.string().max(200).optional(),
    lastMove: z.string().max(200).optional(),
  })
  .passthrough()
  .optional();

const msg = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(8000),
  kind: z.string().max(40).optional(),
  at: z.number(),
  photo: z.boolean().optional(),
  once: z.boolean().optional(),
  imageUrl: z.string().max(20000).optional(),
  id: z.string().max(120).optional(),
  debug: debugSnap,
});

const threadDump = z
  .object({
    username: z.string().min(1).max(40),
    fullName: z.string().max(120).optional(),
    mood: z.string().max(200).optional(),
    memory: z.string().max(2000).optional(),
    warmth: z.number().optional(),
    persona: z.string().max(4000).optional(),
    backstory: z.string().max(4000).optional(),
    lastPingAt: z.number().optional(),
    world: z
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
      .passthrough()
      .optional(),
    arc: z
      .object({
        beat: z.enum(["ice", "test", "thaw", "hook", "open", "pull"]),
        want: z.string().max(200),
        avoid: z.string().max(200),
        loops: z.array(z.string().max(200)).max(12),
        lastMove: z.string().max(200),
      })
      .optional(),
    bond: z
      .object({
        warmth: z.number(),
        trust: z.number(),
        heat: z.number(),
        irrit: z.number(),
        guilt: z.number().optional(),
        spark: z.number().optional(),
      })
      .optional(),
    updatedAt: z.number(),
    metricsOk: z.boolean().optional(),
    messages: z.array(msg).max(250),
  })
  .passthrough();

export const dumpChatToDisk = createServerFn({ method: "POST" })
  .validator(z.object({ thread: threadDump }))
  .handler(async ({ data }) => {
    const { proxyOr } = await import("@/lib/server/remote");
    return proxyOr("chat.dump", data, async () => {
      const { writeDiskThread } = await import("./disk.server");
      await writeDiskThread(data.thread);
      return { ok: true as const };
    });
  });

export const listDiskChats = createServerFn({ method: "GET" }).handler(async () => {
  const { proxyOr } = await import("@/lib/server/remote");
  return proxyOr("chat.list", {}, async () => {
    const { readAllDiskThreads } = await import("./disk.server");
    return { threads: await readAllDiskThreads() };
  });
});

export const eraseChatDisk = createServerFn({ method: "POST" })
  .validator(z.object({ usernames: z.array(z.string().min(1).max(40)).max(40) }))
  .handler(async ({ data }) => {
    const { proxyOr } = await import("@/lib/server/remote");
    return proxyOr("chat.erase", data, async () => {
      const { eraseDiskUsers } = await import("./disk.server");
      await eraseDiskUsers(data.usernames);
      return { ok: true as const };
    });
  });
