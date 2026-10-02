import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/chat-media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
        const id = new URL(request.url).searchParams.get("id") || "";
        const { readPersistedImage } = await import("@/lib/imagine/persist.server");
        const file = await readPersistedImage(id);
        if (!file) return new Response("Not found", { status: 404 });
        const buf = file.buf;
        const size = buf.byteLength;
        const range = request.headers.get("Range");
        const video = file.mime.startsWith("video/");
        if (video && range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          const start = m?.[1] ? Number(m[1]) : 0;
          const end = m?.[2] ? Number(m[2]) : size - 1;
          if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
            return new Response("Range not satisfiable", {
              status: 416,
              headers: { "Content-Range": `bytes */${size}` },
            });
          }
          const slice = buf.subarray(start, Math.min(end, size - 1) + 1);
          return new Response(new Uint8Array(slice), {
            status: 206,
            headers: {
              "Content-Type": file.mime,
              "Content-Range": `bytes ${start}-${start + slice.byteLength - 1}/${size}`,
              "Accept-Ranges": "bytes",
              "Content-Length": String(slice.byteLength),
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        }
        return new Response(new Uint8Array(buf), {
          headers: {
            "Content-Type": file.mime,
            "Accept-Ranges": video ? "bytes" : "none",
            "Content-Length": String(size),
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
        });
      },
      POST: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
        const type = (request.headers.get("content-type") || "").split(";")[0]?.trim() || "";
        if (type.startsWith("image/") || type.startsWith("video/") || type === "application/octet-stream") {
          const buf = Buffer.from(await request.arrayBuffer());
          if (buf.byteLength < 32) return Response.json({ error: "empty" }, { status: 400 });
          const { persistBytes } = await import("@/lib/imagine/persist.server");
          const stored = await persistBytes(buf, type);
          return Response.json({ url: stored });
        }
        let url = "";
        try {
          const body = (await request.json()) as { url?: string };
          url = String(body.url ?? "").trim();
        } catch {
          return Response.json({ error: "Нет кадра." }, { status: 400 });
        }
        if (!url || url.length > 8000) return Response.json({ error: "Нет кадра." }, { status: 400 });
        const video = /\.mp4($|\?)|\.webm($|\?)|\.mov($|\?)|video\//i.test(url);
        const { persistRemoteImage, persistRemoteVideo } = await import("@/lib/imagine/persist.server");
        const stored = video ? (await persistRemoteVideo(url)) || url : (await persistRemoteImage(url)) || url;
        return Response.json({ url: stored || url });
        });
      },
    },
  },
});
