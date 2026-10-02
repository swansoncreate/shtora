export function isPlayableMediaUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || !/^https?:\/\//i.test(raw)) return false;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (host === "instagram.com" || host === "www.instagram.com") return false;
    if (/\.(jpe?g|png|webp|gif|mp4|m4v|mov|webm)(\?|$)/i.test(path)) return true;
    return (
      host.includes("cdninstagram") ||
      host.includes("fbcdn") ||
      host.includes("fbsbx") ||
      host.includes("scontent") ||
      host.includes("hikerapi") ||
      host.includes("instagrapi") ||
      host.includes("dropbox") ||
      host.includes("x.ai") ||
      host.includes("grok.com") ||
      host.includes("fal.ai") ||
      host.includes("fal.media") ||
      host.includes("fal.run") ||
      host.endsWith(".facebook.com")
    );
  } catch {
    return false;
  }
}

export function isVideoMediaUrl(url?: string | null) {
  if (!url) return false;
  const lower = url.toLowerCase();
  const path = lower.split("?")[0] || "";
  if (/\.(mp4|m4v|mov|webm)$/.test(path)) return true;
  if (path.includes("/o1/v/") || path.includes("/t2/f2/") || path.includes("/video")) return true;
  if (lower.includes("mime_type=video") || lower.includes("media_type=video")) return true;
  return false;
}
