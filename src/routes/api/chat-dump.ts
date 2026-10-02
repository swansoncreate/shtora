import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/chat-dump")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false }, { status: 400 });
        }
        const rec = body && typeof body === "object" ? (body as { thread?: unknown; threads?: unknown }) : {};
        const list = Array.isArray(rec.threads)
          ? rec.threads
          : rec.thread
            ? [rec.thread]
            : body && typeof body === "object" && "username" in (body as object)
              ? [body]
              : [];
        const threads = list.filter((t): t is import("@/lib/chat/disk").DiskThread => Boolean(t && typeof t === "object" && (t as { username?: string }).username));
        if (!threads.length) return Response.json({ ok: false }, { status: 400 });
        const { writeDiskThreads } = await import("@/lib/chat/disk.server");
        await writeDiskThreads(threads);
        return Response.json({ ok: true, n: threads.length });
        });
      },
      GET: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
        const { readAllDiskThreads } = await import("@/lib/chat/disk.server");
        const threads = await readAllDiskThreads();
        return Response.json({
          ok: true,
          n: threads.length,
          users: threads.map((t) => t.username),
        });
        });
      },
      DELETE: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
        let names: string[] = [];
        try {
          const body = (await request.json()) as { usernames?: unknown };
          names = Array.isArray(body.usernames)
            ? body.usernames.filter((n): n is string => typeof n === "string" && Boolean(n.trim()))
            : [];
        } catch {
          return Response.json({ ok: false }, { status: 400 });
        }
        const { eraseDiskUsers } = await import("@/lib/chat/disk.server");
        await eraseDiskUsers(names);
        return Response.json({ ok: true });
        });
      },
    },
  },
});
