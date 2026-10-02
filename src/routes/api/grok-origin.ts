import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/grok-origin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
          let origin = "";
          try {
            const body = (await request.json()) as { origin?: string };
            origin = String(body.origin || "").trim();
          } catch {
            origin = "";
          }
          const { writeGrokOrigin } = await import("@/lib/server/grok-app");
          const ok = await writeGrokOrigin(origin);
          return Response.json({ ok, origin: ok ? origin : "" });
        });
      },
      GET: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
          const { readGrokOrigin } = await import("@/lib/server/grok-app");
          const origin = await readGrokOrigin();
          return Response.json({ ok: Boolean(origin), origin });
        });
      },
    },
  },
});
