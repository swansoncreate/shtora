import { useEffect } from "react";
import { hydrateChats, listThreads } from "./store";
import { hydrateWorld } from "@/lib/world/sync";

export function useChatDiskSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    void hydrateChats().then(() => hydrateWorld(listThreads().map((row) => row.username)));
  }, [enabled]);
}
