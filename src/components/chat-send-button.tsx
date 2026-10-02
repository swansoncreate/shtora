import { Heart, LoaderCircle, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendToChat } from "@/lib/chat/send";
import type { ChatKind } from "@/lib/chat/store";

export function ChatSendButton({
  username,
  imageUrl,
  text,
  kind,
  disabled,
}: {
  username: string;
  imageUrl?: string | null;
  text?: string;
  kind?: ChatKind;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  if (!username || username === "dropbox") return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-10"
      aria-label={kind === "story" ? "Ответить на сторис" : "Отправить в чат"}
      disabled={disabled || busy || !imageUrl}
      onClick={() => {
        if (!imageUrl) return;
        setBusy(true);
        void sendToChat({ username, imageUrl, text, kind: kind ?? "photo" })
          .then(() => toast.success(kind === "story" ? "Ответ на сторис" : "Отправлено в чат"))
          .catch((err) => toast.error(err instanceof Error ? err.message : "Не отправилось"))
          .finally(() => setBusy(false));
      }}
    >
      {busy ? <LoaderCircle className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
    </Button>
  );
}

export function ChatHeartButton({
  username,
  imageUrl,
  kind,
  disabled,
}: {
  username: string;
  imageUrl?: string | null;
  kind?: ChatKind;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  if (!username || username === "dropbox") return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-10"
      aria-label="Сердечко"
      disabled={disabled || busy}
      onClick={() => {
        setBusy(true);
        void sendToChat({ username, imageUrl: imageUrl || undefined, kind: kind ?? "heart", heart: true })
          .then(() => toast.success("❤️"))
          .catch((err) => toast.error(err instanceof Error ? err.message : "Не отправилось"))
          .finally(() => setBusy(false));
      }}
    >
      {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Heart className="size-4" />}
    </Button>
  );
}
