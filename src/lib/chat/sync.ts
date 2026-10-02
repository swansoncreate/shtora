import { useEffect } from "react";
import { flushChatsToDisk, hydrateChats, subscribeChats } from "./store";

export function useChatDiskSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let dirty = true;

    const dump = () => {
      if (cancelled || !dirty) return;
      dirty = false;
      void flushChatsToDisk().catch(() => {
        dirty = true;
      });
    };

    void hydrateChats().then(() => {
      if (!cancelled) dump();
    });

    const unsub = subscribeChats(() => {
      dirty = true;
    });
    const tick = window.setInterval(dump, 12_000);
    const onHide = () => {
      dirty = true;
      dump();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);

    return () => {
      cancelled = true;
      unsub();
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      dirty = true;
      dump();
    };
  }, [enabled]);
}
