export function isAllowedMediaHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "instagram.com" ||
    h.endsWith(".instagram.com") ||
    h === "cdninstagram.com" ||
    h.endsWith(".cdninstagram.com") ||
    h.endsWith(".fbcdn.net") ||
    h.includes(".fbcdn.") ||
    h.endsWith(".facebook.com") ||
    h.endsWith(".fbsbx.com") ||
    h.endsWith(".apify.com") ||
    h.endsWith(".apifyusercontent.com") ||
    h.endsWith(".dropbox.com") ||
    h.endsWith(".dropboxusercontent.com") ||
    h === "dropbox.com" ||
    h === "hikerapi.com" ||
    h.endsWith(".hikerapi.com") ||
    h === "instagrapi.com" ||
    h.endsWith(".instagrapi.com") ||
    h === "x.ai" ||
    h.endsWith(".x.ai") ||
    h === "grok.com" ||
    h.endsWith(".grok.com") ||
    h === "fal.ai" ||
    h.endsWith(".fal.ai") ||
    h === "fal.media" ||
    h.endsWith(".fal.media") ||
    h === "fal.run" ||
    h.endsWith(".fal.run") ||
    h.includes("scontent") ||
    /^scontent[a-z0-9.-]*\.(cdninstagram\.com|xx\.fbcdn\.net|fbcdn\.net)$/.test(h)
  );
}

export function isInstagramHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "instagram.com" ||
    h.endsWith(".instagram.com") ||
    h === "cdninstagram.com" ||
    h.endsWith(".cdninstagram.com") ||
    h.endsWith(".fbcdn.net") ||
    h.endsWith(".facebook.com") ||
    /^scontent[a-z0-9.-]*\.(cdninstagram\.com|xx\.fbcdn\.net|fbcdn\.net)$/.test(h)
  );
}

export const IG_FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  Accept: "image/avif,image/webp,image/*,video/*,*/*;q=0.8",
  Referer: "https://www.instagram.com/",
};

export function mediaFetchHeaders(hostname: string): Record<string, string> {
  if (isInstagramHost(hostname)) return IG_FETCH_HEADERS;
  return {
    Accept: "image/avif,image/webp,image/*,video/*,*/*;q=0.8",
  };
}
