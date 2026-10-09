import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { runningOnVps } = await import("@/lib/server/remote");
        if (!runningOnVps()) {
          return Response.json({ enabled: false, configured: true, authenticated: true }, {
            headers: { "Cache-Control": "no-store" },
          });
        }
        const { sessionStatus } = await import("@/lib/server/vps-session.server");
        const status = sessionStatus(request);
        if (new URL(request.url).searchParams.get("check") === "1" && !status.authenticated) {
          return Response.json({ authenticated: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
        }
        return Response.json(status, { headers: { "Cache-Control": "no-store" } });
      },
      POST: async ({ request }) => {
        const { runningOnVps } = await import("@/lib/server/remote");
        if (!runningOnVps()) return Response.json({ ok: false }, { status: 404 });
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Некорректный запрос." }, { status: 400 });
        }
        const { createSessionResponse } = await import("@/lib/server/vps-session.server");
        return createSessionResponse(request, body);
      },
      DELETE: async ({ request }) => {
        const { runningOnVps } = await import("@/lib/server/remote");
        if (!runningOnVps()) return Response.json({ ok: false }, { status: 404 });
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) {
          return Response.json({ ok: false, error: "Недопустимый источник запроса." }, { status: 403 });
        }
        const { clearSessionResponse } = await import("@/lib/server/vps-session.server");
        return clearSessionResponse();
      },
    },
  },
});
