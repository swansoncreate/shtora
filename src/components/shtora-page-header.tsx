import { ArrowLeft, Settings, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function ShtoraPageHeader({
  eyebrow,
  title,
  onBack,
  onClose,
  onSettings,
}: {
  eyebrow?: string;
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  onSettings?: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/55 bg-bg/88 pt-[max(0.55rem,env(safe-area-inset-top))] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 pb-4 pt-2 sm:px-6">
        <div className="flex size-10 shrink-0 items-center justify-center">
          {onBack ? (
            <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full text-muted hover:text-fg" onClick={onBack} aria-label="Назад">
              <ArrowLeft className="size-[18px]" />
            </Button>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-subtle">{eyebrow}</p> : null}
          <h1 className="truncate font-display text-3xl leading-none tracking-tight text-fg">{title}</h1>
        </div>

        <div className="flex size-10 shrink-0 items-center justify-center">
          {onSettings ? (
            <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full text-muted hover:text-fg" onClick={onSettings} aria-label="Настройки">
              <Settings className="size-[18px]" />
            </Button>
          ) : onClose ? (
            <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full text-muted hover:text-fg" onClick={onClose} aria-label="Закрыть">
              <X className="size-[18px]" />
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
