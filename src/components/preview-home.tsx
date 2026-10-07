import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronRight,
  Dices,
  Folder,
  Heart,
  Home,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type App = "instagram" | "dropbox" | "imagine";
type Chat = { name: string; preview: string; unread?: number };

const chatsSeed: Chat[] = [
  { name: "lena", preview: "я потом скину кадр", unread: 2 },
  { name: "mira", preview: "сегодня после восьми" },
  { name: "nika", preview: "посмотрела 👀" },
];

const mediaSeed = [
  { id: "1", name: "morning-light.jpg", tone: "sunrise" },
  { id: "2", name: "window-01.jpg", tone: "paper" },
  { id: "3", name: "kitchen.jpg", tone: "olive" },
  { id: "4", name: "street.mov", tone: "night" },
  { id: "5", name: "mirror.jpg", tone: "rose" },
  { id: "6", name: "late-sun.jpg", tone: "gold" },
];

const profilePosts = [1, 2, 3, 4, 5, 6];

function FauxAvatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-elevated font-medium text-fg",
        large ? "size-20 text-2xl font-display" : "size-10 text-sm",
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function MediaTile({ tone, className }: { tone: string; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-surface", className)} aria-hidden>
      <div
        className={cn(
          "absolute inset-0",
          tone === "sunrise" &&
            "bg-[radial-gradient(circle_at_72%_18%,rgba(248,217,168,.78),transparent_28%),linear-gradient(145deg,#5e5953,#d7b48e_58%,#eadfca)]",
          tone === "paper" &&
            "bg-[radial-gradient(circle_at_30%_35%,rgba(255,255,255,.7),transparent_18%),linear-gradient(145deg,#ddd7cb,#a79d8d)]",
          tone === "olive" &&
            "bg-[radial-gradient(circle_at_58%_30%,rgba(206,223,186,.6),transparent_24%),linear-gradient(145deg,#3d4438,#707a60_55%,#b8b49e)]",
          tone === "night" &&
            "bg-[radial-gradient(circle_at_70%_22%,rgba(220,208,185,.26),transparent_20%),linear-gradient(145deg,#101317,#27303a_58%,#556070)]",
          tone === "rose" &&
            "bg-[radial-gradient(circle_at_35%_22%,rgba(250,223,221,.7),transparent_22%),linear-gradient(145deg,#615253,#c7a5a1)]",
          tone === "gold" &&
            "bg-[radial-gradient(circle_at_78%_18%,rgba(255,224,152,.8),transparent_25%),linear-gradient(145deg,#5c4a3c,#b8874c_52%,#e0c08d)]",
        )}
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/35 to-transparent p-3">
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/70">preview frame</span>
      </div>
    </div>
  );
}

function ShellButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-sm transition",
        active ? "bg-surface text-fg shadow-[var(--shadow-border)]" : "text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function SettingsPreview({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"insta" | "dropbox" | "chat" | "more">("insta");
  const [autoSave, setAutoSave] = useState(true);
  const [haptic, setHaptic] = useState(false);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-bg/75 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <div className="flex h-[min(92dvh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-surface shadow-[var(--shadow-border)] sm:h-auto sm:max-h-[88dvh] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-6">
          <div>
            <h2 className="font-display text-2xl font-medium">Настройки</h2>
            <p className="mt-1 text-sm text-muted">UI preview · всё работает локально</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-muted hover:text-fg" aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>

        <div className="px-6 pb-3">
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-elevated p-1">
            {([
              ["insta", "Инста"],
              ["dropbox", "Диск"],
              ["chat", "Чат"],
              ["more", "Ещё"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "h-10 rounded-lg text-sm font-medium",
                  tab === id ? "bg-surface text-fg shadow-[var(--shadow-border)]" : "text-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
          {tab === "insta" ? (
            <div className="space-y-5">
              <SettingSection title="Apify">
                <p className="text-xs leading-relaxed text-muted">Сторис, хайлайты и посты. В preview поле просто показывает состояние.</p>
                <div className="mt-3 flex gap-2">
                  <input className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 text-sm outline-none" placeholder="apify_api_…" readOnly />
                  <button type="button" className="h-11 rounded-lg bg-elevated px-4 text-sm font-medium">Сохранить</button>
                </div>
              </SettingSection>
              <SettingSection title="Избранное">
                <div className="flex flex-wrap gap-2">
                  {["lena", "mira", "nika"].map((n) => (
                    <span key={n} className="rounded-full bg-elevated px-3 py-2 text-sm">@{n}</span>
                  ))}
                </div>
              </SettingSection>
            </div>
          ) : null}

          {tab === "dropbox" ? (
            <div className="space-y-5">
              <SettingSection title="Подключение">
                <div className="rounded-lg bg-elevated px-4 py-3 text-sm">В UI connected-state выглядит так</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" className="h-11 rounded-lg bg-fg text-bg text-sm font-medium">Проверить</button>
                  <button type="button" className="h-11 rounded-lg bg-elevated text-sm font-medium">Пробный файл</button>
                </div>
              </SettingSection>
              <SettingSection title="Папки">
                <PreviewField label="Корень Шторы" value="/Штора" />
                <PreviewField label="lena" value="/Штора/lena" />
                <PreviewField label="общее" value="/Штора/общее" />
              </SettingSection>
              <SettingSection title="Автосохранение">
                <ToggleRow label="Сторис и новые посты" checked={autoSave} onChange={setAutoSave} />
              </SettingSection>
            </div>
          ) : null}

          {tab === "chat" ? (
            <div className="space-y-5">
              <SettingSection title="Кто пишет">
                <p className="text-xs leading-relaxed text-muted">Фото и кубик — Imagine. Здесь только UI переключателей.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" className="h-11 rounded-lg bg-fg text-bg text-sm font-medium">Grok</button>
                  <button type="button" className="h-11 rounded-lg bg-elevated text-sm font-medium">Claude</button>
                </div>
              </SettingSection>
              <SettingSection title="Модель">
                <PreviewField label="Engine" value="grok" />
              </SettingSection>
            </div>
          ) : null}

          {tab === "more" ? (
            <div className="space-y-5">
              <SettingSection title="Интерфейс">
                <ToggleRow label="Haptic preview" checked={haptic} onChange={setHaptic} />
                <div className="mt-3 rounded-lg bg-elevated px-4 py-3 text-xs text-muted">
                  Preview mode никогда не обращается к серверу.
                </div>
              </SettingSection>
              <SettingSection title="Кэш">
                <button type="button" className="h-11 rounded-lg bg-elevated px-4 text-sm font-medium">Очистить локальный preview</button>
              </SettingSection>
            </div>
          ) : null}
        </div>

        <div className="border-t border-border/70 px-6 py-4">
          <button type="button" onClick={onClose} className="h-12 w-full rounded-xl bg-fg text-bg text-sm font-medium">
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="rounded-xl border border-border/70 bg-bg p-4">{children}</div>
    </section>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1 text-xs text-muted">{label}</p>
      <div className="flex h-11 items-center rounded-lg bg-elevated px-3 text-sm">{value}</div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn("relative h-7 w-12 rounded-full transition", checked ? "bg-fg" : "bg-elevated")}
        aria-pressed={checked}
      >
        <span className={cn("absolute top-1 size-5 rounded-full bg-bg transition", checked ? "left-6" : "left-1")} />
      </button>
    </div>
  );
}

function ChatsPreview({ onClose }: { onClose: () => void }) {
  const [thread, setThread] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Record<string, string[]>>({
    lena: ["ты опять без сна?", "я потом скину кадр", "если не усну первой"],
    mira: ["у меня сегодня тихий день", "после восьми буду свободна"],
    nika: ["посмотрела 👀"],
  });

  const currentMessages = thread ? messages[thread] || [] : [];

  if (thread) {
    return (
      <div className="fixed inset-0 z-[75] flex flex-col bg-bg">
        <header className="flex items-center gap-2 border-b border-border/70 px-3 py-3">
          <button type="button" className="rounded-full p-2" onClick={() => setThread(null)} aria-label="Назад">
            <ArrowLeft className="size-5" />
          </button>
          <FauxAvatar name={thread} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{thread}</p>
            <p className="text-xs text-muted">online · preview</p>
          </div>
          <button type="button" className="rounded-full p-2" aria-label="Чат заметки"><Menu className="size-5" /></button>
          <button type="button" className="rounded-full p-2" onClick={onClose} aria-label="Закрыть"><X className="size-5" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
            {currentMessages.map((text, i) => (
              <div key={`${thread}-${i}`} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm", i % 2 ? "bg-accent text-accent-fg" : "bg-elevated")}>
                  {text}
                </div>
              </div>
            ))}
            <div className="flex justify-start">
              <span className="rounded-2xl bg-elevated px-3 py-2 text-xs text-muted">печатает…</span>
            </div>
          </div>
        </div>

        <form
          className="mx-auto flex w-full max-w-2xl gap-2 border-t border-border/70 px-3 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            const value = draft.trim();
            if (!value) return;
            setMessages((prev) => ({ ...prev, [thread]: [...(prev[thread] || []), value] }));
            setDraft("");
          }}
        >
          <button type="button" className="grid size-12 shrink-0 place-items-center rounded-xl bg-elevated" aria-label="Вложение">
            <Paperclip className="size-5" />
          </button>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 outline-none" placeholder="Сообщение" />
          <button type="submit" className="grid size-12 shrink-0 place-items-center rounded-xl bg-fg text-bg disabled:opacity-40" disabled={!draft.trim()} aria-label="Отправить">
            <Send className="size-5" />
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[75] flex flex-col bg-bg">
      <header className="flex items-center justify-between px-3 py-3 sm:px-5">
        <div>
          <p className="font-display text-2xl">Чаты</p>
          <p className="text-xs text-muted">локальная демо-история</p>
        </div>
        <button type="button" className="rounded-full p-2" onClick={onClose} aria-label="Закрыть"><X className="size-5" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border/70">
        {chatsSeed.map((chat) => (
          <button
            key={chat.name}
            type="button"
            className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-4 text-left hover:bg-elevated"
            onClick={() => setThread(chat.name)}
          >
            <FauxAvatar name={chat.name} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{chat.name}</span>
                {chat.unread ? <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] text-fg">{chat.unread}</span> : null}
              </div>
              <p className="mt-1 truncate text-sm text-muted">{chat.preview}</p>
            </div>
            <ChevronRight className="size-5 text-subtle" />
          </button>
        ))}
      </div>
      <div className="border-t border-border/70 px-4 py-3 text-center text-xs text-muted">
        UI preview · сообщения никуда не отправляются
      </div>
    </div>
  );
}

