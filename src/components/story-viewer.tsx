import { Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ImagineBar } from "@/components/imagine-dice";
import { ChatHeartButton } from "@/components/chat-send-button";
import { MediaSaveButton } from "@/components/media-save-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendToChat } from "@/lib/chat/send";
import type { SaveKind } from "@/lib/dropbox/saved";
import type { IgStoryItem } from "@/lib/instagram/types";
import { mediaSrc } from "@/lib/utils";

const IMAGE_MS = 5000;

export function StoryViewer({
  items,
  title,
  subtitle,
  startIndex = 0,
  username,
  kind,
  highlightTitle,
  onClose,
  onNeedToken,
}: {
  items: IgStoryItem[];
  title: string;
  subtitle?: string;
  startIndex?: number;
  username: string;
  kind: SaveKind;
  highlightTitle?: string;
  onClose: () => void;
  onNeedToken?: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [imagineLock, setImagineLock] = useState(false);
  const [muted, setMuted] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const raf = useRef<number>(0);
  const startedAt = useRef(0);
  const elapsed = useRef(0);
  const holdFrom = useRef<number | null>(null);
  const replyInput = useRef<HTMLInputElement | null>(null);
  const item = items[index];

  const frozen = paused || imagineLock;

  const go = useCallback(
    (next: number) => {
      if (imagineLock) return;
      if (next < 0 || next >= items.length) {
        onClose();
        return;
      }
      elapsed.current = 0;
      startedAt.current = performance.now();
      setProgress(0);
      setIndex(next);
    },
    [imagineLock, items.length, onClose],
  );

  useEffect(() => {
    elapsed.current = 0;
    startedAt.current = performance.now();
    setProgress(0);
  }, [index]);

  useEffect(() => {
    if (!item || frozen) return;
    const isVideo = item.mediaType === "video" && Boolean(item.videoUrl);

    const tick = () => {
      const now = performance.now();
      const duration = isVideo
        ? videoRef.current?.duration && Number.isFinite(videoRef.current.duration)
          ? videoRef.current.duration * 1000
          : IMAGE_MS
        : IMAGE_MS;
      const t = elapsed.current + (now - startedAt.current);
      setProgress(Math.min(1, t / duration));
      if (t >= duration) {
        go(index + 1);
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };

    startedAt.current = performance.now();
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [item, frozen, index, go]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (frozen) video.pause();
    else void video.play().catch(() => undefined);
  }, [frozen, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (imagineLock && e.key !== "Escape") return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, onClose, imagineLock]);

  if (!item) return null;
  const image = mediaSrc(item.imageUrl);
  const video = item.mediaType === "video" ? mediaSrc(item.videoUrl || item.imageUrl) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
      <div className="relative flex h-full w-full max-w-md flex-col bg-bg sm:h-[min(100dvh,840px)] sm:max-h-[100dvh] sm:rounded-xl sm:shadow-[var(--shadow-border)]">
        <div className="absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="mb-3 flex gap-1">
            {items.map((it, i) => (
              <div key={it.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-fg/25">
                <div
                  className="h-full bg-fg"
                  style={{
                    width: i < index ? "100%" : i === index ? `${progress * 100}%` : "0%",
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">{title}</p>
              {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
            </div>
            <ChatHeartButton username={username} imageUrl={item.imageUrl} kind="story" />
            <MediaSaveButton
              username={username}
              kind={kind}
              story={item}
              highlightTitle={highlightTitle}
              storyIndex={index}
              onNeedToken={onNeedToken}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-10"
              onClick={() => setPaused((p) => !p)}
              disabled={imagineLock}
              aria-label={paused || imagineLock ? "Продолжить" : "Пауза"}
            >
              {paused || imagineLock ? <Play className="size-4" /> : <Pause className="size-4" />}
            </Button>
            {video ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-10"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Включить звук" : "Выключить звук"}
              >
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" className="size-10" onClick={onClose} aria-label="Закрыть">
              <X className="size-5" />
            </Button>
          </div>
        </div>

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center bg-bg"
          onPointerDown={() => {
            if (imagineLock) return;
            holdFrom.current = performance.now();
            elapsed.current += performance.now() - startedAt.current;
            setPaused(true);
          }}
          onPointerUp={(e) => {
            if (imagineLock) return;
            const held = holdFrom.current ? performance.now() - holdFrom.current : 0;
            holdFrom.current = null;
            startedAt.current = performance.now();
            setPaused(false);
            if (held > 280) return;
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            if (x < rect.width * 0.3) go(index - 1);
            else go(index + 1);
          }}
        >
          {video ? (
            <video
              ref={videoRef}
              key={video}
              src={video}
              poster={image}
              className="h-full w-full object-contain"
              autoPlay
              playsInline
              muted={muted}
              onEnded={() => go(index + 1)}
            />
          ) : image ? (
            <img src={image} alt="" className="h-full w-full object-contain" referrerPolicy="no-referrer" />
          ) : null}
        </div>
        <div onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
          {!video ? (
            <ImagineBar
              mediaUrl={item.imageUrl}
              username={username}
              replyKind="story"
              onNeedToken={onNeedToken}
              onBusy={(next) => {
                setImagineLock(next);
                if (next) setPaused(true);
              }}
            />
          ) : (
            <form
              className="flex gap-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                e.stopPropagation();
                const text = reply.trim();
                if (!text) {
                  toast.error("Напиши ответ — или сердечко сверху");
                  return;
                }
                if (!item.imageUrl || sending) return;
                setSending(true);
                void sendToChat({ username, imageUrl: item.imageUrl, text, kind: "story" })
                  .then(() => {
                    setReply("");
                    toast.success("Ответ на сторис");
                  })
                  .catch((err) => toast.error(err instanceof Error ? err.message : "Не отправилось"))
                  .finally(() => setSending(false));
              }}
            >
              <Input
                ref={replyInput}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onFocus={() => {
                  setPaused(true);
                  setImagineLock(true);
                }}
                onBlur={() => {
                  if (!sending) setImagineLock(false);
                }}
                placeholder="Ответить на сторис"
                maxLength={200}
                disabled={sending}
              />
              <Button type="submit" size="lg" className="h-12 shrink-0 rounded-lg px-4" disabled={sending || !reply.trim()}>
                {sending ? "…" : "Ответ"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
