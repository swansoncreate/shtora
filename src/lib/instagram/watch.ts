import { useEffect } from "react";
import { ensureSeenBaseline } from "./unseen";

export function usePinnedWatch(token: string, enabled: boolean, names: string[], _hikerToken = "", _tikhubToken = "") {
  useEffect(() => {
    if (!enabled || !names.length) return;
    names.forEach((n) => ensureSeenBaseline(n));
  }, [enabled, token, names.join("|")]);
}