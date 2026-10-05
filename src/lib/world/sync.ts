import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const field = z.object({ value: z.string().min(1).max(80), at: z.number(), until: z.number().optional() });

export const getWorldDisk = createServerFn({ method: "POST" })
  .validator(z.object({ username: z.string().min(1).max(40) }))
  .handler(async ({ data }) => {
    const { proxyOr, runningOnVps } = await import("@/lib/server/remote");
    return proxyOr("world.get", data, async () => {
      if (!runningOnVps()) throw new Error("world.get only on vps");
      const { getWorld } = await import("./disk.server");
      return getWorld(data.username);
    });
  });

export const commitWorldDisk = createServerFn({ method: "POST" })
  .validator(
    z.object({
      username: z.string().min(1).max(40),
      patch: z.object({
        time: field.optional(),
        place: field.optional(),
        activity: field.optional(),
        availability: field.optional(),
        energy: field.optional(),
        mood: field.optional(),
        clothes: field.optional(),
        with: field.optional(),
      }),
      event: z
        .object({
          id: z.string().max(40).optional(),
          type: z.string().max(40).optional(),
          at: z.number().optional(),
          until: z.number().optional(),
          source: z.enum(["user", "her", "clock", "feed"]).optional(),
          text: z.string().min(1).max(200),
        })
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { proxyOr, runningOnVps } = await import("@/lib/server/remote");
    return proxyOr("world.commit", { username: data.username, patch: data.patch, event: data.event }, async () => {
      if (!runningOnVps()) throw new Error("world.commit only on vps");
      const { commitWorld } = await import("./disk.server");
      return commitWorld(data.username, data.patch, data.event);
    });
  });

let pulled = false;

export function hydrateWorld(usernames: string[]) {
  if (typeof window === "undefined" || pulled) return;
  pulled = true;
  for (const username of usernames.slice(0, 20)) {
    void getWorldDisk({ data: { username } }).catch(() => undefined);
  }
}
