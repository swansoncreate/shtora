import { Link } from "@tanstack/react-router";
import { MediaImg } from "@/components/media-img";
import { getCachedProfile, getCachedStories, liveStories } from "@/lib/instagram/cache";
import type { IgStoryItem } from "@/lib/instagram/types";
import { unseenCount, unseenStoryCount } from "@/lib/instagram/unseen";
import { cn } from "@/lib/utils";

export function FavoritesStrip({
  names,
  active,
  onPick,
  tick,
  onOpenStory,
  previewPictures,
}: {
  names: string[];
  active?: string;
  onPick: (name: string) => void;
  tick?: number;
  onOpenStory?: (name: string, items: IgStoryItem[]) => void;
  previewPictures?: Record<string, string>;
}) {
  void tick;
  if (!names.length) return null;
  const rows = names
    .map((name) => {
      const count = unseenCount(name);
      const pic = previewPictures?.[name] || getCachedProfile(name)?.data.profilePicUrl;
      const selected = active === name;
      const stories = liveStories(getCachedStories(name)?.data.stories);
      const freshCount = unseenStoryCount(name);
      const freshStory = freshCount > 0;
      const hasStory = stories.length > 0;
      return { name, count, pic, selected, stories, freshStory, freshCount, hasStory };
    })
    .sort((a, b) => Number(b.freshStory) - Number(a.freshStory));
  return (
    <div className="mt-3 flex gap-3 overflow-x-auto px-0.5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {rows.map(({ name, count, pic, selected, stories, freshStory, freshCount, hasStory }) => (
          <Link
            key={name}
            to="/"
            search={{ u: name }}
            onClick={(e) => {
              if (hasStory && onOpenStory && !active) {
                e.preventDefault();
                onOpenStory(name, stories);
                return;
              }
              onPick(name);
            }}
            className="flex w-[72px] shrink-0 flex-col items-center gap-2"
            aria-label={freshStory ? `${name}, ${freshCount} новых сторис` : count > 0 ? `${name}, ${count} новых` : name}
          >
            <span
              className={cn(
                "relative size-[64px] rounded-full border p-[2px]",
                hasStory ? (freshStory ? "border-accent" : "border-fg/35") : count > 0 ? "border-accent/80" : selected ? "border-fg/45" : "border-border",
              )}
            >
              <span className="block size-full overflow-hidden rounded-full border-2 border-bg bg-elevated">
                {pic ? (
                  <MediaImg src={pic} alt="" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center font-display text-xl text-muted">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </span>
              {freshStory ? (
                <span className="absolute -right-0.5 -bottom-0.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-fg">
                  {freshCount > 9 ? "9+" : freshCount}
                </span>
              ) : count > 0 ? (
                <span className="absolute -right-0.5 -bottom-0.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium text-fg">
                  {count > 9 ? "9+" : count}
                </span>
              ) : null}
            </span>
            <span className={cn("w-full truncate text-center text-[10px] tracking-wide", selected ? "text-fg" : "text-muted")}>
              {name}
            </span>
          </Link>
      ))}
    </div>
  );
}
