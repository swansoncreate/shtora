import { Check, CloudUpload, LoaderCircle } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { jobsForPostSlide, jobsForStoryItem, queueSaveJobs } from "@/lib/dropbox/engine";
import { useIsSaved } from "@/lib/dropbox/use-is-saved";
import type { SaveKind } from "@/lib/dropbox/saved";
import { folderForAccount, useShtoraSettings } from "@/lib/shtora-settings";
import type { IgPost, IgStoryItem } from "@/lib/instagram/types";
import { cn } from "@/lib/utils";

export function MediaSaveButton({
  username,
  kind,
  post,
  slide = 0,
  story,
  highlightTitle,
  storyIndex = 0,
  overlay = false,
  onNeedToken,
}: {
  username: string;
  kind: SaveKind;
  post?: IgPost;
  slide?: number;
  story?: IgStoryItem;
  highlightTitle?: string;
  storyIndex?: number;
  overlay?: boolean;
  onNeedToken?: () => void;
}) {
  const { settings } = useShtoraSettings();
  const id = post?.id ?? story?.id ?? "";
  const saved = useIsSaved(username, kind, id, kind === "post" ? slide : 0);
  const [busy, setBusy] = useState(false);

  async function onSave(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || saved) return;
    if (!settings.dropboxToken.trim() && !settings.dropboxRefreshToken.trim()) {
      toast.error("Добавьте токен Dropbox в настройках");
      onNeedToken?.();
      return;
    }
    const folder = folderForAccount(username, settings);
    const jobs = post
      ? jobsForPostSlide(username, folder, post, slide)
      : story
        ? jobsForStoryItem(username, folder, story, kind, highlightTitle, storyIndex)
        : [];
    if (!jobs.length) {
      toast.error("Нет файла для сохранения");
      return;
    }
    setBusy(true);
    try {
      const result = await queueSaveJobs({ jobs, settings, username });
      if (result.failed) toast.error(result.lastError || "Не удалось сохранить в Dropbox");
      else toast.success("Сохранено в Dropbox");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  const label = saved ? "Сохранено" : "Сохранить в Dropbox";

  if (overlay) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={onSave}
        className={cn(
          "absolute right-1.5 bottom-1.5 z-10 flex size-11 items-center justify-center rounded-full bg-surface text-fg shadow-[var(--shadow-border)]",
          saved && "text-accent",
        )}
      >
        {busy ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : saved ? (
          <Check className="size-4" />
        ) : (
          <CloudUpload className="size-4" />
        )}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-10"
      aria-label={label}
      onClick={onSave}
      disabled={busy}
    >
      {busy ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : saved ? (
        <Check className="size-4" />
      ) : (
        <CloudUpload className="size-4" />
      )}
    </Button>
  );
}
