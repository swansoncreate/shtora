import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { useState } from "react";
import { BadgeCheck, Clapperboard, Heart, Layers, MessageCircle } from "lucide-react";
import { MediaImg } from "@/components/media-img";
import { Button } from "@/components/ui/button";
import type { FeedCard } from "@/lib/feed/simulate";
import { cardAsPost } from "@/lib/feed/simulate";
import type { IgPost } from "@/lib/instagram/types";
import { isVideoMediaUrl } from "@/lib/instagram/media-url";
import { storiesUnseen } from "@/lib/instagram/unseen";
import { cn } from "@/lib/utils";

export function HomeFeed({
  items,
  onOpenPost,
  onOpenDropbox,
  onOpenProfile,
  onLike,
  onOpenStory,
  onComments,
  onRefresh,
  refreshing,
}: {
  items: FeedCard[];
  onOpenPost: (username: string, posts: IgPost[], index: number) => void;
  onOpenDropbox: (card: FeedCard) => void;
  onOpenProfile: (username: string) => void;
  onLike: (card: FeedCard) => void;
  onOpenStory?: (card: FeedCard) => void;
  onComments: (card: FeedCard) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="mt-16 flex flex-col items-center px-2 text-center">
        <p className="font-display text-3xl font-medium tracking-tight text-fg">Пока тихо</p>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
          Потяни вниз или обнови — старые посты останутся.
        </p>
        {onRefresh ? (
          <Button className="mt-5" type="button" disabled={refreshing} onClick={onRefresh}>
            Обновить
          </Button>
        ) : null}
      </div>
    );
  }

  const byUser = new Map<string, IgPost[]>();
  for (const card of items) {
    if (card.dropbox) continue;
    const post = cardAsPost(card);
    if (!post.displayUrl && !post.videoUrl) continue;
    const list = byUser.get(card.username) ?? [];
    if (!list.some((p) => p.id === post.id)) list.push(post);
    byUser.set(card.username, list);
  }

  return (
    <div className="mt-5 flex flex-col gap-4">
      {items.map((card) => {
        const posts = byUser.get(card.username) ?? (card.dropbox ? [] : [cardAsPost(card)]);
        const self = card.dropbox ? undefined : cardAsPost(card);
        const index = self ? Math.max(0, posts.findIndex((p) => p.id === self.id)) : 0;
        const ago = formatDistanceToNow(card.at || Date.now(), { addSuffix: true, locale: ru });
        const image = card.thumb || card.post?.displayUrl;
        const video = Boolean(card.dropbox?.video || card.post?.type === "video" || isVideoMediaUrl(card.post?.videoUrl || image));
        const hasStory = storiesUnseen(card.username);
        return (
          <article key={card.id} className="min-w-0 rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]">
            <header className="mb-3 flex items-center gap-3">
              <button
                type="button"
                className={cn(
                  "size-10 shrink-0 rounded-full p-[2px]",
                  hasStory ? "bg-danger" : "bg-border",
                )}
                onClick={() => onOpenProfile(card.username)}
                aria-label={`@${card.username}`}
              >
                <span className="block size-full overflow-hidden rounded-full border-2 border-surface bg-elevated">
                  <MediaImg src={card.avatar} alt="" className="size-full object-cover" />
                </span>
              </button>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onOpenProfile(card.username)}
              >
                <span className="flex items-center gap-1">
                  <span className="truncate text-sm font-medium text-fg">{card.username}</span>
                  {card.verified ? <BadgeCheck className="size-4 shrink-0 text-accent" /> : null}
                </span>
                <span className="block text-xs text-subtle">{ago}</span>
              </button>
            </header>
            <FeedFrame
              card={card}
              image={image}
              video={video}
              onOpen={() => {
                if (card.story && onOpenStory) onOpenStory(card);
                else if (card.dropbox) onOpenDropbox(card);
                else onOpenPost(card.username, posts.length ? posts : [cardAsPost(card)], index);
              }}
            />
            <div className="mt-1 flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={card.liked ? "Убрать лайк" : "Лайк"}
                onClick={() => onLike(card)}
              >
                <Heart className={`size-5 ${card.liked ? "fill-danger text-danger" : ""}`} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label="Комментарии"
                onClick={() => onComments(card)}
              >
                <MessageCircle className="size-5" />
              </Button>
              <button type="button" className="px-1 text-xs text-subtle" onClick={() => onComments(card)}>
                {(card.comments ?? 0) > 0 ? card.comments : "Комментарий"}
              </button>
            </div>
            {card.caption ? (
              <FeedCaption
                username={card.username}
                caption={card.caption}
                onOpenProfile={() => onOpenProfile(card.username)}
              />
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function FeedFrame({
  card,
  image,
  video,
  onOpen,
}: {
  card: FeedCard;
  image?: string;
  video: boolean;
  onOpen: () => void;
}) {
  const slides = card.post?.slides?.length
    ? card.post.slides
    : card.slides?.length
      ? card.slides.map((slide) => ({ id: slide.id, displayUrl: slide.url, type: "image" as const }))
      : [{ id: card.id, displayUrl: image || "", type: "image" as const }];
  const [at, setAt] = useState(0);
  const current = slides[Math.min(at, slides.length - 1)];
  const src = current?.displayUrl || image || "";
  return (
    <div
      className="relative"
      onTouchStart={(e) => {
        (e.currentTarget as HTMLDivElement).dataset.x = String(e.changedTouches[0]?.clientX || 0);
      }}
      onTouchEnd={(e) => {
        const start = Number((e.currentTarget as HTMLDivElement).dataset.x || 0);
        const dx = (e.changedTouches[0]?.clientX || 0) - start;
        if (Math.abs(dx) < 30 || slides.length < 2) return;
        setAt((n) => Math.max(0, Math.min(slides.length - 1, n + (dx < 0 ? 1 : -1))));
      }}
    >
      <button
        type="button"
        className="relative block w-full overflow-hidden rounded-lg bg-elevated"
        onClick={onOpen}
        aria-label={card.story ? `Сторис @${card.username}` : `Пост @${card.username}`}
      >
        <MediaImg
          src={src && !isVideoMediaUrl(src) ? src : image}
          alt=""
          className={cn("w-full object-cover", card.story ? "aspect-[9/16]" : "aspect-[4/5]")}
        />
        {slides.length > 1 ? <Layers className="pointer-events-none absolute top-3 right-3 size-4 text-fg drop-shadow" /> : null}
        {video ? <Clapperboard className="pointer-events-none absolute top-3 right-3 size-4 text-fg drop-shadow" /> : null}
      </button>
      {slides.length > 1 ? (
        <div className="mt-2 flex justify-center gap-1">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              className={cn("h-1.5 rounded-full", i === at ? "w-4 bg-fg" : "w-1.5 bg-border")}
              aria-label={`Слайд ${i + 1}`}
              onClick={() => setAt(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FeedCaption({
  username,
  caption,
  onOpenProfile,
}: {
  username: string;
  caption: string;
  onOpenProfile: () => void;
}) {
  const [open, setOpen] = useState(false);
  const long = caption.length > 90;
  return (
    <div className="mt-1">
      <p className={cn("text-sm leading-relaxed text-fg", !open && long && "line-clamp-2")}>
        <button type="button" className="mr-1.5 font-medium" onClick={onOpenProfile}>
          {username}
        </button>
        <span className="text-muted">{caption}</span>
      </p>
      {long ? (
        <button type="button" className="mt-1 text-xs text-subtle" onClick={() => setOpen((value) => !value)}>
          {open ? "свернуть" : "ещё"}
        </button>
      ) : null}
    </div>
  );
}
