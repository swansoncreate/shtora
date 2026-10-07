import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ShtoraPageHeader } from "@/components/shtora-page-header";
import { Input } from "@/components/ui/input";

export function SearchSheet({
  open,
  onClose,
  onSearch,
  onSettings,
  suggestions = [],
}: {
  open: boolean;
  onClose: () => void;
  onSearch: (username: string) => void;
  onSettings?: () => void;
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
      <ShtoraPageHeader eyebrow="Explore" title="Поиск" onBack={onClose} onSettings={onSettings} />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6">
        <form onSubmit={submit} className="midnight-panel flex gap-2 rounded-[22px] p-2">
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
              className="h-12 rounded-[16px] border-0 bg-transparent pl-12 pr-5 shadow-none focus-visible:ring-0"
            />
          </div>
          <Button type="submit" className="midnight-gradient h-12 rounded-[16px] border-0 px-5 text-white" disabled={!draft.trim()}>
            Найти
          </Button>
        </form>

        {suggestions.length ? (
          <section className="mt-8">
            <p className="mb-4 text-[9px] font-bold uppercase tracking-[0.22em] text-accent">Избранное</p>
            <div className="space-y-2">
              {suggestions.slice(0, 8).map((name) => (
                <button
                  key={name}
                  type="button"
                  className="midnight-panel flex w-full items-center gap-3 rounded-[20px] px-3 py-3 text-left transition-transform hover:-translate-y-0.5"
                  onClick={() => onSearch(name)}
                >
                  <span className="size-12 overflow-hidden rounded-full border border-white/10 bg-elevated font-display text-lg text-muted">
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
