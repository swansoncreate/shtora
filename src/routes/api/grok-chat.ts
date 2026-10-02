import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/grok-chat")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Shtora-Key",
          },
        }),
      POST: async ({ request }) => {
        const { runningOnVps, rpcKey } = await import("@/lib/server/remote");
        if (runningOnVps()) {
          return Response.json(
            { ok: false, error: "Чат считается на публикации Grok, не на VPS." },
            { status: 400 },
          );
        }
        if (request.headers.get("x-shtora-key") !== rpcKey()) {
          return Response.json({ error: "no rpc key" }, { status: 401 });
        }
        let body: { op?: string; data?: unknown } = {};
        try {
          body = (await request.json()) as { op?: string; data?: unknown };
        } catch {
          return Response.json({ error: "bad json" }, { status: 400 });
        }
        const data = (body.data && typeof body.data === "object" ? body.data : {}) as Record<string, unknown>;
        const username = String(data.username || "").trim().toLowerCase();
        const legacy = (process.env.SHTORA_DM_LEGACY || "")
          .split(",")
          .map((name) => name.trim().toLowerCase())
          .filter(Boolean);
        try {
          if (legacy.includes(username)) {
            if (body.op === "ping") {
              const { pingWithBrain } = await import("@/lib/chat/brain.server");
              return Response.json(await pingWithBrain(data as Parameters<typeof pingWithBrain>[0]));
            }
            const { replyWithBrain } = await import("@/lib/chat/brain.server");
            return Response.json(await replyWithBrain(data as Parameters<typeof replyWithBrain>[0]));
          }
          const { pingDm, replyDm } = await import("@/lib/dm/chat");
          const out = body.op === "ping" ? await pingDm(data as Parameters<typeof pingDm>[0]) : await replyDm(data as Parameters<typeof replyDm>[0]);
          return Response.json(out);
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : "grok chat fail" },
            { status: 400 },
          );
        }
      },
    },
  },
});
