import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/logs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
          const n = Number(new URL(request.url).searchParams.get("n") || "200");
          const { readShtoraLog } = await import("@/lib/server/log.server");
          const lines = await readShtoraLog(n);
          return Response.json({ ok: true, n: lines.length, lines });
        });
      },
      POST: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
          let body: { area?: string; event?: string; extra?: Record<string, unknown> } = {};
          try {
            body = (await request.json()) as typeof body;
          } catch {
            return Response.json({ error: "bad json" }, { status: 400 });
          }
          const { slog } = await import("@/lib/server/log.server");
          slog(String(body.area || "app"), String(body.event || "note"), body.extra);
          return Response.json({ ok: true });
        });
      },
    },
  },
});
