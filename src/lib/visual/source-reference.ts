import type { VisualMemory } from "./types";

export function resolveContinuationMemory(
  memories: VisualMemory[],
  sourceImageUrl?: string,
  sceneId?: string,
): VisualMemory | undefined {
  const sourceMatch = sourceImageUrl
    ? memories.find((item) => item.imageUrl === sourceImageUrl)
    : undefined;
  if (sourceMatch) return sourceMatch;
  return sceneId ? memories.find((item) => item.sceneId === sceneId) : undefined;
}
