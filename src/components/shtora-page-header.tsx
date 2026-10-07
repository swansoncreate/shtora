import { ArrowLeft, Settings, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function ShtoraPageHeader({
  eyebrow,
  title,
  onBack,
  onClose,
  onSettings,
  actions,
}: {
  eyebrow?: string;
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  onSettings?: () => void;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-border/55 bg-bg/88 pt-[max(0.45rem,env(safe-area-inset-top))] backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 pb-3 pt-2.5 sm:px-6">
        <div className="flex size-10 shrink-0 items-center justify-center">
          {onBack ? (
            <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full bg-surface/70 text-muted hover:bg-elevated hover:text-fg" onClick={onBack} aria-label="Назад">
              <ArrowLeft className="size-[17px]" />
            </Button>
          ) : null}
        </div>

        <div className={onBack ? "min-w-0 flex-1 text-center" : "min-w-0 flex-1 text-left"}>
          {eyebrow ? <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-accent">{eyebrow}</p> : null}
          <h1 className="mt-0.5 truncate text-xl font-extrabold tracking-[-0.025em] text-fg sm:text-2xl">{title}</h1>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {actions ? <div className="flex items-center gap-0.5">{actions}</div> : null}
          {onSettings ? (
            <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full bg-surface/70 text-muted hover:bg-elevated hover:text-fg" onClick={onSettings} aria-label="Настройки">
              <Settings className="size-[17px]" />
            </Button>
          ) : null}
          {onClose ? (
            <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full bg-surface/70 text-muted hover:bg-elevated hover:text-fg" onClick={onClose} aria-label="Закрыть">
              <X className="size-[17px]" />
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
