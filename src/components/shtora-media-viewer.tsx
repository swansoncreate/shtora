import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function ShtoraMediaViewer({
  eyebrow,
  title,
  actions,
  footer,
  onClose,
  children,
}: {
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[75] flex min-h-dvh flex-col overflow-hidden bg-[#070605] text-fg" role="dialog" aria-modal="true">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(169,104,104,0.11),transparent_36%),radial-gradient(circle_at_82%_18%,rgba(200,184,165,0.06),transparent_24%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:34px_34px]" />

      <header className="relative z-20 shrink-0 border-b border-border/35 bg-[#070605]/78 pt-[max(0.4rem,env(safe-area-inset-top))] backdrop-blur-2xl">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto_auto] items-center gap-3 px-3 pb-2.5 pt-2 sm:px-5">
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-[0.24em] text-subtle">Штора / просмотр</p>
            <p className="mt-0.5 truncate font-display text-base text-fg sm:text-lg">{eyebrow || "Медиа"}</p>
          </div>
          <div className="hidden min-w-0 text-center sm:block">
            <p className="truncate text-[11px] uppercase tracking-[0.18em] text-subtle">{title}</p>
          </div>
          <div className="flex items-center gap-1">
            <div className="flex max-w-[58vw] items-center gap-0.5 overflow-x-auto sm:hidden">{actions}</div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 shrink-0 rounded-full border border-border/40 bg-surface/35 text-muted hover:bg-surface/65 hover:text-fg"
              onClick={onClose}
              aria-label="Закрыть просмотр"
            >
              <X className="size-[18px]" />
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 min-h-0 flex-1 overflow-hidden px-2 pb-2 pt-2 sm:px-5 sm:pb-4 sm:pt-3">
        <div className="relative mx-auto flex h-full w-full max-w-6xl items-center justify-center">
          <div className="pointer-events-none absolute left-2 top-1/2 hidden -translate-y-1/2 flex-col items-center gap-2 lg:flex">
            <span className="h-12 w-px bg-gradient-to-b from-transparent via-accent/70 to-transparent" />
            <span className="[writing-mode:vertical-rl] rotate-180 text-[9px] font-medium uppercase tracking-[0.26em] text-subtle">архивный кадр</span>
            <span className="h-12 w-px bg-gradient-to-b from-transparent via-border to-transparent" />
          </div>

          <div className="relative flex size-full min-h-0 items-center justify-center overflow-hidden px-1 sm:px-16">
            <span className="pointer-events-none absolute left-1 top-1 z-10 h-5 w-5 border-l border-t border-fg/35 sm:left-8 sm:top-7" />
            <span className="pointer-events-none absolute right-1 top-1 z-10 h-5 w-5 border-r border-t border-fg/35 sm:right-8 sm:top-7" />
            <span className="pointer-events-none absolute bottom-1 left-1 z-10 h-5 w-5 border-b border-l border-fg/35 sm:bottom-7 sm:left-8" />
            <span className="pointer-events-none absolute bottom-1 right-1 z-10 h-5 w-5 border-b border-r border-fg/35 sm:bottom-7 sm:right-8" />

            <div className="relative flex size-full min-h-0 items-center justify-center">
              {children}
            </div>
          </div>

          <div className="absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 sm:block">
            <div className="flex max-w-44 flex-col items-stretch gap-1 rounded-[20px] border border-border/45 bg-[#0d0b09]/78 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
              {actions}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-0.5 size-10 shrink-0 self-center rounded-full border border-border/40 bg-surface/35 text-muted hover:bg-surface/65 hover:text-fg"
                onClick={onClose}
                aria-label="Закрыть просмотр"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-2 left-3 z-10 sm:bottom-7 sm:left-8">
            <p className="max-w-[58vw] truncate text-[10px] uppercase tracking-[0.22em] text-subtle">{title}</p>
          </div>
        </div>
      </main>

      {footer ? <div className="relative z-20 shrink-0 border-t border-border/35 bg-[#070605]/84 backdrop-blur-2xl">{footer}</div> : null}
    </div>
  );
}
