import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { apiUrl } from "@/lib/shtora-origin";
import { isPlayableMediaUrl } from "@/lib/instagram/media-url";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function cleanUsername(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^@+/, "");
  s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
  s = s.split(/[/?#]/)[0] ?? s;
  s = s.replace(/[^a-zA-Z0-9._]/g, "");
  return s;
}

export function formatCount(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs < 1000) return `${sign}${abs}`;
  if (abs < 1_000_000) {
    const v = abs / 1000;
    const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(1);
    return `${sign}${s.replace(/\.0$/, "")} тыс.`;
  }
  const v = abs / 1_000_000;
  const s = v >= 100 ? v.toFixed(0) : v.toFixed(1);
  return `${sign}${s.replace(/\.0$/, "")} млн`;
}

export function mediaSrc(url: string | null | undefined, opts?: { proxy?: boolean }): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  if (import.meta.env.VITE_STATIC_PREVIEW === "1" && /^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/") || /\/chat-media\//.test(url) || /^https?:\/\//i.test(url)) {
    const rewritten = apiUrl(url);
    if (rewritten.startsWith("/api/") || rewritten.startsWith("/chat-media")) return rewritten;
  }
  if (url.startsWith("/")) return apiUrl(url);
  try {
    const host = new URL(url).hostname.toLowerCase();
    const ig =
      host.includes("cdninstagram") ||
      host.includes("fbcdn") ||
      host.includes("scontent") ||
      host.endsWith(".instagram.com") ||
      host === "instagram.com" ||
      host === "www.instagram.com";
    if (ig || opts?.proxy) return apiUrl(`/api/media?u=${encodeURIComponent(url)}`);
  } catch {
    return apiUrl(`/api/media?u=${encodeURIComponent(url)}`);
  }
  if (isPlayableMediaUrl(url)) return url;
  return apiUrl(`/api/media?u=${encodeURIComponent(url)}`);
}
