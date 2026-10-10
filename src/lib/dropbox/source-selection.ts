export type DropboxCandidate = { path: string; at: string };

/**
 * Prefer paths not used in recent generations. When every candidate is excluded,
 * return the least-recently-used candidates first instead of silently reverting
 * to an unfiltered random pool (which causes repeated Dropbox photos).
 */
export function rankDropboxCandidates<T extends DropboxCandidate>(
  candidates: T[],
  excludedPaths: string[],
): { candidates: T[]; exhaustedExclusions: boolean } {
  const recent = excludedPaths.map((path) => path.trim().toLowerCase()).filter(Boolean);
  const excluded = new Set(recent);
  const fresh = candidates.filter((item) => !excluded.has(item.path.trim().toLowerCase()));
  if (fresh.length) return { candidates: fresh, exhaustedExclusions: false };

  const recentIndex = new Map(recent.map((path, index) => [path, index]));
  const ordered = [...candidates].sort((a, b) => {
    const aIndex = recentIndex.get(a.path.trim().toLowerCase()) ?? -1;
    const bIndex = recentIndex.get(b.path.trim().toLowerCase()) ?? -1;
    if (aIndex !== bIndex) return bIndex - aIndex;
    return a.at.localeCompare(b.at);
  });
  return { candidates: ordered, exhaustedExclusions: true };
}
