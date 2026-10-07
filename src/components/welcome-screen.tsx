import { ArrowRight, Bookmark, Heart, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const heroImage = "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=88";

export function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <main className="relative isolate flex min-h-dvh overflow-hidden bg-bg text-fg">
      <img src={heroImage} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-55" referrerPolicy="no-referrer" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,11,20,0.28),rgba(7,11,20,0.55)_42%,#070b14_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(124,107,255,0.34),transparent_28%),radial-gradient(circle_at_80%_35%,rgba(243,107,154,0.22),transparent_25%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-between px-5 py-6 sm:px-8 sm:py-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/65">SHTORA</p>
            <p className="mt-1 text-xs text-white/50">midnight private social</p>
          </div>
          <div className="flex gap-1.5">
            <span className="flex size-9 items-center justify-center rounded-full border border-white/15 bg-black/20 backdrop-blur-md"><Heart className="size-4 text-white/75" /></span>
            <span className="flex size-9 items-center justify-center rounded-full border border-white/15 bg-black/20 backdrop-blur-md"><MessageCircle className="size-4 text-white/75" /></span>
            <span className="flex size-9 items-center justify-center rounded-full border border-white/15 bg-black/20 backdrop-blur-md"><Bookmark className="size-4 text-white/75" /></span>
          </div>
        </header>

        <section className="max-w-2xl pb-2 pt-16">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/75 backdrop-blur-md">
            <Sparkles className="size-3.5 text-[#b99cff]" />
            личное пространство
          </div>
          <h1 className="max-w-xl text-5xl font-extrabold leading-[0.96] tracking-[-0.04em] text-white sm:text-7xl">
            Твой мир.
            <br />
            <span className="text-white/80">Только для своих.</span>
          </h1>
          <p className="mt-6 max-w-md text-sm leading-6 text-white/65 sm:text-base">
            Лента, люди, сообщения, архив и Imagine — в одном ночном пространстве.
          </p>
          <Button
            type="button"
            size="lg"
            className="midnight-gradient mt-8 h-13 rounded-full border-0 px-6 text-white shadow-[0_12px_36px_rgba(124,107,255,0.28)]"
            onClick={onContinue}
          >
            Войти в Штору
            <span className="ml-2 inline-flex size-8 items-center justify-center rounded-full bg-white/15">
              <ArrowRight className="size-4" />
            </span>
          </Button>
        </section>

        <div className="flex items-end justify-between gap-4 text-[9px] font-bold uppercase tracking-[0.16em] text-white/45">
          <span>photos · stories · chats · archive · imagine</span>
          <span>SHTORA / MIDNIGHT</span>
        </div>
      </div>
    </main>
  );
}
