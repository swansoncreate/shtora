import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { GenerationJob, VisualMemory } from "./types";

const memorySchema = z.object({
  id: z.string().min(1).max(120),
  username: z.string().min(1).max(40),
  imageUrl: z.string().min(1).max(8000),
  createdAt: z.number(),
  scene: z.record(z.string(), z.unknown()).default({}),
  camera: z.object({
    mode: z.string().max(40),
    angle: z.string().max(120).optional(),
    perspective: z.string().max(120).optional(),
  }),
  source: z.enum(["instagram", "dropbox", "generated", "edited"]),
  parentId: z.string().max(120).optional(),
  sceneId: z.string().max(120).optional(),
  tags: z.array(z.string().max(80)).max(20).optional(),
  prompt: z.string().max(1800).optional(),
  worldSnapshot: z.record(z.string(), z.unknown()).optional(),
  sourcePath: z.string().max(1200).optional(),
});

export const saveVisualMemoryFn = createServerFn({ method: "POST" })
  .validator(memorySchema)
  .handler(async ({ data }) => {
    const { proxyOr } = await import("@/lib/server/remote");
    return proxyOr("visual.memory.save", data, async () => {
      const { saveVisualMemory } = await import("./memory.server");
      return saveVisualMemory(data as unknown as VisualMemory);
    });
  });

export const listVisualMemoryFn = createServerFn({ method: "POST" })
  .validator(z.object({ username: z.string().min(1).max(40), query: z.string().max(180).optional() }))
  .handler(async ({ data }) => {
    const { proxyOr } = await import("@/lib/server/remote");
    return proxyOr("visual.memory.list", data, async () => {
      const { listVisualMemory } = await import("./memory.server");
      return { memories: await listVisualMemory(data.username, data.query || "") };
    });
  });

export const createGenerationJobFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      username: z.string().min(1).max(40),
      job: z.record(z.string(), z.unknown()),
    }),
  )
  .handler(async ({ data }) => {
    const { proxyOr } = await import("@/lib/server/remote");
    return proxyOr("visual.job.create", data, async () => {
      const { createGenerationJob } = await import("./jobs.server");
      return createGenerationJob(data.job as unknown as Parameters<typeof createGenerationJob>[0]);
    });
  });

export const updateGenerationJobFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      username: z.string().min(1).max(40),
      id: z.string().min(1).max(120),
      patch: z.record(z.string(), z.unknown()),
    }),
  )
  .handler(async ({ data }) => {
    const { proxyOr } = await import("@/lib/server/remote");
    return proxyOr("visual.job.update", data, async () => {
      const { updateGenerationJob } = await import("./jobs.server");
      return updateGenerationJob(data.username, data.id, data.patch as Partial<GenerationJob>);
    });
  });

export const listGenerationJobsFn = createServerFn({ method: "POST" })
  .validator(z.object({ username: z.string().min(1).max(40) }))
  .handler(async ({ data }) => {
    const { proxyOr } = await import("@/lib/server/remote");
    return proxyOr("visual.job.list", data, async () => {
      const { listGenerationJobs } = await import("./jobs.server");
      return { jobs: await listGenerationJobs(data.username) };
    });
  });
