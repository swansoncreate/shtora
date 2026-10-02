import { useSyncExternalStore } from "react";
import { getSavedVersion, isFileSaved, subscribeSaved, type SaveKind } from "./saved";

export function useIsSaved(username: string, kind: SaveKind, id: string, slide = 0): boolean {
  const version = useSyncExternalStore(subscribeSaved, getSavedVersion, () => 0);
  void version;
  return isFileSaved(username, kind, id, slide);
}
