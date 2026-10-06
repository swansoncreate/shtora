import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/rpc")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const { corsHeaders } = await import("@/lib/server/remote");
        return new Response(null, { status: 204, headers: corsHeaders(request, "GET, POST, OPTIONS") });
      },
      POST: async ({ request }) => {
        const { assertRpc, withCors } = await import("@/lib/server/remote");
        const denied = assertRpc(request);
        if (denied) return withCors(denied, request, "GET, POST, OPTIONS");
        let body: { name?: string; data?: unknown } = {};
        try {
          body = (await request.json()) as { name?: string; data?: unknown };
        } catch {
          return Response.json({ error: "bad json" }, { status: 400 });
        }
        const name = String(body.name || "");
        const data = body.data ?? {};
        try {
          const result = await dispatch(name, data);
          return Response.json(result ?? { ok: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "rpc fail";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});

async function dispatch(name: string, data: unknown) {
  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  switch (name) {
    case "ig.profile": {
      const { handleProfile } = await import("@/lib/instagram/rpc.server");
      return handleProfile(row as Parameters<typeof handleProfile>[0]);
    }
    case "ig.stories": {
      const { handleStories } = await import("@/lib/instagram/rpc.server");
      return handleStories(row as Parameters<typeof handleStories>[0]);
    }
    case "ig.snapshot": {
      const { handleSnapshot } = await import("@/lib/instagram/rpc.server");
      return handleSnapshot(String(row.username || ""));
    }
    case "ig.highlight": {
      const { handleHighlight } = await import("@/lib/instagram/rpc.server");
      return handleHighlight(row as Parameters<typeof handleHighlight>[0]);
    }
    case "ig.warm": {
      const { handleWarm } = await import("@/lib/instagram/rpc.server");
      return handleWarm(row as Parameters<typeof handleWarm>[0]);
    }
    case "ig.probeTikhub": {
      const { probeTikhub } = await import("@/lib/instagram/engine/tikhub");
      return probeTikhub(String(row.token || ""));
    }
    case "dbx.account": {
      const { dropboxWithRefresh } = await import("@/lib/dropbox/live.server");
      const { getDropboxAccount } = await import("@/lib/dropbox/dropbox.server");
      return dropboxWithRefresh(String(row.token || ""), (token) => getDropboxAccount(token));
    }
    case "dbx.folders": {
      const { dropboxWithRefresh } = await import("@/lib/dropbox/live.server");
      const { listDropboxFolders } = await import("@/lib/dropbox/dropbox.server");
      return dropboxWithRefresh(String(row.token || ""), (token) => listDropboxFolders(token, String(row.path ?? "")));
    }
    case "dbx.entries": {
      const { dropboxWithRefresh } = await import("@/lib/dropbox/live.server");
      const { listDropboxEntries } = await import("@/lib/dropbox/dropbox.server");
      return dropboxWithRefresh(String(row.token || ""), (token) => listDropboxEntries(token, String(row.path ?? "/")));
    }
    case "dbx.feed": {
      const { dropboxWithRefresh } = await import("@/lib/dropbox/live.server");
      const { listDropboxMediaDeep } = await import("@/lib/dropbox/dropbox.server");
      return dropboxWithRefresh(String(row.token || ""), async (token) => ({
        files: await listDropboxMediaDeep(token, String(row.path || "/"), 80),
      }));
    }
    case "dbx.thumbs": {
      const { dropboxWithRefresh } = await import("@/lib/dropbox/live.server");
      const { getDropboxThumbnails } = await import("@/lib/dropbox/dropbox.server");
      return dropboxWithRefresh(String(row.token || ""), (token) =>
        getDropboxThumbnails(
          token,
          Array.isArray(row.paths) ? (row.paths as string[]) : [],
          (row.size as "w256h256" | "w640h480" | "w1024h768") ?? "w256h256",
        ),
      );
    }
    case "dbx.link": {
      const { dropboxWithRefresh } = await import("@/lib/dropbox/live.server");
      const { getDropboxTemporaryLink } = await import("@/lib/dropbox/dropbox.server");
      return dropboxWithRefresh(String(row.token || ""), (token) => getDropboxTemporaryLink(token, String(row.path || "")));
    }
    case "dbx.ensure": {
      const { dropboxWithRefresh } = await import("@/lib/dropbox/live.server");
      const { ensureDropboxFolder } = await import("@/lib/dropbox/dropbox.server");
      return dropboxWithRefresh(String(row.token || ""), async (token) => ({
        path: await ensureDropboxFolder(token, String(row.path || "")),
      }));
    }
    case "dbx.upload": {
      const { dropboxWithRefresh } = await import("@/lib/dropbox/live.server");
      const { uploadMediaToDropbox } = await import("@/lib/dropbox/dropbox.server");
      return dropboxWithRefresh(String(row.token || ""), (token) =>
        uploadMediaToDropbox({
          token,
          destPath: String(row.destPath || ""),
          mediaUrl: String(row.mediaUrl || ""),
        }),
      );
    }
    case "dbx.exchange": {
      const { exchangeDropboxCode } = await import("@/lib/dropbox/oauth.server");
      const tokens = await exchangeDropboxCode(row as Parameters<typeof exchangeDropboxCode>[0]);
      const { patchServerConfig } = await import("@/lib/server/config");
      await patchServerConfig({
        dropboxToken: tokens.accessToken,
        dropboxRefreshToken: tokens.refreshToken,
        dropboxTokenExpiresAt: tokens.expiresAt,
      }).catch(() => undefined);
      return tokens;
    }
    case "dbx.refresh": {
      const { refreshDropboxAccess } = await import("@/lib/dropbox/oauth.server");
      const tokens = await refreshDropboxAccess(row as Parameters<typeof refreshDropboxAccess>[0]);
      const { patchServerConfig } = await import("@/lib/server/config");
      await patchServerConfig({
        dropboxToken: tokens.accessToken,
        dropboxRefreshToken: tokens.refreshToken,
        dropboxTokenExpiresAt: tokens.expiresAt,
      }).catch(() => undefined);
      return tokens;
    }
    case "dbx.delete": {
      const { dropboxWithRefresh } = await import("@/lib/dropbox/live.server");
      const { deleteDropboxPath } = await import("@/lib/dropbox/dropbox.server");
      return dropboxWithRefresh(String(row.token || ""), (token) => deleteDropboxPath(token, String(row.path || "")));
    }
    case "dbx.move": {
      const { dropboxWithRefresh } = await import("@/lib/dropbox/live.server");
      const { moveDropboxPath } = await import("@/lib/dropbox/dropbox.server");
      return dropboxWithRefresh(String(row.token || ""), (token) =>
        moveDropboxPath(token, String(row.from || ""), String(row.toFolder || "")),
      );
    }
    case "dbx.deleteMany": {
      const { dropboxWithRefresh } = await import("@/lib/dropbox/live.server");
      const { deleteDropboxPaths } = await import("@/lib/dropbox/dropbox.server");
      return dropboxWithRefresh(String(row.token || ""), (token) =>
        deleteDropboxPaths(token, Array.isArray(row.paths) ? (row.paths as string[]) : []),
      );
    }
    case "dbx.moveMany": {
      const { dropboxWithRefresh } = await import("@/lib/dropbox/live.server");
      const { moveDropboxPaths } = await import("@/lib/dropbox/dropbox.server");
      return dropboxWithRefresh(String(row.token || ""), (token) =>
        moveDropboxPaths(
          token,
          Array.isArray(row.from) ? (row.from as string[]) : [],
          String(row.toFolder || ""),
        ),
      );
    }
    case "dbx.photoMarks": {
      const { dropboxWithRefresh } = await import("@/lib/dropbox/live.server");
      const { readShtoraPhotoMarks } = await import("@/lib/dropbox/dropbox.server");
      return dropboxWithRefresh(String(row.token || ""), (token) =>
        readShtoraPhotoMarks(token, Array.isArray(row.paths) ? (row.paths as string[]) : []),
      );
    }
    case "dbx.photoMarkSet": {
      const { dropboxWithRefresh } = await import("@/lib/dropbox/live.server");
      const { setShtoraPhotoMarks } = await import("@/lib/dropbox/dropbox.server");
      return dropboxWithRefresh(String(row.token || ""), (token) =>
        setShtoraPhotoMarks(token, Array.isArray(row.paths) ? (row.paths as string[]) : [], row.tagged === true),
      );
    }
    case "chat.dump": {
      const { writeDiskThread } = await import("@/lib/chat/disk.server");
      const thread = (row as { thread?: import("@/lib/chat/disk").DiskThread }).thread;
      if (thread) await writeDiskThread(thread);
      return { ok: true };
    }
    case "chat.list": {
      const { readAllDiskThreads } = await import("@/lib/chat/disk.server");
      return { threads: await readAllDiskThreads() };
    }
    case "chat.erase": {
      const { eraseDiskUsers } = await import("@/lib/chat/disk.server");
      await eraseDiskUsers(Array.isArray(row.usernames) ? (row.usernames as string[]) : []);
      return { ok: true };
    }
    case "studio.list": {
      const { readStudioIndex } = await import("@/lib/imagine/studio.server");
      return readStudioIndex();
    }
    case "studio.save": {
      const { saveStudioItem } = await import("@/lib/imagine/studio.server");
      return saveStudioItem(row as Parameters<typeof saveStudioItem>[0]);
    }
    case "studio.drop": {
      const { dropStudioItem } = await import("@/lib/imagine/studio.server");
      await dropStudioItem(String(row.id || ""));
      return { ok: true };
    }
    case "feed.list": {
      const { listFeed } = await import("@/lib/feed/disk.server");
      const username = typeof row.username === "string" ? row.username : undefined;
      return listFeed(username);
    }
    case "feed.append": {
      const { appendFeed } = await import("@/lib/feed/disk.server");
      return appendFeed(row.card ?? row);
    }
    case "feed.like": {
      const { likeFeed } = await import("@/lib/feed/disk.server");
      return likeFeed(String(row.id || ""), row.on === true);
    }
    case "world.get": {
      const { getWorld } = await import("@/lib/world/disk.server");
      return getWorld(String(row.username || ""));
    }
    case "world.commit": {
      const { commitWorld } = await import("@/lib/world/disk.server");
      const patch = row.patch && typeof row.patch === "object" ? (row.patch as Record<string, unknown>) : {};
      const event = row.event && typeof row.event === "object" ? (row.event as Record<string, unknown>) : undefined;
      return commitWorld(String(row.username || ""), patch, event as never);
    }
    case "visual.memory.save": {
      const { saveVisualMemory } = await import("@/lib/visual/memory.server");
      return saveVisualMemory(row as import("@/lib/visual/types").VisualMemory);
    }
    case "visual.memory.list": {
      const { listVisualMemory } = await import("@/lib/visual/memory.server");
      return { memories: await listVisualMemory(String(row.username || ""), String(row.query || "")) };
    }
    case "visual.job.create": {
      const { createGenerationJob } = await import("@/lib/visual/jobs.server");
      return createGenerationJob(row.job as Parameters<typeof createGenerationJob>[0]);
    }
    case "visual.job.update": {
      const { updateGenerationJob } = await import("@/lib/visual/jobs.server");
      return updateGenerationJob(String(row.username || ""), String(row.id || ""), (row.patch || {}) as Parameters<typeof updateGenerationJob>[2]);
    }
    case "visual.job.list": {
      const { listGenerationJobs } = await import("@/lib/visual/jobs.server");
      return { jobs: await listGenerationJobs(String(row.username || "")) };
    }
    case "story.seen": {
      const { recordStorySeen } = await import("@/lib/instagram/seen.server");
      const ids = Array.isArray(row.ids) ? row.ids.filter((id): id is string => typeof id === "string") : [];
      return recordStorySeen(String(row.username || ""), ids);
    }
    case "story.seenList": {
      const { listStorySeen } = await import("@/lib/instagram/seen.server");
      const username = typeof row.username === "string" ? row.username : undefined;
      return listStorySeen(username);
    }
    default:
      throw new Error(`unknown rpc ${name}`);
  }
}
