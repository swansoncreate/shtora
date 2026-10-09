import { createFileRoute } from "@tanstack/react-router";
import { isAllowedMediaHost, mediaFetchHeaders } from "@/lib/media-host";
import { isVideoMediaUrl } from "@/lib/instagram/media-url";

async function serveById(id: string, request?: Request, privateCache = false) {
  const { readDiskMediaById } = await import("@/lib/instagram/media-disk.server");
  const file = await readDiskMediaById(id);
  if (!file) return new Response("Not found", { status: 404 });
  const buf = file.buf;
  const mime = file.mime || "application/octet-stream";
  const range = request?.headers.get("Range");
  if (range && mime.startsWith("video/")) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = m ? Number(m[1]) : 0;
    const end = m && m[2] ? Number(m[2]) : buf.length - 1;
    const slice = buf.subarray(start, end + 1);
    return new Response(new Uint8Array(slice), {
      status: 206,
      headers: {
        "Content-Type": mime,
        "Content-Range": `bytes ${start}-${start + slice.length - 1}/${buf.length}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(slice.length),
        "Cache-Control": "public, max-age=604800",
      },
    });
  }
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Content-Length": String(buf.length),
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
    },
  });
}

async function fetchUpstream(target: URL, request: Request) {
  const asVideo = isVideoMediaUrl(target.toString()) || target.pathname.toLowerCase().includes("/video");
  if (asVideo) {
    const range = request.headers.get("Range");
    const headers: Record<string, string> = {
      ...mediaFetchHeaders(target.hostname),
      Accept: "video/mp4,video/*,*/*;q=0.8",
    };
    if (range) headers.Range = range;
    const res = await fetch(target.toString(), {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(45_000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok && res.status !== 206) return new Response("Upstream failed", { status: res.status || 502 });
    const out = new Headers();
    out.set("Content-Type", type && !type.includes("text/html") ? type : "video/mp4");
    out.set("Accept-Ranges", res.headers.get("accept-ranges") || "bytes");
    const cr = res.headers.get("content-range");
    if (cr) out.set("Content-Range", cr);
    const cl = res.headers.get("content-length");
    if (cl) out.set("Content-Length", cl);
    out.set("Cache-Control", "private, max-age=3600");
    return new Response(res.body, { status: res.status, headers: out });
  }

  const { readDiskMedia, writeDiskMedia } = await import("@/lib/instagram/media-disk.server");
  const cached = await readDiskMedia(target.toString());
  if (cached) {
    return new Response(new Uint8Array(cached.buf), {
      headers: {
        "Content-Type": cached.mime,
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
      },
    });
  }

  const headerSets: Record<string, string>[] = [
    mediaFetchHeaders(target.hostname),
    {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      Accept: "image/avif,image/webp,image/*,video/*,*/*;q=0.8",
      Referer: "https://www.instagram.com/",
    },
  ];
  let lastStatus = 502;
  for (let attempt = 0; attempt < headerSets.length * 2; attempt += 1) {
    const headers = headerSets[attempt % headerSets.length];
    if (attempt) await new Promise((r) => setTimeout(r, 300 * attempt));
    try {
      const res = await fetch(target.toString(), {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
      });
      lastStatus = res.status;
      const type = res.headers.get("content-type") ?? "";
      if (res.ok && res.body && !type.includes("text/html")) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length) {
          await writeDiskMedia(target.toString(), buf, type || "image/jpeg").catch(() => "");
          return new Response(new Uint8Array(buf), {
            headers: {
              "Content-Type": type || "image/jpeg",
              "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            },
          });
        }
      }
    } catch {
      /* retry */
    }
  }
  return new Response("Upstream failed", { status: lastStatus || 502 });
}

export const Route = createFileRoute("/api/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { runningOnVps, vpsOrLocal, assertAppOrRpc } = await import("@/lib/server/remote");
        if (runningOnVps()) {
          const denied = assertAppOrRpc(request);
          if (denied) return denied;
        }
        const privateResponse = (response: Response) => {
          if (!runningOnVps()) return response;
          const headers = new Headers(response.headers);
          headers.set("Cache-Control", "private, no-store");
          return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
        };
        const byId = new URL(request.url).searchParams.get("id") || "";
        if (byId && /^[a-f0-9]{40}$/i.test(byId)) {
          return privateResponse(await vpsOrLocal(request, () => serveById(byId, request, runningOnVps())));
        }
        const raw = new URL(request.url).searchParams.get("u");
        if (!raw) return new Response("Missing url", { status: 400 });
        let target: URL;
        try {
          target = new URL(raw);
        } catch {
          return new Response("Bad url", { status: 400 });
        }
        if (target.protocol !== "https:" && target.protocol !== "http:") {
          return new Response("Bad protocol", { status: 400 });
        }
        if (!isAllowedMediaHost(target.hostname)) {
          return new Response("Host not allowed", { status: 400 });
        }
        const local = await fetchUpstream(target, request);
        if (local.ok || runningOnVps()) return privateResponse(local);
        return privateResponse(await vpsOrLocal(request, async () => local));
      },
      POST: async ({ request }) => {
        const { runningOnVps, vpsOrLocal, assertRpc } = await import("@/lib/server/remote");
        if (runningOnVps()) {
          const denied = assertRpc(request);
          if (denied) return denied;
        }
        if (!runningOnVps()) return vpsOrLocal(request, async () => new Response("not vps", { status: 400 }));
        const raw = new URL(request.url).searchParams.get("u") || "";
        if (!raw) return Response.json({ error: "missing url" }, { status: 400 });
        try {
          new URL(raw);
        } catch {
          return Response.json({ error: "bad url" }, { status: 400 });
        }
        const buf = Buffer.from(await request.arrayBuffer());
        if (!buf.length) return Response.json({ error: "empty" }, { status: 400 });
        const type = (request.headers.get("content-type") || "image/jpeg").split(";")[0]?.trim() || "image/jpeg";
        const { writeDiskMedia, mediaDiskId } = await import("@/lib/instagram/media-disk.server");
        const id = (await writeDiskMedia(raw, buf, type)) || mediaDiskId(raw);
        if (!id) return Response.json({ error: "write fail" }, { status: 500 });
        return Response.json({ id, path: `/api/media?id=${id}` });
      },
    },
  },
});
