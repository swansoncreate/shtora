import { getCachedProfile } from "@/lib/instagram/cache";
import { persistChatImage } from "@/lib/instagram/media-cache";
import { appendMessage, ensureThread, getThread, type ChatKind } from "./store";

export const CHAT_OPEN_EVENT = "shtora-open-chat";

export function requestOpenChat(username: string) {
  window.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT, { detail: { username: username.trim().toLowerCase() } }));
}

export async function sendToChat(opts: {
  username: string;
  imageUrl?: string;
  text?: string;
  kind?: ChatKind;
  heart?: boolean;
}) {
  const username = opts.username.trim().replace(/^@/, "").toLowerCase();
  if (!username || username === "dropbox") throw new Error("Некому отправить");
  const profile = getCachedProfile(username)?.data;
  await ensureThread({
    username,
    fullName: profile?.fullName,
    avatar: profile?.profilePicUrl,
  });
  const kind = opts.kind ?? (opts.heart ? "heart" : opts.imageUrl ? "photo" : "text");
  await appendMessage(username, {
    role: "user",
    text: (opts.text ?? "").trim(),
    imageUrl: opts.imageUrl,
    kind,
    heartByUser: Boolean(opts.heart),
  });
  requestOpenChat(username);
}

export async function noticeFeedLike(opts: { username: string; imageUrl?: string; caption?: string }) {
  const username = opts.username.trim().replace(/^@/, "").toLowerCase();
  if (!username || username === "dropbox") return;
  const profile = getCachedProfile(username)?.data;
  await ensureThread({
    username,
    fullName: profile?.fullName || username,
    avatar: profile?.profilePicUrl,
  });
  const thumb = opts.imageUrl ? await persistChatImage(opts.imageUrl).catch(() => opts.imageUrl) : undefined;
  const thread = getThread(username);
  const recent = (thread?.messages ?? []).slice(-8).some(
    (m) =>
      m.role === "user" &&
      (m.kind === "heart" || m.kind === "post") &&
      (m.imageUrl === thumb || m.imageUrl === opts.imageUrl) &&
      Date.now() - m.at < 6 * 3600_000,
  );
  if (recent) return;
  await appendMessage(username, {
    role: "user",
    text: "",
    imageUrl: thumb,
    kind: "post",
    heartByUser: true,
  });
}
