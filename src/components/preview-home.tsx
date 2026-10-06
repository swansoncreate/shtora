import { useState } from "react";
import { ArrowLeft, Bell, Bookmark, Heart, Home, MessageCircle, MoreHorizontal, Search, Send, User } from "lucide-react";
import { cn } from "@/lib/utils";

type Screen = "home" | "search" | "inbox" | "profile";

export function PreviewHome() {
  const [screen, setScreen] = useState<Screen>("home");
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <main className="min-h-[calc(100dvh-8rem)] bg-bg text-fg">
      <div className="mx-auto max-w-md overflow-hidden rounded-[2rem] border border-border/80 bg-bg shadow-[var(--shadow-border)]">
        <header className="flex h-14 items-center justify-between border-b border-border/70 px-4">
          {screen === "home" ? (
            <span className="font-display text-2xl tracking-tight">Штора</span>
          ) : (
            <button type="button" onClick={() => setScreen("home")} className="rounded-full p-2" aria-label="Назад">
              <ArrowLeft className="size-5" />
            </button>
          )}
          <span className="text-xs uppercase tracking-[0.18em] text-muted">preview</span>
          <button type="button" onClick={() => setScreen("inbox")} className="rounded-full p-2" aria-label="Сообщения">
            <MessageCircle className="size-5" />
          </button>
        </header>

        {screen === "home" ? (
          <>
            <div className="flex gap-3 overflow-x-auto px-4 py-4">
              {["you", "lena", "mira", "nika", "anna"].map((name, i) => (
                <button key={name} type="button" onClick={() => setScreen("profile")} className="shrink-0 text-center">
                  <div className={cn("grid size-16 place-items-center rounded-full border-2", i === 0 ? "border-fg" : "border-border")}>
                    <span className="text-sm font-medium">{name[0].toUpperCase()}</span>
                  </div>
                  <span className="mt-1 block max-w-16 truncate text-[11px] text-muted">{name}</span>
                </button>
              ))}
            </div>

            <article className="border-y border-border/70">
              <div className="flex items-center justify-between px-4 py-3">
                <button type="button" onClick={() => setScreen("profile")} className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-full bg-surface font-medium">L</span>
                  <span className="text-sm font-medium">lena</span>
                </button>
                <MoreHorizontal className="size-5 text-muted" />
              </div>

              <button type="button" onClick={() => setScreen("profile")} className="block aspect-[4/5] w-full bg-surface text-left">
                <div className="flex h-full flex-col justify-end bg-[radial-gradient(circle_at_65%_25%,hsl(var(--surface)),transparent_38%),linear-gradient(145deg,hsl(var(--elevated)),hsl(var(--surface)))] p-6">
                  <span className="text-xs uppercase tracking-[0.2em] text-muted">moment 07:42</span>
                  <span className="mt-2 text-3xl font-display">morning light</span>
                  <span className="mt-1 max-w-[18rem] text-sm text-muted">casual frame · no filter · apartment</span>
                </div>
              </button>

              <div className="flex items-center gap-1 px-3 py-2">
                <button type="button" onClick={() => setLiked(!liked)} className="rounded-full p-2" aria-label="Нравится">
                  <Heart className={cn("size-5", liked && "fill-current")} />
                </button>
                <button type="button" onClick={() => setScreen("inbox")} className="rounded-full p-2" aria-label="Комментарий">
                  <MessageCircle className="size-5" />
                </button>
                <button type="button" className="rounded-full p-2" aria-label="Поделиться">
                  <Send className="size-5" />
                </button>
                <button type="button" onClick={() => setSaved(!saved)} className="ml-auto rounded-full p-2" aria-label="Сохранить">
                  <Bookmark className={cn("size-5", saved && "fill-current")} />
                </button>
              </div>
              <p className="px-4 pb-4 text-sm"><b>{liked ? "128" : "127"}</b> likes · <span className="text-muted">today</span></p>
            </article>
          </>
        ) : screen === "profile" ? (
          <section className="p-5">
            <div className="flex items-center gap-4">
              <div className="grid size-20 place-items-center rounded-full bg-surface text-2xl font-display">L</div>
              <div className="flex-1">
                <p className="text-lg font-medium">lena</p>
                <p className="text-sm text-muted">ordinary life, captured quietly</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-1">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" onClick={() => setScreen("home")} className="aspect-square bg-surface p-3 text-left">
                  <span className="text-xs text-muted">frame {n}</span>
                </button>
              ))}
            </div>
          </section>
        ) : screen === "search" ? (
          <section className="p-5">
            <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5">
              <Search className="size-4 text-muted" />
              <span className="text-sm text-muted">Search</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {["lena", "mira", "nika", "anna"].map((name) => (
                <button key={name} type="button" onClick={() => setScreen("profile")} className="rounded-2xl border border-border p-4 text-left">
                  <span className="grid size-10 place-items-center rounded-full bg-surface font-medium">{name[0].toUpperCase()}</span>
                  <span className="mt-3 block text-sm font-medium">{name}</span>
                  <span className="text-xs text-muted">profile</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="p-5">
            <h2 className="text-2xl font-display">Messages</h2>
            <div className="mt-5 space-y-2">
              {["lena", "mira", "nika"].map((name) => (
                <button key={name} type="button" onClick={() => setScreen("profile")} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-surface">
                  <span className="grid size-11 place-items-center rounded-full bg-surface font-medium">{name[0].toUpperCase()}</span>
                  <span className="flex-1"><b className="block text-sm">{name}</b><span className="text-xs text-muted">Tap to open chat preview</span></span>
                  <Bell className="size-4 text-muted" />
                </button>
              ))}
            </div>
          </section>
        )}

        <nav className="sticky bottom-0 flex h-16 items-center justify-around border-t border-border/70 bg-bg/95 backdrop-blur">
          <button type="button" onClick={() => setScreen("home")} className="rounded-full p-3" aria-label="Главная"><Home className="size-5" /></button>
          <button type="button" onClick={() => setScreen("search")} className="rounded-full p-3" aria-label="Поиск"><Search className="size-5" /></button>
          <button type="button" onClick={() => setScreen("inbox")} className="rounded-full p-3" aria-label="Сообщения"><MessageCircle className="size-5" /></button>
          <button type="button" onClick={() => setScreen("profile")} className="rounded-full p-3" aria-label="Профиль"><User className="size-5" /></button>
        </nav>
      </div>
    </main>
  );
}
