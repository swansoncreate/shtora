import { useEffect, useRef } from "react";
import type { ShtoraSettings } from "@/lib/shtora-settings";
import { applyBackgroundResult, persistBackgroundPayload, setupBackgroundSave } from "./background";
import { runAutoSave } from "./engine";

const SIX_HOURS = 6 * 60 * 60 * 1000;

export function useAutoSave(settings: ShtoraSettings, ready: boolean) {
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!ready) return;
    void setupBackgroundSave(settings);
  }, [
    ready,
    settings.autoSave,
    settings.dropboxToken,
    settings.apifyToken,
    settings.hikerToken,
    settings.defaultFolder,
    settings.accountFolders,
  ]);

  useEffect(() => {
    if (!ready || typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; keys?: string[]; log?: string } | undefined;
      if (data?.type !== "shtora-autosave-done") return;
      applyBackgroundResult(Array.isArray(data.keys) ? data.keys : [], data.log);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (!settings.autoSave || (!settings.dropboxToken.trim() && !settings.dropboxRefreshToken.trim())) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      void runAutoSave(settingsRef.current).then(() => {
        void persistBackgroundPayload(settingsRef.current);
      });
    };

    const interval = window.setInterval(tick, SIX_HOURS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [ready, settings.autoSave, settings.dropboxToken, settings.apifyToken, settings.hikerToken]);
}
