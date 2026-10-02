import {
  BadgeCheck,
  Clapperboard,
  CloudUpload,
  Grid3x3,
  Layers,
  LoaderCircle,
  RefreshCw,
  Star,
} from "lucide-react";
import { MediaImg } from "@/components/media-img";
import { MediaSaveButton } from "@/components/media-save-button";
import { UnreadBadge } from "@/components/chats";
import { Button } from "@/components/ui/button";
import type { IgHighlight, IgPost, IgProfile, IgStoryItem } from "@/lib/instagram/types";
import { isBlankHlTitle } from "@/lib/instagram/normalize";
import { cn, formatCount, mediaSrc } from "@/lib/utils";

export function ProfileHeader({
  profile,
  storyCount,
  unseenStories = 0,
  folder,
  saving,
  refreshing,
  onSave,
  onRefresh,
  onOpenPhoto,
  onOpenStories,
  onMessage,
  favorite,
  chatUnread,
  onToggleFavorite,
  warning,
}: {
  profile: IgProfile;
  storyCount: number;
  unseenStories?: number;
  folder: string;
  saving: boolean;
  refreshing?: boolean;
  onSave: () => void;
  onRefresh: () => void;
  onOpenPhoto: () => void;
  onOpenStories: () => void;
  onMessage: () => void;
  favorite: boolean;
  chatUnread?: number;
  onToggleFavorite: () => void;
  warning?: string;
}) {
  const hasRing = storyCount > 0;
  return (
    <div className="flex gap-4">
      <button
        type="button"
        onClick={hasRing ? onOpenStories : onOpenPhoto}
        className={cn(
          "size-[84px] shrink-0 overflow-hidden rounded-full p-[3px]",
          hasRing ? (unseenStories > 0 ? "bg-danger" : "bg-fg") : "bg-border",
        )}
        aria-label={hasRing ? "Открыть сторис" : "Открыть аватар"}
      >
        <MediaImg
          src={profile.profilePicUrl}
          alt={profile.username}
          className="size-full rounded-full border-[3px] border-bg object-cover"
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h1 className="min-w-0 truncate font-display text-2xl font-medium tracking-tight">
            {profile.fullName || profile.username}
          </h1>
          {profile.verified ? <BadgeCheck className="size-5 shrink-0 text-accent" /> : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            aria-label={favorite ? "Убрать из избранного" : "В избранное"}
            onClick={onToggleFavorite}
          >
            <Star className={cn("size-5", favorite && "fill-accent text-accent")} />
          </Button>
        </div>
        <p className="text-sm text-muted">@{profile.username}</p>
        <div className="mt-3 flex gap-4 text-sm">
          <Stat label="посты" value={profile.postsCount ?? profile.posts.length} />
          <Stat label="подписчики" value={profile.followersCount} />
          <Stat label="подписки" value={profile.followsCount} />
        </div>
        <div className="relative z-10 mt-3 flex flex-wrap gap-2">
          <Button type="button" className="relative h-12 min-w-[44px] rounded-lg touch-manipulation" onClick={onMessage}>
            Написать
            <UnreadBadge count={chatUnread ?? 0} className="absolute -top-1.5 -right-1.5" />
          </Button>
          <Button type="button" variant="subtle" className="h-12 rounded-lg touch-manipulation" onClick={onSave} disabled={saving}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
            Сохранить
          </Button>
          <Button type="button" variant="ghost" className="h-12 rounded-lg touch-manipulation" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing}>
            {refreshing ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {refreshing ? "Обновляем" : "Обновить"}
          </Button>
        </div>
        <p className="mt-1.5 truncate text-xs text-subtle">{folder}</p>
        {warning ? <p className="mt-1 text-xs text-accent">{warning}</p> : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <p className="tabular font-medium text-fg">{formatCount(value)}</p>
      <p className="text-xs text-subtle">{label}</p>
    </div>
  );
}

export function HighlightsRail({
  highlights,
  onOpen,
}: {
  highlights: IgHighlight[];
  onOpen: (hl: IgHighlight) => void;
}) {
  if (!highlights.length) return null;
  return (
    <div className="mt-5 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {highlights.map((hl) => (
        <button
          key={hl.id}
          type="button"
          className="flex w-[76px] shrink-0 flex-col items-center gap-1.5"
          onClick={() => onOpen(hl)}
        >
          <span className="size-[72px] overflow-hidden rounded-full bg-elevated p-[2px] shadow-[var(--shadow-border)]">
            {hl.coverImageUrl || hl.items?.[0]?.imageUrl ? (
              <MediaImg src={hl.coverImageUrl || hl.items?.[0]?.imageUrl} alt="" className="size-full rounded-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center rounded-full bg-surface text-[11px] text-muted">
                {(hl.title || "•").slice(0, 1)}
              </span>
            )}
          </span>
          <span className="w-full truncate text-center text-[11px] text-muted">
            {isBlankHlTitle(hl.title) ? " " : hl.title}
          </span>
        </button>
      ))}
    </div>
  );
}

