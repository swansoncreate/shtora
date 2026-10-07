import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ChatHeartButton, ChatSendButton } from "@/components/chat-send-button";
import { ImagineBar } from "@/components/imagine-dice";
import { MediaSaveButton } from "@/components/media-save-button";
import { ShtoraMediaViewer } from "@/components/shtora-media-viewer";
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
  const fit = frame === "feed" ? "aspect-square w-full max-w-md object-cover" : "max-h-full max-w-full rounded-md object-contain";

  return (
    <ShtoraMediaViewer
      eyebrow={`Пост · @${username}`}
      title={`${index + 1} / ${posts.length}`}
      backdropSrc={current?.displayUrl || post.displayUrl}
      meta={
        <span>
          @{username} · {post.timestamp ? format(new Date(post.timestamp), "d MMM yyyy", { locale: ru }) : "архив"} · {post.slides.length > 1 ? `${post.slides.length} кадра` : "1 кадр"}
        </span>
      }
      onClose={onClose}
      actions={
        <>
          <ChatHeartButton username={username} imageUrl={current?.displayUrl} kind="post" />
          <ChatSendButton username={username} imageUrl={current?.displayUrl} kind="post" />
          <MediaSaveButton username={username} kind="post" post={post} slide={slide} onNeedToken={onNeedToken} />
        </>
      }
      footer={
        <>
          {post.slides.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto px-3 py-2.5 sm:justify-center">
              {post.slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className={cn(
                    "relative size-12 shrink-0 overflow-hidden rounded-xl border transition-all sm:size-14",
                    i === slide ? "border-accent ring-1 ring-accent/45" : "border-border/35 opacity-55 hover:opacity-90",
                  )}
                  aria-label={`Слайд ${i + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSlide(i);
                  }}
                >
                  <img src={mediaSrc(s.displayUrl)} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
                  {i === slide ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" /> : null}
                </button>
              ))}
            </div>
          ) : null}
          {post.timestamp ? (
            <p className="px-4 pt-1 text-center text-xs text-subtle">
              {format(new Date(post.timestamp), "d MMM yyyy", { locale: ru })}
            </p>
          ) : null}
          {current?.type !== "video" ? <ImagineBar mediaUrl={current?.displayUrl} username={username} onNeedToken={onNeedToken} /> : <div className="h-2" />}
        </>
      }
    >
      <div className="relative flex size-full min-h-0 items-center justify-center">
        {index > 0 ? (
          <button
            type="button"
            className="group absolute left-[-12%] z-0 hidden h-[58%] w-28 overflow-hidden rounded-2xl border border-border/25 bg-black/25 opacity-35 blur-[0.5px] transition-transform hover:-translate-y-1 hover:opacity-55 sm:block md:left-[-7%]"
            aria-label="Предыдущая публикация"
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index - 1);
            }}
          >
            <img src={mediaSrc(posts[index - 1]?.displayUrl)} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
          </button>
        ) : null}

        <div className={`relative z-10 flex size-full items-center justify-center ${frame === "feed" ? "max-w-md" : ""}`}>
          {video ? (
            <video key={video} src={video} poster={poster} className={`max-h-full max-w-full rounded-[22px] object-contain shadow-[0_32px_100px_rgba(0,0,0,0.48)] ${frame === "feed" ? "aspect-square w-full object-cover" : ""}`} controls playsInline autoPlay preload="auto" />
          ) : src ? (
            <img src={src} alt="" className={`max-h-full max-w-full rounded-[22px] object-contain shadow-[0_32px_100px_rgba(0,0,0,0.48)] ${frame === "feed" ? "aspect-square w-full object-cover" : ""}`} referrerPolicy="no-referrer" />
          ) : null}
        </div>

        {index < posts.length - 1 ? (
          <button
            type="button"
            className="group absolute right-[-12%] z-0 hidden h-[58%] w-28 overflow-hidden rounded-2xl border border-border/25 bg-black/25 opacity-35 blur-[0.5px] transition-transform hover:-translate-y-1 hover:opacity-55 sm:block md:right-[-7%]"
            aria-label="Следующая публикация"
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index + 1);
            }}
          >
            <img src={mediaSrc(posts[index + 1]?.displayUrl)} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
          </button>
        ) : null}

        {index > 0 || slide > 0 ? (
          <button
            type="button"
            className="absolute left-2 z-20 flex size-10 items-center justify-center rounded-full border border-border/25 bg-black/25 text-fg/80 backdrop-blur-md sm:left-10"
            aria-label="Назад"
            onClick={(e) => {
              e.stopPropagation();
              if (slide > 0) setSlide(slide - 1);
              else onIndex(index - 1);
            }}
          >
            <ChevronLeft className="size-4" />
          </button>
        ) : null}

        {index < posts.length - 1 || slide < post.slides.length - 1 ? (
          <button
            type="button"
            className="absolute right-2 z-20 flex size-10 items-center justify-center rounded-full border border-border/25 bg-black/25 text-fg/80 backdrop-blur-md sm:right-10"
            aria-label="Дальше"
            onClick={(e) => {
              e.stopPropagation();
              if (slide < post.slides.length - 1) setSlide(slide + 1);
              else onIndex(index + 1);
            }}
          >
            <ChevronRight className="size-4" />
          </button>
        ) : null}
      </div>
    </ShtoraMediaViewer>
  );}
