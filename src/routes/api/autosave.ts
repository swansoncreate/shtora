import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/autosave")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
        const { runServerAutoSave } = await import("@/lib/dropbox/autosave.server");
        let body: import("@/lib/dropbox/autosave.server").AutoSaveBody;
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Нет данных автосохранения." }, { status: 400 });
        }
        if (!body?.dropboxToken && !body?.dropboxRefreshToken) {
          return Response.json({ error: "Нужен токен Dropbox." }, { status: 400 });
        }
        if (!body?.apifyToken && !body?.hikerToken && !body?.tikhubToken) {
          return Response.json({ error: "Нужен токен Apify." }, { status: 400 });
        }
        if (!body.accountFolders) {
          body.accountFolders = {
            ellissawe: "/Штора/ellissawe",
            dashutiya: "/Штора/dashutiya",
            sheptnowa: "/Штора/sheptnowa",
            minsiyaaa: "/Штора/minsiyaaa",
          };
        }
        const name = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
        if (name && !/^[a-z0-9._]{1,30}$/i.test(name)) {
          return Response.json({ error: "Некорректный ник." }, { status: 400 });
        }
        try {
          const result = await runServerAutoSave({ ...body, username: name || undefined });
          return Response.json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Не удалось автосохранить.";
          return Response.json({ error: message }, { status: 400 });
        }
        });
      },
    },
  },
});
