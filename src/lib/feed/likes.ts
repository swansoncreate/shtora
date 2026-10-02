const KEY = "shtora-feed-likes-v1";

function read(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(map: Record<string, boolean>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function isFeedLiked(id: string) {
  return Boolean(read()[id]);
}

export function toggleFeedLike(id: string) {
  const map = read();
  const next = !map[id];
  if (next) map[id] = true;
  else delete map[id];
  write(map);
  return next;
}
