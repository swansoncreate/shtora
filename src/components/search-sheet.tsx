import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ShtoraPageHeader } from "@/components/shtora-page-header";
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
      <ShtoraPageHeader eyebrow="Поиск" title="Найти" onBack={onClose} onClose={undefined} />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6">
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
              className="h-13 rounded-full pl-12 pr-5 bg-surface/70"
            />
          </div>
          <Button type="submit" className="h-13 rounded-full px-6" disabled={!draft.trim()}>
            Найти
          </Button>
        </form>

        {suggestions.length ? (
          <section className="mt-10">
            <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.2em] text-subtle">Избранное</p>
            <div className="divide-y divide-border/50 border-y border-border/50">
              {suggestions.slice(0, 8).map((name) => (
                <button
                  key={name}
                  type="button"
                  className="flex w-full items-center gap-3 px-2 py-4 text-left hover:bg-elevated/45"
                  onClick={() => onSearch(name)}
                >
                  <span className="flex size-11 items-center justify-center rounded-full border border-border bg-surface font-display text-lg text-muted">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">@{name}</span>
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
