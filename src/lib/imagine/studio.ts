export type StudioItem = {
  id: string;
  kind: "image" | "video";
  url: string;
  urls?: string[];
  from: string;
  at: number;
  prompt?: string;
};

const KEY = "shtora-studio-results";

function publicUrl(url: string) {
  const raw = (url || "").trim();
  if (!raw || raw.startsWith("blob:") || raw.startsWith("data:")) return raw;
  if (raw.startsWith("/chat-media/")) return raw;
  const q = raw.match(/[?&]id=([^&]+)/);
  if (q?.[1] && raw.includes("chat-media")) return `/chat-media/${decodeURIComponent(q[1])}`;
  return raw;
}

export function readStudioLocal(): StudioItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StudioItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item?.id && item.url && !item.url.startsWith("blob:"))
      .map((item) => ({
        ...item,
        url: publicUrl(item.url),
        urls: item.urls?.map(publicUrl).filter(Boolean),
      }))
      .slice(0, 80);
  } catch {
    return [];
  }
}

export function writeStudioLocal(items: StudioItem[]) {
  const slim = items
    .filter((item) => item.url && !item.url.startsWith("blob:") && !item.url.startsWith("data:"))
    .slice(0, 80);
  if (!slim.length) {
    const prev = readStudioLocal();
    if (prev.length) return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(slim.length ? slim : items.slice(0, 24)));
  } catch {
    try {
      localStorage.setItem(KEY, JSON.stringify(slim.slice(0, 16)));
    } catch {
      /* full */
    }
  }
}

export function mergeStudio(local: StudioItem[], remote: StudioItem[]) {
  const map = new Map<string, StudioItem>();
  for (const item of [...remote, ...local]) {
    const key = item.id || item.url;
    const prev = map.get(key);
    if (!prev || item.at > prev.at) map.set(key, { ...item, url: publicUrl(item.url), urls: item.urls?.map(publicUrl) });
  }
  return [...map.values()].sort((a, b) => b.at - a.at).slice(0, 80);
}
