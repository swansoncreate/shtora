import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function ShtoraMediaViewer({
  eyebrow,
  title,
  actions,
  footer,
  children,
}: {
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[75] flex min-h-dvh flex-col bg-[#080706]" role="dialog" aria-modal="true">
      <header className="shrink-0 border-b border-border/55 bg-bg/90 pt-[max(0.55rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 pb-3 pt-2 sm:px-6">
          <div className="min-w-0 flex-1">
            {eyebrow ? <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-subtle">{eyebrow}</p> : null}
            <p className="truncate font-display text-xl leading-none text-fg">{title}</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {actions}
            <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full text-muted hover:text-fg" onClick={() => window.dispatchEvent(new CustomEvent("shtora-media-viewer-close"))} aria-label="Закрыть">
              <X className="size-[18px]" />
            </Button>
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden px-3 py-3 sm:px-6 sm:py-5">
        <div className="relative mx-auto flex h-full w-full max-w-5xl items-center justify-center overflow-hidden rounded-[26px] border border-border/45 bg-surface/15 p-2 shadow-[0_20px_80px_rgba(0,0,0,0.34)] sm:p-4">
          {children}
        </div>
      </main>

      {footer ? <div className="shrink-0 border-t border-border/50 bg-bg/92 backdrop-blur-xl">{footer}</div> : null}
    </div>
  );
}