export function PreviewHome() {
  const [app, setApp] = useState<App>("instagram");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [folder, setFolder] = useState("Штора");
  const [selected, setSelected] = useState<string[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);
  const [imagineTab, setImagineTab] = useState<"photo" | "live" | "edit">("photo");
  const [prompt, setPrompt] = useState("утро, тёплый свет, телефонный кадр, без постановки");
  const [generated, setGenerated] = useState(0);

  const selectedCount = selected.length;

  const folders = ["Штора", "общее", "lena", "mira", "nika"];

  const generatedLabel = useMemo(() => {
    if (!generated) return "Здесь появятся результаты";
    return generated === 1 ? "1 результат · локальный preview" : `${generated} результата · локальный preview`;
  }, [generated]);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-bg/90 pt-[max(.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="mx-auto w-full max-w-3xl px-4 pb-3 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-display text-[2rem] leading-none tracking-tight sm:text-4xl">Штора</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                <span>UI preview</span>
                <span className="rounded-full border border-border/70 px-2 py-0.5">offline</span>
              </div>
            </div>
            <button type="button" onClick={() => setSettingsOpen(true)} className="grid size-11 shrink-0 place-items-center rounded-full bg-elevated" aria-label="Настройки">
              <Settings className="size-5" />
            </button>
          </div>

          <nav className="mt-3 flex rounded-xl bg-elevated p-1" aria-label="Приложения">
            <ShellButton active={app === "instagram"} onClick={() => setApp("instagram")}>
              <Home className="size-4" />Instagram
            </ShellButton>
            <ShellButton active={app === "dropbox"} onClick={() => setApp("dropbox")}>
              <Folder className="size-4" />Файлы
            </ShellButton>
            <ShellButton active={app === "imagine"} onClick={() => setApp("imagine")}>
              <Dices className="size-4" />Imagine
            </ShellButton>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col px-4 pb-10 pt-5 sm:px-6">
        {app === "instagram" ? (
          profile ? (
            <ProfilePreview username={profile} onBack={() => setProfile(null)} onOpenChats={() => setChatsOpen(true)} />
          ) : (
            <InstagramPreview
              liked={liked}
              saved={saved}
              onLike={() => setLiked((v) => !v)}
              onSave={() => setSaved((v) => !v)}
              onOpenProfile={(name) => setProfile(name)}
              onOpenChats={() => setChatsOpen(true)}
            />
          )
        ) : null}

        {app === "dropbox" ? (
          <section>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm">/{folder === "Штора" ? "Штора" : `Штора/${folder}`}</div>
              <button type="button" className="grid size-12 place-items-center rounded-xl bg-elevated" aria-label="Фильтры"><SlidersHorizontal className="size-5" /></button>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {folders.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setFolder(name);
                    setSelected([]);
                  }}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-2 text-sm",
                    folder === name ? "bg-fg text-bg" : "bg-elevated text-muted",
                  )}
                >
                  {name}
                </button>
              ))}
            </div>

            {selectedCount ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-elevated p-2">
                <span className="px-2 text-sm">{selectedCount} выбрано</span>
                <button type="button" className="ml-auto rounded-lg px-3 py-2 text-sm" onClick={() => setSelected([])}>Снять</button>
                <button type="button" className="grid size-10 place-items-center rounded-lg bg-bg" aria-label="Удалить"><Trash2 className="size-4" /></button>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-3 gap-1.5">
              {mediaSeed.map((item, index) => {
                const active = selected.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn("relative aspect-square overflow-hidden rounded-lg bg-elevated text-left", active && "ring-2 ring-accent")}
                    onClick={() => {
                      if (selectedCount) {
                        setSelected((prev) => (active ? prev.filter((x) => x !== item.id) : [...prev, item.id]));
                      } else {
                        setViewer(item.id);
                      }
                    }}
                  >
                    <MediaTile tone={item.tone} className="size-full" />
                    {index < 2 ? <span className="absolute left-2 top-2 rounded-full bg-bg/75 px-2 py-1 text-[10px]">В ленте</span> : null}
                    {active ? <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-fg text-bg"><Check className="size-4" /></span> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {app === "imagine" ? (
          <section>
            <div className="flex gap-1 rounded-xl bg-elevated p-1">
              {([
                ["photo", "Фото"],
                ["live", "Live"],
                ["edit", "Edit"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setImagineTab(id)}
                  className={cn("h-10 flex-1 rounded-lg text-sm font-medium", imagineTab === id ? "bg-surface shadow-[var(--shadow-border)]" : "text-muted")}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4" />Imagine studio</div>
              <p className="mt-1 text-xs text-muted">Тут мы смотрим композицию и UX, а генератор не вызывается.</p>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {["source", "source-2", "history"].map((label, i) => (
                  <button key={label} type="button" className="aspect-square rounded-xl bg-elevated p-2 text-left">
                    <div className="flex size-full items-end rounded-lg bg-[linear-gradient(145deg,#484138,#a28d75)] p-2 text-[10px] uppercase tracking-[.16em] text-white/70">
                      {i === 2 ? "history" : "source"}
                    </div>
                  </button>
                ))}
              </div>

              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="mt-4 min-h-28 w-full resize-none rounded-xl border border-border bg-bg p-3 text-sm outline-none"
                placeholder="Опиши сцену…"
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {[1, 2, 4].map((n) => (
                  <button key={n} type="button" className={cn("rounded-lg px-3 py-2 text-xs", n === 1 ? "bg-fg text-bg" : "bg-elevated text-muted")}>x{n}</button>
                ))}
                <button type="button" className="ml-auto flex h-10 items-center gap-2 rounded-lg bg-fg px-4 text-sm font-medium text-bg" onClick={() => setGenerated((n) => n + 1)}>
                  <Dices className="size-4" />Собрать
                </button>
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Результаты</p>
                <span className="text-xs text-muted">{generatedLabel}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {Array.from({ length: Math.max(2, generated) }).map((_, i) => (
                  <div key={i} className="aspect-[4/5] overflow-hidden rounded-xl bg-surface">
                    <MediaTile tone={i % 2 ? "paper" : "sunrise"} className="size-full" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>

      <button
        type="button"
        onClick={() => setChatsOpen(true)}
        className="fixed bottom-4 right-4 z-40 grid size-12 place-items-center rounded-full bg-fg text-bg shadow-xl sm:right-6"
        aria-label="Чаты"
      >
        <MessageCircle className="size-5" />
      </button>

      {viewer ? (
        <div className="fixed inset-0 z-[70] bg-bg/95 p-4 backdrop-blur-sm">
          <div className="mx-auto flex h-full max-w-3xl flex-col">
            <header className="flex items-center justify-between py-2">
              <p className="text-sm text-muted">{mediaSeed.find((m) => m.id === viewer)?.name}</p>
              <button type="button" className="rounded-full p-2" onClick={() => setViewer(null)} aria-label="Закрыть">
                <X className="size-5" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-surface">
              <MediaTile tone={mediaSeed.find((m) => m.id === viewer)?.tone || "paper"} className="size-full min-h-[60vh]" />
            </div>
            <div className="flex items-center justify-center gap-2 py-4">
              <button type="button" className="rounded-lg bg-elevated px-4 py-2 text-sm">В ленту</button>
              <button type="button" className="rounded-lg bg-fg px-4 py-2 text-sm text-bg" onClick={() => setViewer(null)}>Готово</button>
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? <SettingsPreview onClose={() => setSettingsOpen(false)} /> : null}
      {chatsOpen ? <ChatsPreview onClose={() => setChatsOpen(false)} /> : null}
    </div>
  );
}

function InstagramPreview({
  liked,
  saved,
  onLike,
  onSave,
  onOpenProfile,
  onOpenChats,
}: {
  liked: boolean;
  saved: boolean;
  onLike: () => void;
  onSave: () => void;
  onOpenProfile: (name: string) => void;
  onOpenChats: () => void;
}) {
  return (
    <>
      <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
        <div className="relative min-w-0 flex-1">
          <input className="h-12 w-full rounded-xl border border-border bg-surface px-4 pr-11 text-sm outline-none" placeholder="поиск по нику" defaultValue="" />
          <Search className="pointer-events-none absolute right-3 top-3.5 size-5 text-muted" />
        </div>
        <button type="button" onClick={onOpenChats} className="grid size-12 shrink-0 place-items-center rounded-xl bg-elevated" aria-label="Сообщения">
          <MessageCircle className="size-5" />
        </button>
      </form>

      <div className="mt-4 flex gap-4 overflow-x-auto pb-1">
        {["you", "lena", "mira", "nika", "anna"].map((name, i) => (
          <button key={name} type="button" onClick={() => onOpenProfile(name)} className="shrink-0 text-center">
            <div className={cn("rounded-full p-0.5", i === 0 ? "ring-2 ring-fg" : "ring-1 ring-border")}><FauxAvatar name={name} /></div>
            <span className="mt-1 block max-w-14 truncate text-[11px] text-muted">{name}</span>
          </button>
        ))}
      </div>

      <article className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center gap-2 px-4 py-3">
          <button type="button" onClick={() => onOpenProfile("lena")}><FauxAvatar name="lena" /></button>
          <button type="button" onClick={() => onOpenProfile("lena")} className="min-w-0 text-left">
            <p className="text-sm font-medium">lena</p>
            <p className="text-xs text-muted">today · apartment</p>
          </button>
          <MoreHorizontal className="ml-auto size-5 text-muted" />
        </div>

        <button type="button" className="block aspect-[4/5] w-full text-left" onClick={() => onOpenProfile("lena")}>
          <MediaTile tone="sunrise" className="size-full" />
        </button>

        <div className="flex items-center gap-1 px-3 py-2">
          <button type="button" onClick={onLike} className="rounded-full p-2" aria-label="Нравится"><Heart className={cn("size-5", liked && "fill-danger text-danger")} /></button>
          <button type="button" onClick={onOpenChats} className="rounded-full p-2" aria-label="Комментарии"><MessageCircle className="size-5" /></button>
          <button type="button" className="rounded-full p-2" aria-label="Отправить"><Send className="size-5" /></button>
          <button type="button" onClick={onSave} className="ml-auto rounded-full p-2" aria-label="Сохранить"><Bookmark className={cn("size-5", saved && "fill-current")} /></button>
        </div>
        <div className="px-4 pb-4">
          <p className="text-sm font-medium">{liked ? "128" : "127"} likes</p>
          <p className="mt-1 text-sm"><b>lena</b> morning light, no filter, quiet apartment.</p>
          <p className="mt-1 text-xs text-muted">смотреть комментарии · 12</p>
        </div>
      </article>

      <section className="mt-5 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-xl">Навигация preview</p>
          <Sparkles className="size-4 text-muted" />
        </div>
        <p className="mt-1 text-xs text-muted">Нажимай на профиль, чат, настройки, файлы и Imagine — всё локальное.</p>
      </section>
    </>
  );
}

function ProfilePreview({ username, onBack, onOpenChats }: { username: string; onBack: () => void; onOpenChats: () => void }) {
  return (
    <>
      <header className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="rounded-full p-2" aria-label="Назад"><ArrowLeft className="size-5" /></button>
        <p className="font-medium">@{username}</p>
        <button type="button" onClick={onOpenChats} className="ml-auto rounded-full p-2" aria-label="Сообщение"><MessageCircle className="size-5" /></button>
      </header>

      <section className="mt-5 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-4">
          <FauxAvatar name={username} large />
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl">{username}</p>
            <p className="mt-1 text-sm text-muted">ordinary life, captured quietly</p>
            <div className="mt-3 flex gap-5 text-xs">
              <span><b>18</b> posts</span>
              <span><b>4</b> stories</span>
              <span><b>3</b> highlights</span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto">
          {["morning", "home", "weekend"].map((title) => (
            <button key={title} type="button" className="shrink-0 rounded-full bg-elevated px-3 py-2 text-xs">{title}</button>
          ))}
        </div>
      </section>

      <div className="mt-4 grid grid-cols-3 gap-1.5">
        {profilePosts.map((n) => (
          <button key={n} type="button" className="aspect-square overflow-hidden rounded-lg bg-surface">
            <MediaTile tone={["sunrise", "paper", "olive", "night", "rose", "gold"][n - 1]} className="size-full" />
          </button>
        ))}
      </div>
    </>
  );
}
