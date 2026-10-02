import { useSyncExternalStore } from "react";
import { getSaveProgress, subscribeSaveProgress, type SaveProgress } from "./engine";

export function useSaveProgress(): SaveProgress {
  return useSyncExternalStore(subscribeSaveProgress, getSaveProgress, getSaveProgress);
}
