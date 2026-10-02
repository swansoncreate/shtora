import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tokens")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
          const { readServerConfig } = await import("@/lib/server/config");
          const config = await readServerConfig();
          return Response.json({
            hiker: Boolean(config?.hikerToken && config.hikerToken.length > 8),
            tikhub: Boolean(config?.tikhubToken && config.tikhubToken.length > 8),
            apify: Boolean(config?.apifyToken),
          });
        });
      },
      POST: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
          const { readFile, writeFile } = await import("node:fs/promises");
          const { join } = await import("node:path");
          const { dataRoot } = await import("@/lib/server/data-dir.server");
          let body: Record<string, unknown> = {};
          try {
            body = (await request.json()) as Record<string, unknown>;
          } catch {
            return Response.json({ ok: false }, { status: 400 });
          }
          const path = join(await dataRoot(), "shtora-config.json");
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
          } catch {
            parsed = {};
          }
          const hiker = String(body.hikerToken ?? "").trim();
          const tikhub = String(body.tikhubToken ?? "").trim();
          const apify = String(body.apifyToken ?? "").trim();
          if (hiker.length > 8) parsed.hikerToken = hiker;
          if (tikhub.length > 8) parsed.tikhubToken = tikhub;
          if (apify) parsed.apifyToken = apify;
          parsed.updatedAt = new Date().toISOString();
          await writeFile(path, JSON.stringify(parsed), "utf8");
          return Response.json({
            ok: true,
            hiker: Boolean(parsed.hikerToken && String(parsed.hikerToken).length > 8),
            tikhub: Boolean(parsed.tikhubToken && String(parsed.tikhubToken).length > 8),
          });
        });
      },
    },
  },
});
