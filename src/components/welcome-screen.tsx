import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <main className="relative isolate flex min-h-dvh overflow-hidden bg-bg text-fg">
      <div className="pointer-events-none absolute inset-0 curtain-wash opacity-50" aria-hidden />
      <div className="pointer-events-none absolute -left-24 top-1/4 size-72 rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-28 bottom-1/4 size-80 rounded-full bg-warm/10 blur-3xl" aria-hidden />
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col justify-between px-6 py-8 sm:px-10 sm:py-10">
        <div className="flex items-center justify-between">
          <p className="font-display text-2xl tracking-[0.08em] uppercase">Штора</p>
          <span className="text-[10px] font-medium tracking-[0.24em] text-subtle uppercase">private archive</span>
        </div>

        <section className="max-w-xl py-16">
          <div className="mb-7 inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface/80 text-warm backdrop-blur">
            <Sparkles className="size-5" />
          </div>
          <p className="text-xs font-medium tracking-[0.24em] text-accent uppercase">личное пространство</p>
          <h1 className="mt-4 font-display text-6xl leading-[0.88] tracking-tight text-fg sm:text-8xl">
            Смотри.
            <br />
            Сохраняй.
            <br />
            <span className="text-accent">Прячься.</span>
          </h1>
          <p className="mt-7 max-w-md text-sm leading-7 text-muted sm:text-base">
            Твоя лента, профили, фотографии, чаты и Imagine — в одном тихом пространстве.
          </p>
          <Button type="button" size="lg" className="mt-9 h-13 rounded-full px-7 pr-5 text-sm" onClick={onContinue}>
            Продолжить
            <span className="ml-1 inline-flex size-8 items-center justify-center rounded-full bg-accent-fg/10">
              <ArrowRight className="size-4" />
            </span>
          </Button>
        </section>

        <div className="flex items-end justify-between gap-6 text-[10px] tracking-[0.16em] text-subtle uppercase">
          <span>photos · stories · chats</span>
          <span className="text-right">SHTORA / 2026</span>
        </div>
      </div>
    </main>
  );
}
