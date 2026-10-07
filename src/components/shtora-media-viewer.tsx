import { Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function ShtoraMediaViewer({
  eyebrow,
  title,
  meta,
  backdropSrc,
  actions,
  footer,
  onClose,
  children,
}: {
  eyebrow?: string;
  title: string;
  meta?: ReactNode;
  backdropSrc?: string | null;
  actions?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const [hudOpen, setHudOpen] = useState(true);
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key.toLowerCase() === "i") setHudOpen((v) => !v);
      if (e.key.toLowerCase() === "f") setImmersive((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={`fixed inset-0 z-[75] flex min-h-dvh flex-col overflow-hidden bg-[#060504] text-fg ${immersive ? "cursor-none" : ""}`} role="dialog" aria-modal="true">
      {backdropSrc ? (
        <img
          src={backdropSrc}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-[-8%] h-[116%] w-[116%] object-cover opacity-[0.15] blur-[42px]"
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(169,104,104,0.12),transparent_42%),linear-gradient(180deg,rgba(0,0,0,0.4),rgba(0,0,0,0.18)_45%,rgba(0,0,0,0.55))]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:38px_38px]" />

      {!immersive && hudOpen ? (
        <header className="relative z-30 shrink-0 pt-[max(0.45rem,env(safe-area-inset-top))]">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-3 py-2.5 sm:px-6">
            <div className="min-w-0">
              <p className="text-[9px] font-medium uppercase tracking-[0.3em] text-accent/80">СЦЕНА</p>
              <div className="mt-1 flex min-w-0 items-baseline gap-2">
                <p className="truncate font-display text-base sm:text-lg">{eyebrow || "Личный кадр"}</p>
                <span className="hidden text-[10px] uppercase tracking-[0.18em] text-subtle sm:inline">{title}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 rounded-full border border-border/35 bg-surface/25 text-muted hover:bg-surface/55 hover:text-fg"
                aria-label={immersive ? "Вернуть интерфейс" : "Полный экран"}
                onClick={() => setImmersive((v) => !v)}
              >
                {immersive ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 rounded-full border border-border/35 bg-surface/25 text-muted hover:bg-surface/55 hover:text-fg"
                onClick={onClose}
                aria-label="Закрыть сцену"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </header>
      ) : null}

      <main
        className={`relative z-10 min-h-0 flex-1 overflow-hidden px-2 sm:px-6 ${immersive ? "py-0" : "py-2 sm:py-3"}`}
        onClick={() => setHudOpen((v) => !v)}
      >
        <div className="relative mx-auto flex h-full w-full max-w-7xl items-center justify-center">
          <div className="pointer-events-none absolute inset-x-[9%] top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-border/35 to-transparent" />
          <div className="pointer-events-none absolute left-[5%] top-[15%] hidden text-[9px] uppercase tracking-[0.28em] text-subtle lg:block [writing-mode:vertical-rl]">
            личный архив · кадр
          </div>

          <div className="relative flex size-full min-h-0 items-center justify-center">
            <span className="pointer-events-none absolute left-2 top-2 h-7 w-7 border-l border-t border-fg/25 sm:left-6 sm:top-5" />
            <span className="pointer-events-none absolute right-2 top-2 h-7 w-7 border-r border-t border-fg/25 sm:right-6 sm:top-5" />
            <span className="pointer-events-none absolute bottom-2 left-2 h-7 w-7 border-b border-l border-fg/25 sm:bottom-5 sm:left-6" />
            <span className="pointer-events-none absolute bottom-2 right-2 h-7 w-7 border-b border-r border-fg/25 sm:right-6 sm:bottom-5" />
            {children}
          </div>

          {!immersive && hudOpen && actions ? (
            <div className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 sm:bottom-5">
              <div className="flex max-w-[92vw] items-center gap-1 overflow-x-auto rounded-full border border-border/40 bg-[#0c0a09]/78 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.48)] backdrop-blur-2xl [&_button]:rounded-full">
                {actions}
              </div>
            </div>
          ) : null}

          {!immersive && hudOpen && meta ? (
            <div className="absolute bottom-3 left-3 z-20 max-w-[42vw] sm:bottom-6 sm:left-8">
              <div className="max-w-sm border-l border-accent/55 pl-2.5">
                <p className="text-[9px] uppercase tracking-[0.22em] text-subtle">контекст</p>
                <div className="mt-1 text-xs text-muted">{meta}</div>
              </div>
            </div>
          ) : null}

          {!immersive && !hudOpen ? (
            <button
              type="button"
              className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-border/30 bg-black/30 px-3 py-1.5 text-[9px] uppercase tracking-[0.24em] text-subtle backdrop-blur-md"
              onClick={(e) => {
                e.stopPropagation();
                setHudOpen(true);
              }}
            >
              показать сцену
            </button>
          ) : null}
        </div>
      </main>

      {!immersive && footer ? (
        <div className="relative z-30 shrink-0 border-t border-border/30 bg-[#070605]/78 backdrop-blur-2xl">{footer}</div>
      ) : null}
    </div>
  );
}
