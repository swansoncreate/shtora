import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ChatHeartButton, ChatSendButton } from "@/components/chat-send-button";
import { ImagineBar } from "@/components/imagine-dice";
import { MediaSaveButton } from "@/components/media-save-button";
import { Button } from "@/components/ui/button";
import type { IgPost } from "@/lib/instagram/types";
import { isVideoMediaUrl } from "@/lib/instagram/media-url";
import { cn, mediaSrc } from "@/lib/utils";

export function PostViewer({
  posts,
  index,
  username,
  onClose,
  onIndex,
  onNeedToken,
  frame = "contain",
}: {
  posts: IgPost[];
  index: number;
  username: string;
  onClose: () => void;
  onIndex: (i: number) => void;
  onNeedToken?: () => void;
  frame?: "contain" | "feed";
}) {
  const post = posts[index];
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    setSlide(0);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") {
        const p = posts[index];
        if (p && slide < p.slides.length - 1) setSlide(slide + 1);
        else if (index < posts.length - 1) onIndex(index + 1);
      }
      if (e.key === "ArrowLeft") {
        if (slide > 0) setSlide(slide - 1);
        else if (index > 0) onIndex(index - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, slide, posts, onClose, onIndex]);

  if (!post) return null;
  const current = post.slides[slide] ?? post.slides[0];
  const posterRaw =
    current?.displayUrl && !isVideoMediaUrl(current.displayUrl) ? current.displayUrl : post.displayUrl;
  const poster = posterRaw && !isVideoMediaUrl(posterRaw) ? mediaSrc(posterRaw) : undefined;
  const videoRaw =
    current?.videoUrl ||
    (current?.type === "video" ? current.displayUrl : undefined) ||
    post.videoUrl ||
    (isVideoMediaUrl(current?.displayUrl) ? current?.displayUrl : undefined);
  const video = videoRaw ? mediaSrc(videoRaw) : undefined;
  const src = !video ? mediaSrc(current?.displayUrl || post.displayUrl) : undefined;
  const fit = frame === "feed" ? "aspect-[4/5] w-full max-w-md object-cover" : "max-h-full max-w-full rounded-md object-contain";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg/95" role="dialog" aria-modal="true">
      <header className="flex items-center justify-between px-3 py-3 sm:px-5">
        <p className="tabular text-sm text-muted">
          {index + 1} / {posts.length}
        </p>
        <div className="flex items-center gap-1">
          <ChatHeartButton username={username} imageUrl={current?.displayUrl} kind="post" />
          <ChatSendButton username={username} imageUrl={current?.displayUrl} kind="post" />
          <MediaSaveButton
            username={username}
            kind="post"
            post={post}
            slide={slide}
            onNeedToken={onNeedToken}
          />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть">
            <X className="size-5" />
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        {index > 0 || slide > 0 ? (
          <button
            type="button"
            className="absolute left-1 z-10 flex size-11 items-center justify-center rounded-full bg-surface/80 text-fg sm:left-4"
            aria-label="Назад"
            onClick={() => {
              if (slide > 0) setSlide(slide - 1);
              else onIndex(index - 1);
            }}
          >
            <ChevronLeft className="size-5" />
          </button>
        ) : null}

        {video ? (
          <video
            key={video}
            src={video}
            poster={poster}
            className={fit}
            controls
            playsInline
            autoPlay
            preload="auto"
          />
        ) : src ? (
          <img
            src={src}
            alt=""
            className={fit}
            referrerPolicy="no-referrer"
          />
        ) : null}

        {index < posts.length - 1 || slide < post.slides.length - 1 ? (
          <button
            type="button"
            className="absolute right-1 z-10 flex size-11 items-center justify-center rounded-full bg-surface/80 text-fg sm:right-4"
            aria-label="Дальше"
            onClick={() => {
              if (slide < post.slides.length - 1) setSlide(slide + 1);
              else onIndex(index + 1);
            }}
          >
            <ChevronRight className="size-5" />
          </button>
        ) : null}
      </div>

      {post.slides.length > 1 ? (
        <div className="flex justify-center gap-1.5 py-2">
          {post.slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={cn("h-1.5 rounded-full transition-all", i === slide ? "w-5 bg-accent" : "w-1.5 bg-subtle")}
              aria-label={`Слайд ${i + 1}`}
              onClick={() => setSlide(i)}
            />
          ))}
        </div>
      ) : null}

      {post.timestamp ? (
        <p className="px-4 pt-2 text-center text-xs text-subtle">
          {format(new Date(post.timestamp), "d MMM yyyy", { locale: ru })}
        </p>
      ) : null}

      {current?.type !== "video" ? (
        <ImagineBar mediaUrl={current?.displayUrl} username={username} onNeedToken={onNeedToken} />
      ) : (
        <div className="h-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]" />
      )}
    </div>
  );
}
