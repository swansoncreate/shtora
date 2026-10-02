import { Heart, LoaderCircle, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commentsFor, replyToComment, subscribeComments, type FeedComment } from "@/lib/feed/comments";
import type { FeedCard } from "@/lib/feed/simulate";
import { cn } from "@/lib/utils";

export function FeedComments({
  card,
  onClose,
}: {
  card: FeedCard;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<FeedComment[]>(() => commentsFor(card.id));
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => subscribeComments(() => setRows(commentsFor(card.id))), [card.id]);
  useEffect(() => {
    setRows(commentsFor(card.id));
    const t = window.setInterval(() => setRows(commentsFor(card.id)), 2000);
    return () => window.clearInterval(t);
  }, [card.id]);

  useEffect(() => {
    const lastUser = [...rows].reverse().find((r) => r.role === "user");
    if (!lastUser) {
      setPending(false);
      return;
    }
    const answered = rows.some((r) => r.role === "owner" && r.at > lastUser.at) || Boolean(lastUser.heart);
    if (answered) setPending(false);
  }, [rows]);

  async function send() {
    const body = text.trim();
    if (!body || pending) return;
    setText("");
    setPending(true);
    try {
      await replyToComment(card.id, card.username, card.caption, body);
    } catch (err) {
      setPending(false);
      toast.error(err instanceof Error ? err.message : "Коммент не ушёл");
    }
  }

  const waiting = pending;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-bg/70" role="dialog" aria-label="Комментарии">
      <button type="button" className="min-h-24 flex-1" aria-label="Закрыть" onClick={onClose} />
      <div className="max-h-[72vh] rounded-t-2xl bg-surface shadow-[var(--shadow-border)]">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-medium text-fg">Комментарии</p>
          <Button type="button" variant="ghost" size="icon" className="size-11" onClick={onClose} aria-label="Закрыть">
            <X className="size-5" />
          </Button>
        </div>
        <div className="max-h-[44vh] space-y-3 overflow-y-auto px-4 pb-3">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Пока тихо. Напиши первой.</p>
          ) : (
            rows.map((row) => (
              <p key={row.id} className="flex items-start gap-2 text-sm leading-relaxed text-fg">
                <span className="min-w-0 flex-1">
                  <span className={cn("mr-1.5 font-medium", row.role === "owner" ? "text-fg" : "text-muted")}>
                    {row.author}
                  </span>
                  <span className="text-muted">{row.text}</span>
                </span>
                {row.heart ? <Heart className="mt-0.5 size-3 shrink-0 fill-danger text-danger" /> : null}
              </p>
            ))
          )}
          {waiting ? (
            <p className="flex items-center gap-2 text-xs text-subtle">
              <LoaderCircle className="size-3.5 animate-spin" />
              скоро ответит
            </p>
          ) : null}
        </div>
        <form
          className="flex gap-2 border-t border-border px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="комментарий"
            maxLength={280}
            aria-label="Комментарий"
          />
          <Button type="submit" variant="subtle" size="icon" className="size-12 shrink-0" disabled={!text.trim() || waiting} aria-label="Отправить">
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
