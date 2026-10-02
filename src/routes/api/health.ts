import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const { runningOnVps, vpsFetch } = await import("@/lib/server/remote");
        if (runningOnVps()) {
          return Response.json({ ok: true, service: "shtora-api", at: Date.now() });
        }
        try {
          const res = await vpsFetch("/api/health", { signal: AbortSignal.timeout(8_000) });
          const body = await res.json().catch(() => ({}));
          return Response.json(
            { ok: res.ok, service: "shtora-api", via: "vps", at: Date.now(), ...(typeof body === "object" ? body : {}) },
            { status: res.ok ? 200 : 503 },
          );
        } catch (err) {
          return Response.json(
            { ok: false, service: "shtora-api", error: err instanceof Error ? err.message : "vps" },
            { status: 503 },
          );
        }
      },
    },
  },
});
