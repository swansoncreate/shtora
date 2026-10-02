export const VPS_ORIGIN = "https://81-200-157-181.sslip.io";
export const SHTORA_RPC_KEY = "shtora_rpc_b8e41c2a9f6d47e0a1c35d82f0e6b4aa";

export function apiUrl(path: string) {
  if (!path) return path;
  if (path.startsWith("blob:") || path.startsWith("data:")) return path;
  let p = path.trim();
  if (p.startsWith(VPS_ORIGIN)) p = p.slice(VPS_ORIGIN.length) || "/";
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
