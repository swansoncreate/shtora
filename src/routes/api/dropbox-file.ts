import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/dropbox-file")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
        let body: { token?: string; path?: string };
        try {
          body = (await request.json()) as { token?: string; path?: string };
        } catch {
          return Response.json({ error: "Нет пути файла." }, { status: 400 });
        }
        const token = String(body.token ?? "");
        const path = String(body.path ?? "");
        if (!token || !path) {
          return Response.json({ error: "Нет токена или пути Dropbox." }, { status: 400 });
        }
        try {
          const { downloadDropboxFile } = await import("@/lib/dropbox/dropbox.server");
          const file = await downloadDropboxFile(token, path);
          return new Response(file.bytes, {
            headers: {
              "Content-Type": file.contentType || "application/octet-stream",
              "Cache-Control": "private, max-age=3600",
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Не удалось открыть файл Dropbox.";
          return Response.json({ error: message }, { status: 400 });
        }
        });
      },
    },
  },
});
