import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const payload = z.object({
  username: z.string().min(1).max(80),
  token: z.string().max(4000).optional(),
  hikerToken: z.string().max(4000).optional(),
  tikhubToken: z.string().max(4000).optional(),
  force: z.boolean().optional(),
});

export const fetchProfile = createServerFn({ method: "POST" })
  .validator(payload)
  .handler(async ({ data }) => {
    const { proxyOr } = await import("@/lib/server/remote");
    const profile = await proxyOr("ig.profile", data, async () => {
      const { handleProfile } = await import("./rpc.server");
      return handleProfile(data);
    });
    try {
      const { persistAndRewriteProfile } = await import("./persist-media.server");
      return await persistAndRewriteProfile(profile);
    } catch {
      return profile;
    }
  });

export const fetchStories = createServerFn({ method: "POST" })
  .validator(payload)
  .handler(async ({ data }) => {
    const { proxyOr } = await import("@/lib/server/remote");
    const stories = await proxyOr("ig.stories", data, async () => {
      const { handleStories } = await import("./rpc.server");
      return handleStories(data);
    });
    try {
      const { persistAndRewriteStories } = await import("./persist-media.server");
      return await persistAndRewriteStories(stories, false);
    } catch {
      return stories;
    }
  });

export const probeTikhubKey = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().min(8).max(4000) }))
  .handler(async ({ data }) => {
    const { proxyOr } = await import("@/lib/server/remote");
    return proxyOr("ig.probeTikhub", data, async () => {
      const { probeTikhub } = await import("./engine/tikhub");
      return probeTikhub(data.token);
    });
  });

export const warmAccounts = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string().max(4000).optional(),
      usernames: z.array(z.string().min(1).max(80)).max(20),
      force: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { proxyOr } = await import("@/lib/server/remote");
    return proxyOr("ig.warm", data, async () => {
      const { handleWarm } = await import("./rpc.server");
      return handleWarm(data);
    });
  });

export const fetchSnapshot = createServerFn({ method: "POST" })
  .validator(z.object({ username: z.string().min(1).max(80) }))
  .handler(async ({ data }) => {
    const { proxyOr } = await import("@/lib/server/remote");
    return proxyOr("ig.snapshot", data, async () => {
      const { handleSnapshot } = await import("./rpc.server");
      return handleSnapshot(data.username);
    });
  });

export const fetchHighlight = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().min(1).max(200),
      username: z.string().max(80).optional(),
      hikerToken: z.string().max(4000).optional(),
      tikhubToken: z.string().max(4000).optional(),
      token: z.string().max(4000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { proxyOr } = await import("@/lib/server/remote");
    const highlight = await proxyOr("ig.highlight", data, async () => {
      const { handleHighlight } = await import("./rpc.server");
      return handleHighlight(data);
    });
    try {
      const { persistHighlight } = await import("./persist-media.server");
      return await persistHighlight(highlight, true);
    } catch {
      return highlight;
    }
  });
