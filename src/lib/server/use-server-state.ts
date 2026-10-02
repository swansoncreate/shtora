import { useEffect, useRef } from "react";
import { applyRemoteThreads } from "@/lib/chat/store";
import { catchUpChats } from "@/lib/chat/engine";
import { applyStateSnapshots, loadShtoraState } from "@/lib/shtora-state";
import { ensureSeenBaseline, migrateHighlightSeen } from "@/lib/instagram/unseen";
import { noteServerSave } from "@/lib/dropbox/saved";
import { apiFetch } from "@/lib/shtora-origin";

export function useServerState(ready: boolean) {
  const ticking = useRef(false);
  const seenTick = useRef(0);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function pull(andTick: boolean) {
      try {
        if (typeof window !== "undefined" && /\.grok\.me$/i.test(window.location.hostname)) {
          void apiFetch("/api/grok-origin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ origin: window.location.origin }),
          }).catch(() => undefined);
        }
        const data = await loadShtoraState();
        if (cancelled) return;
        if (data.tickAt !== seenTick.current) {
          seenTick.current = data.tickAt;
          applyStateSnapshots(data.snapshots);
          for (const snap of data.snapshots) {
            ensureSeenBaseline(snap.username);
            migrateHighlightSeen(snap.username);
          }
        }
        if (data.chats?.length) {
          await applyRemoteThreads(data.chats as Parameters<typeof applyRemoteThreads>[0]);
          catchUpChats();
        }
        if (data.saved > 0) noteServerSave(data.tickAt, data.saved);
        const age = Date.now() - (data.tickAt ?? 0);
        const stale = !data.snapshots.length || age > 20 * 60 * 60 * 1000;
        if (andTick && stale && !ticking.current) {
          ticking.current = true;
          void apiFetch("/api/tick", { method: "POST" })
            .then((r) => r.json())
            .then(async (next: { snapshots?: typeof data.snapshots; chats?: typeof data.chats }) => {
              if (cancelled) return;
              if (next.snapshots) applyStateSnapshots(next.snapshots);
              if (next.chats?.length) await applyRemoteThreads(next.chats as Parameters<typeof applyRemoteThreads>[0]);
            })
            .catch(() => undefined)
            .finally(() => {
              ticking.current = false;
            });
        }
      } catch {
        /* ignore */
      }
    }

    void pull(true);
    const onFocus = () => {
      void pull(false);
    };
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(() => {
      void pull(false);
    }, 5 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [ready]);
}
