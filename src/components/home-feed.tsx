import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
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
}: {
  items: FeedCard[];
  onOpenPost: (username: string, posts: IgPost[], index: number) => void;
  onOpenDropbox: (card: FeedCard) => void;
  onOpenProfile: (username: string) => void;
  onLike: (card: FeedCard) => void;
  onOpenStory?: (card: FeedCard) => void;
  onComments: (card: FeedCard) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-20 text-center text-sm text-muted">Потяни вниз — появятся посты. Старые остаются в ленте.</p>
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
    <div className="mt-5 flex flex-col gap-8">
      {items.map((card) => {
        const posts = byUser.get(card.username) ?? (card.dropbox ? [] : [cardAsPost(card)]);
        const self = card.dropbox ? undefined : cardAsPost(card);
        const index = self ? Math.max(0, posts.findIndex((p) => p.id === self.id)) : 0;
        const ago = formatDistanceToNow(card.at || Date.now(), { addSuffix: true, locale: ru });
        const image = card.thumb || card.post?.displayUrl;
        const video = Boolean(card.dropbox?.video || card.post?.type === "video" || isVideoMediaUrl(card.post?.videoUrl || image));
        const hasStory = storiesUnseen(card.username);
        return (
          <article key={card.id} className="min-w-0">
            <header className="mb-3 flex items-center gap-3">
              <button
                type="button"
                className={cn(
                  "size-10 shrink-0 rounded-full p-[2px]",
                  hasStory ? "bg-danger" : "bg-transparent",
                )}
                onClick={() => onOpenProfile(card.username)}
                aria-label={`@${card.username}`}
              >
                <span className="block size-full overflow-hidden rounded-full border-2 border-bg bg-elevated">
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
            <button
              type="button"
              className="relative block w-full overflow-hidden rounded-xl bg-elevated"
              onClick={() => {
                if (card.story && onOpenStory) onOpenStory(card);
                else if (card.dropbox) onOpenDropbox(card);
                else onOpenPost(card.username, posts.length ? posts : [cardAsPost(card)], index);
              }}
              aria-label={card.story ? `Сторис @${card.username}` : `Пост @${card.username}`}
            >
              <MediaImg
                src={image && !isVideoMediaUrl(image) ? image : card.post?.displayUrl && !isVideoMediaUrl(card.post.displayUrl) ? card.post.displayUrl : image}
                alt=""
                className={cn("w-full object-cover", card.story ? "aspect-[9/16]" : "aspect-[4/5]")}
              />
              {card.post?.type === "sidecar" ? (
                <Layers className="pointer-events-none absolute top-3 right-3 size-4 text-fg drop-shadow" />
              ) : null}
              {video ? (
                <Clapperboard className="pointer-events-none absolute top-3 right-3 size-4 text-fg drop-shadow" />
              ) : null}
            </button>
            <div className="mt-2 flex items-center gap-1">
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
              {(card.comments ?? 0) > 0 ? (
                <button type="button" className="px-1 text-xs text-subtle" onClick={() => onComments(card)}>
                  {card.comments}
                </button>
              ) : null}
            </div>
            {card.caption ? (
              <p className="mt-1 text-sm leading-relaxed text-fg">
                <button
                  type="button"
                  className="mr-1.5 font-medium"
                  onClick={() => onOpenProfile(card.username)}
                >
                  {card.username}
                </button>
                <span className="text-muted">{card.caption}</span>
              </p>
            ) : null}
            <button
              type="button"
              className="mt-1 text-xs text-subtle"
              onClick={() => onComments(card)}
            >
              {(card.comments ?? 0) > 0 ? `Комментарии ${card.comments}` : "Оставить комментарий"}
            </button>
          </article>
        );
      })}
    </div>
  );
}
