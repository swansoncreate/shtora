import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/autosave-config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
        const { readServerConfig } = await import("@/lib/server/config");
        const config = await readServerConfig();
        if (!config) return Response.json({ ok: true, empty: true });
        return Response.json({ ok: true, ...config });
        });
      },
      POST: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
        const { writeFile, readFile } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const { dataRoot } = await import("@/lib/server/data-dir.server");
        const CONFIG_PATH = join(await dataRoot(), "shtora-config.json");
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Нет настроек." }, { status: 400 });
        }
        let existing: Record<string, unknown> = {};
        try {
          existing = JSON.parse(await readFile(CONFIG_PATH, "utf8")) as Record<string, unknown>;
        } catch {
          existing = {};
        }
        const keep = (key: string) => {
          const v = String(body[key] ?? "").trim();
          const old = String(existing[key] ?? "").trim();
          return v || old;
        };
        const dropboxToken = keep("dropboxToken");
        const apifyToken = keep("apifyToken");
        const hikerToken = keep("hikerToken");
        const tikhubToken = keep("tikhubToken");
        const accountFolders: Record<string, string> = {};
        const folderSrc =
          body.accountFolders && typeof body.accountFolders === "object" && Object.keys(body.accountFolders as object).length
            ? (body.accountFolders as Record<string, unknown>)
            : (existing.accountFolders as Record<string, unknown> | undefined) || {};
        for (const [name, value] of Object.entries(folderSrc)) {
          if (typeof value === "string" && name.trim()) accountFolders[name.trim().toLowerCase()] = value;
        }
        const rawFav = Array.isArray(body.favorites) ? body.favorites.filter((name): name is string => typeof name === "string") : [];
        const oldFav = Array.isArray(existing.favorites)
          ? existing.favorites.filter((name): name is string => typeof name === "string")
          : [];
        const favorites = (rawFav.length ? rawFav : oldFav).map((n) => n.trim().toLowerCase()).filter(Boolean);
        const payload = {
          ...existing,
          apifyToken,
          hikerToken,
          tikhubToken,
          dropboxToken,
          dropboxRefreshToken: keep("dropboxRefreshToken"),
          dropboxAppKey: keep("dropboxAppKey"),
          dropboxAppSecret: keep("dropboxAppSecret"),
          dropboxTokenExpiresAt:
            typeof body.dropboxTokenExpiresAt === "number" && Number.isFinite(body.dropboxTokenExpiresAt)
              ? body.dropboxTokenExpiresAt
              : typeof existing.dropboxTokenExpiresAt === "number"
                ? existing.dropboxTokenExpiresAt
                : 0,
          defaultFolder: String(body.defaultFolder ?? existing.defaultFolder ?? "/Штора"),
          accountFolders: Object.keys(accountFolders).length
            ? accountFolders
            : (existing.accountFolders as Record<string, string>) || {},
          favorites,
          autoSave: body.autoSave !== false,
          savedFiles: Array.isArray(body.savedFiles)
            ? body.savedFiles.filter((id): id is string => typeof id === "string")
            : Array.isArray(existing.savedFiles)
              ? existing.savedFiles
              : [],
          chatEngine: body.chatEngine === "claude" || body.chatEngine === "grok" ? body.chatEngine : existing.chatEngine || "grok",
          chatApiKey: String(body.chatApiKey ?? existing.chatApiKey ?? ""),
          chatModel: String(body.chatModel ?? existing.chatModel ?? ""),
          imaginePrompt: String(body.imaginePrompt ?? existing.imaginePrompt ?? ""),
          updatedAt: new Date().toISOString(),
        };
        await writeFile(CONFIG_PATH, JSON.stringify(payload), "utf8");
        return Response.json({ ok: true });
        });
      },
    },
  },
});
