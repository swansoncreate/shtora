import { createFileRoute } from "@tanstack/react-router";
import type { AccountSnapshot } from "@/lib/server/snapshots";

export const Route = createFileRoute("/api/state")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { vpsOrLocal } = await import("@/lib/server/remote");
        return vpsOrLocal(request, async () => {
        const [{ readAllDiskThreads }, { listSnapshots, readTickStatus, slimSnapshot }, tick] = await Promise.all([
          import("@/lib/chat/disk.server"),
          import("@/lib/server/snapshots"),
          import("@/lib/server/tick.server"),
        ]);
        tick.ensureTickLoop();
        const [snapshots, chats, status, seed] = await Promise.all([
          listSnapshots(),
          readAllDiskThreads(),
          readTickStatus(),
          import("@/lib/server/read-seed.server").then((m) => m.readBundledSeed()).catch(() => null),
        ]);
        const seedSnaps = seed?.snapshots ?? [];
        const byName = new Map(seedSnaps.map((s) => [s.username.toLowerCase(), s]));
        for (const row of snapshots) byName.set(row.username.toLowerCase(), row);
        return Response.json({
          snapshots: [...byName.values()].map((row) =>
            "at" in row && typeof row.at === "number" ? slimSnapshot(row as AccountSnapshot) : row,
          ),
          chats,
          tickAt: status?.at ?? 0,
          saved: status?.saved ?? 0,
        });
        });
      },
    },
  },
});
