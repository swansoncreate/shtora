import { useEffect } from "react";
import { hydrateChats } from "./store";

export function useChatDiskSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    void hydrateChats();
  }, [enabled]);
}
