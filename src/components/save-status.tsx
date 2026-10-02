import { AlertCircle, Check, LoaderCircle, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { dismissSaveProgress } from "@/lib/dropbox/engine";
import { dismissSaveNotice, getSaveNotice, subscribeSaved } from "@/lib/dropbox/saved";
import { useSaveProgress } from "@/lib/dropbox/use-save-progress";
import { cn } from "@/lib/utils";

function useSaveNotice() {
  return useSyncExternalStore(subscribeSaved, getSaveNotice, () => null);
}

export function SaveStatus() {
  const progress = useSaveProgress();
  const notice = useSaveNotice();
  if (progress.status === "idle" && !notice) return null;

  const idleNotice = progress.status === "idle" && notice;
  return (
    <div
      className={cn(
        "mt-3 flex items-center gap-2 rounded-lg bg-surface px-3 py-2.5 text-sm shadow-[var(--shadow-border)]",
        progress.status === "error" ? "text-danger" : "text-muted",
      )}
      role="status"
    >
      {progress.status === "running" ? (
        <LoaderCircle className="size-4 shrink-0 animate-spin text-fg" />
      ) : progress.status === "error" ? (
        <AlertCircle className="size-4 shrink-0 text-danger" />
      ) : (
        <Check className="size-4 shrink-0 text-fg" />
      )}
      <p className="min-w-0 flex-1 text-fg">{idleNotice ? notice.text : progress.message}</p>
      {progress.total > 0 && progress.status === "running" ? (
        <span className="tabular shrink-0 text-xs text-subtle">
          {progress.done}/{progress.total}
        </span>
      ) : (
        <button
          type="button"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-subtle hover:text-fg"
          aria-label="Скрыть"
          onClick={() => {
            dismissSaveNotice();
            dismissSaveProgress();
          }}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
