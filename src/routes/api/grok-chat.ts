import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/grok-chat")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const { corsHeaders } = await import("@/lib/server/remote");
        return new Response(null, { status: 204, headers: corsHeaders(request, "POST, OPTIONS") });
      },
      POST: async ({ request }) => {
        const { runningOnVps, assertRpc, withCors } = await import("@/lib/server/remote");
        const denied = assertRpc(request);
        if (denied) return withCors(denied, request, "POST, OPTIONS");
        if (runningOnVps()) {
          return withCors(
            Response.json(
              { ok: false, error: "Чат считается на публикации Grok, не на VPS." },
              { status: 400 },
            ),
            request,
            "POST, OPTIONS",
          );
        }
        let body: { op?: string; data?: unknown } = {};
        try {
          body = (await request.json()) as { op?: string; data?: unknown };
        } catch {
          return Response.json({ error: "bad json" }, { status: 400 });
        }
        const data = (body.data && typeof body.data === "object" ? body.data : {}) as Record<string, unknown>;
        const username = String(data.username || "").trim().toLowerCase();
        if (body.op === "imagine") {
          const imageRef = z.object({
            url: z.string().min(32).max(8_000_000),
            type: z.literal("image_url"),
          });
          const payloadSchema = z.object({
            model: z.string().min(1).max(120),
            prompt: z.string().min(1).max(1800),
            image: imageRef.optional(),
            images: z.array(imageRef).max(3).optional(),
            aspect_ratio: z.string().max(20).optional(),
          });
          const parsed = payloadSchema.safeParse(data.payload);
          if (!parsed.success) return Response.json({ ok: false, error: "Некорректный payload Imagine." }, { status: 400 });
          try {
            const { generateImage } = await import("@/lib/imagine/gateway");
            const out = await generateImage(parsed.data);
            if (out.ok) return Response.json({ ok: true, url: out.url, provider: out.provider });
            return Response.json({ ok: false, error: out.error, provider: out.provider }, { status: 400 });
          } catch (err) {
            return Response.json(
              { ok: false, error: err instanceof Error ? err.message : "Imagine не ответил." },
              { status: 400 },
            );
          }
        }
        if (body.op !== "reply" && body.op !== "ping") {
          return Response.json({ ok: false, error: "Неизвестная операция Grok." }, { status: 400 });
        }
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
