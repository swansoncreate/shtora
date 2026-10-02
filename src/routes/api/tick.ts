import { createFileRoute } from "@tanstack/react-router";

let inflight: Promise<unknown> | null = null;

export const Route = createFileRoute("/api/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
        const { runTick, ensureTickLoop } = await import("@/lib/server/tick.server");
        ensureTickLoop();
        if (!inflight) {
          inflight = runTick().finally(() => {
            inflight = null;
          });
        }
        try {
          const result = await inflight;
          return Response.json(result);
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : "тик не прошёл" },
            { status: 500 },
          );
        }
        });
      },
    },
  },
});
