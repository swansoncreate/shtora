import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/dropbox-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "Нет файла для загрузки." }, { status: 400 });
        }
        const token = String(form.get("token") ?? "");
        const destPath = String(form.get("destPath") ?? "");
        const sourceUrl = String(form.get("sourceUrl") ?? "");
        const file = form.get("file");
        if (!token || !destPath) {
          return Response.json({ error: "Нет токена или пути Dropbox." }, { status: 400 });
        }
        if (!(file instanceof Blob) || file.size === 0) {
          return Response.json({ error: "Нет файла для загрузки." }, { status: 400 });
        }
        try {
          const { uploadBytesToDropbox } = await import("@/lib/dropbox/dropbox.server");
          const bytes = await file.arrayBuffer();
          const result = await uploadBytesToDropbox({
            token,
            destPath,
            bytes,
            contentType: file.type,
            sourceUrl,
          });
          const { slog } = await import("@/lib/server/log.server");
          slog("dropbox", "upload", { path: destPath, bytes: bytes.byteLength });
          return Response.json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Не удалось сохранить в Dropbox.";
          const { slog } = await import("@/lib/server/log.server");
          slog("dropbox", "upload-fail", { path: destPath, err: message });
          return Response.json({ error: message }, { status: 400 });
        }
        });
      },
    },
  },
});
