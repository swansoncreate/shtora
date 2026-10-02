export function apiUrl(path: string) {
  if (!path) return path;
  if (path.startsWith("blob:") || path.startsWith("data:")) return path;
  let p = path.trim();
  if (/^https?:\/\//i.test(p)) {
    try {
      const u = new URL(p);
      if (u.pathname.startsWith("/api/") || u.pathname.includes("/chat-media/")) {
        p = `${u.pathname}${u.search}` || "/";
      } else {
        return path;
      }
    } catch {
      return path;
    }
  }
  const chat = p.match(/\/chat-media\/([^/?#]+)/);
  if (chat) return `/api/chat-media?id=${encodeURIComponent(decodeURIComponent(chat[1]))}`;
  if (p.startsWith("/")) return p;
  return p;
}

export function apiHeaders(init?: HeadersInit) {
  return new Headers(init);
}

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), init);
}