export function PostsGrid({
  posts,
  username,
  onOpen,
  onNeedToken,
}: {
  posts: IgPost[];
  username: string;
  onOpen: (index: number) => void;
  onNeedToken: () => void;
}) {
  if (!posts.length) {
    return <p className="mt-10 text-center text-sm text-muted">Постов нет</p>;
  }
  return (
    <div className="mt-3 grid grid-cols-3 gap-1">
      {posts.map((post, i) => (
        <div key={post.id} className="relative aspect-square overflow-hidden rounded-sm bg-elevated">
          <button type="button" className="size-full" onClick={() => onOpen(i)} aria-label="Открыть пост">
            <MediaImg src={post.displayUrl} alt="" className="size-full" />
          </button>
          {post.type === "sidecar" ? (
            <Layers className="pointer-events-none absolute top-2 right-2 size-4 text-fg drop-shadow" />
          ) : null}
          {post.type === "video" ? (
            <Clapperboard className="pointer-events-none absolute top-2 right-2 size-4 text-fg drop-shadow" />
          ) : null}
          <MediaSaveButton overlay username={username} kind="post" post={post} slide={0} onNeedToken={onNeedToken} />
        </div>
      ))}
    </div>
  );
}

export function StoriesGrid({
  stories,
  username,
  onOpen,
  onNeedToken,
}: {
  stories: IgStoryItem[];
  username: string;
  onOpen: (index: number) => void;
  onNeedToken: () => void;
}) {
  if (!stories.length) {
    return <p className="mt-10 text-center text-sm text-muted">Сторис сейчас нет</p>;
  }
  return (
    <div className="mt-3 grid grid-cols-3 gap-1">
      {stories.map((s, i) => (
        <div key={s.id} className="relative aspect-[9/16] overflow-hidden rounded-md bg-elevated">
          <button type="button" className="size-full" onClick={() => onOpen(i)} aria-label="Открыть сторис">
            {s.mediaType === "video" && s.videoUrl ? (
              <video src={mediaSrc(s.videoUrl)} className="size-full object-cover" muted playsInline preload="metadata" />
            ) : (
              <MediaImg src={s.imageUrl} alt="" className="size-full" />
            )}
          </button>
          {s.mediaType === "video" ? (
            <Clapperboard className="pointer-events-none absolute top-2 right-2 size-4 text-fg drop-shadow" />
          ) : null}
          <MediaSaveButton
            overlay
            username={username}
            kind="story"
            story={s}
            storyIndex={i}
            onNeedToken={onNeedToken}
          />
        </div>
      ))}
    </div>
  );
}

export function ProfileTabs({
  tab,
  onTab,
  storyCount = 0,
}: {
  tab: "posts" | "stories";
  onTab: (tab: "posts" | "stories") => void;
  storyCount?: number;
}) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-elevated p-1">
      {(
        [
          ["posts", "Посты", Grid3x3],
          ["stories", "Сторис", Clapperboard],
        ] as const
      ).map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          className={cn(
            "flex h-11 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors",
            tab === id ? "bg-surface text-fg" : "text-muted hover:text-fg",
          )}
          onClick={() => onTab(id)}
        >
          <Icon className="size-4" />
          <span>{label}</span>
          {id === "stories" && storyCount > 0 ? (
            <span className="rounded-full bg-danger px-1.5 text-[10px] leading-4 text-fg">{storyCount}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
