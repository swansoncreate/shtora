import { ArrowLeft, Search, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SearchSheet({
  open,
  onClose,
  onSearch,
  suggestions = [],
}: {
  open: boolean;
  onClose: () => void;
  onSearch: (username: string) => void;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");

  if (!open) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const clean = draft.trim().replace(/^@/, "").toLowerCase();
    if (!clean) return;
    onSearch(clean);
  }

  return (
    <div className="fixed inset-0 z-[60] flex min-h-dvh flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Поиск">
      <header className="flex items-center gap-2 border-b border-border/70 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-5">
        <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" aria-label="Назад" onClick={onClose}>
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl leading-none">Поиск</p>
          <p className="mt-1 text-xs text-muted">Instagram и профильные подборки</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" aria-label="Закрыть" onClick={onClose}>
          <X className="size-5" />
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-5 sm:px-6">
        <form onSubmit={submit} className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <Input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="введите @username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Поиск по нику"
              className="h-12 rounded-xl pl-11 pr-4"
            />
          </div>
          <Button type="submit" className="h-12 rounded-xl px-5" disabled={!draft.trim()}>
            Найти
          </Button>
        </form>

        {suggestions.length ? (
          <section className="mt-8">
            <p className="mb-3 text-xs uppercase tracking-[0.16em] text-subtle">Избранное</p>
            <div className="divide-y divide-border/60 rounded-2xl bg-surface">
              {suggestions.slice(0, 8).map((name) => (
                <button
                  key={name}
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left first:rounded-t-2xl last:rounded-b-2xl hover:bg-elevated"
                  onClick={() => onSearch(name)}
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-elevated font-display text-lg text-muted">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">@{name}</span>
                    <span className="block text-xs text-muted">Открыть профиль</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
