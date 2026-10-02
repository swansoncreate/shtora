import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { asBond, bondFromBackstory, type ChatBond } from "@/lib/chat/bond";
import { CHAT_DOCS, METRIC_HELP, explainBond } from "@/lib/chat/explain";
import { applyBackstory, getThread, patchThread, resetGrokGame, setBondManual, subscribeChats } from "@/lib/chat/store";
import {
  BACKSTORY_TEMPLATE,
  addChatEvent,
  chatBackstoryFor,
  chatEventsFor,
  chatSetupFor,
  isBlankBackstory,
  removeChatEvent,
  setChatBackstory,
  useShtoraSettings,
} from "@/lib/shtora-settings";
import { cn } from "@/lib/utils";

type Tab = "story" | "events" | "metrics" | "docs";

const TABS: { id: Tab; label: string; title: string }[] = [
  { id: "story", label: "Канон", title: "Предыстория" },
  { id: "events", label: "События", title: "События" },
  { id: "metrics", label: "Метрики", title: "Метрики" },
  { id: "docs", label: "Справка", title: "Как устроено" },
];

export function ChatSetup({ username, onClose }: { username: string; onClose: () => void }) {
  const { settings, hydrated } = useShtoraSettings();
  const [tab, setTab] = useState<Tab>("story");
  const [notes, setNotes] = useState("");
  const [events, setEvents] = useState(() => [] as ReturnType<typeof chatEventsFor>);
  const [whenDraft, setWhenDraft] = useState("Вчера");
  const [eventDraft, setEventDraft] = useState("");
  const [thread, setThread] = useState(() => getThread(username));
  const [bond, setBond] = useState<ChatBond>(() => asBond(getThread(username)?.bond, getThread(username)?.warmth ?? 40));
  const [place, setPlace] = useState("");
  const [clothes, setClothes] = useState("");
  const [hair, setHair] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    const story = chatBackstoryFor(username, settings);
    setNotes(story || BACKSTORY_TEMPLATE);
    setEvents(chatEventsFor(username, settings));
    const setup = chatSetupFor(username, settings);
    const live = getThread(username);
    setPlace(live?.world?.place || setup?.place || "");
    setClothes(live?.world?.clothes || setup?.clothes || "");
    setHair(live?.world?.hair || setup?.hair || "");
    if (live?.bond) setBond(asBond(live.bond, live.warmth));
    else if (setup) {
      setBond(
        asBond(
          {
            warmth: setup.warmth,
            trust: setup.trust,
            heat: setup.heat,
            irrit: setup.irrit,
            guilt: setup.guilt,
            spark: setup.spark,
          },
          setup.warmth ?? 40,
        ),
      );
    }
    setReady(true);
  }, [hydrated, username]);

  useEffect(() => {
    return subscribeChats(() => {
      const next = getThread(username);
      setThread(next);
    });
  }, [username]);

  const card = useMemo(() => explainBond(bond, notes), [bond, notes]);

  function slide(key: keyof ChatBond, value: number) {
    const next = { ...bond, [key]: value };
    if (key === "warmth") next.warmth = value;
    setBond(next);
    void setBondManual(username, next);
  }

  function saveAll() {
    if (!ready) return;
    if (!isBlankBackstory(notes)) setChatBackstory(username, notes);
    void applyBackstory(username, isBlankBackstory(notes) ? chatBackstoryFor(username) : notes);
    void patchThread(username, {
      world: { place: place.trim(), clothes: clothes.trim(), hair: hair.trim() },
    });
    void setBondManual(username, bond);
  }

  function seedFromStory() {
    const next = bondFromBackstory(notes);
    setBond(next);
    void applyBackstory(username, notes, { resetMetrics: true }).then(() => toast.success("Метрики по предыстории"));
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-surface">
      <header className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <p className="font-display text-2xl font-medium tracking-tight text-fg">Настройки чата</p>
          <p className="mt-1 truncate text-sm text-muted">@{username}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 rounded-md"
          onClick={() => {
            saveAll();
            onClose();
          }}
          aria-label="Закрыть"
        >
          <X className="size-5" />
        </Button>
      </header>
      <div className="grid shrink-0 grid-cols-4 gap-1 px-5 pb-3">
        <div className="col-span-4 grid grid-cols-4 gap-1 rounded-xl bg-elevated p-1">
          {TABS.map((row) => (
            <button
              key={row.id}
              type="button"
              title={row.title}
              aria-label={row.title}
              className={cn(
                "h-10 rounded-lg text-sm font-medium",
                tab === row.id ? "bg-surface text-fg shadow-[var(--shadow-border)]" : "text-muted",
              )}
              onClick={() => setTab(row.id)}
            >
              {row.label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        {!ready ? <p className="py-8 text-center text-sm text-muted">Загружаю настройки…</p> : null}
        {tab === "story" ? (
          <div className="flex min-h-full flex-col">
            <p className="mb-3 text-xs font-medium tracking-wide text-subtle uppercase">Канон</p>
            <p className="text-xs text-muted">Пустое поле — вы не знакомы. На метрики само не давит, пока не нажмёшь «подогнать».</p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={4000}
              placeholder={BACKSTORY_TEMPLATE}
              className="mt-3 min-h-64 flex-1 text-sm"
            />
            <Button
              type="button"
              className="mt-3 h-11"
              disabled={!ready}
              onClick={() => {
                if (isBlankBackstory(notes)) {
                  toast.message("Пустой шаблон не сохраняю — старая предыстория на месте");
                  return;
                }
                setChatBackstory(username, notes);
                void applyBackstory(username, notes).then(() => toast.success("Предыстория сохранена"));
              }}
            >
              Сохранить
            </Button>
          </div>
        ) : null}

        {tab === "events" ? (
          <div>
            <p className="text-xs text-muted">Факты, которые она помнит. Дата — как удобно: «вчера», «5 лет назад».</p>
            <div className="mt-3 flex gap-2">
              <Input
                value={whenDraft}
                onChange={(e) => setWhenDraft(e.target.value)}
                placeholder="Когда"
                className="h-11 w-28 shrink-0"
                maxLength={80}
              />
              <Input
                value={eventDraft}
                onChange={(e) => setEventDraft(e.target.value)}
                placeholder="Что случилось"
                className="h-11 min-w-0 flex-1"
                maxLength={280}
              />
              <Button
                type="button"
                className="h-11 shrink-0"
                disabled={!eventDraft.trim()}
                onClick={() => {
                  const row = addChatEvent(username, whenDraft, eventDraft);
                  if (row.text) {
                    setEvents(chatEventsFor(username));
                    setEventDraft("");
                  }
                }}
              >
                +
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {events.length === 0 ? <p className="py-8 text-center text-sm text-subtle">Пока пусто</p> : null}
              {events.map((row) => (
                <div key={row.id} className="flex items-start gap-2 rounded-lg bg-elevated px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">{row.when}</p>
                    <p className="text-sm text-fg">{row.text}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label="Удалить событие"
                    onClick={() => {
                      removeChatEvent(username, row.id);
                      setEvents(chatEventsFor(username));
                    }}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "metrics" ? (
          <div className="space-y-5">
            <div className="rounded-xl bg-elevated px-4 py-3">
              <p className="font-display text-2xl leading-none">{card.title}</p>
              <p className="mt-1 text-xs text-muted">тяга {card.pull} / 100 · {card.relation === "stranger" ? "почти не знакомы" : card.relation}</p>
              <p className="mt-2 text-sm text-fg">{card.style}</p>
              <p className="mt-2 text-xs text-muted">Темы: {card.topics.join(" · ")}</p>
              <p className="mt-2 text-xs text-fg">Может: {card.can.join("; ") || "—"}</p>
              <p className="mt-1 text-xs text-muted">Ещё рано: {card.cannot.join("; ") || "—"}</p>
              <p className="mt-2 text-xs text-fg">{card.photos}</p>
              <p className="mt-1 text-xs text-muted">{card.pings}</p>
            </div>
            {METRIC_HELP.map((row) => (
              <label key={row.key} className="block">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-fg">{row.label}</span>
                  <span className="text-sm text-muted">{bond[row.key]}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={bond[row.key]}
                  onChange={(e) => slide(row.key, Number(e.target.value))}
                  className="shtora-range mt-2 w-full"
                />
                <span className="mt-1 block text-xs text-subtle">{row.hint}</span>
              </label>
            ))}
            <div className="space-y-2">
              <p className="text-sm text-fg">Сейчас</p>
              <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Где (дом, смена, улица)" maxLength={80} />
              <Input value={clothes} onChange={(e) => setClothes(e.target.value)} placeholder="Одежда" maxLength={80} />
              <Input value={hair} onChange={(e) => setHair(e.target.value)} placeholder="Волосы" maxLength={80} />
              <Button
                type="button"
                variant="subtle"
                className="h-11 w-full"
                onClick={() => {
                  void patchThread(username, { world: { place: place.trim(), clothes: clothes.trim(), hair: hair.trim() } });
                  toast.success("Обстоятельства сохранены");
                }}
              >
                Сохранить «сейчас»
              </Button>
            </div>
            <Button type="button" variant="ghost" className="h-11 w-full text-muted" onClick={seedFromStory}>
              Подогнать метрики под предысторию
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full text-muted"
              onClick={() => {
                void resetGrokGame(username).then(() => toast.success("Новая партия Grok — правила с следующего сообщения"));
              }}
            >
              Новая партия Grok
            </Button>
            {thread?.warmthDay ? (
              <p className="text-center text-xs text-subtle">сегодня близость уже +{thread.warmthUp || 0} из 10 автоматом</p>
            ) : null}
          </div>
        ) : null}

        {tab === "docs" ? (
          <div className="space-y-5 pb-6">
            {CHAT_DOCS.map((row) => (
              <section key={row.title}>
                <p className="font-display text-xl leading-tight">{row.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{row.body}</p>
              </section>
            ))}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 px-5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          type="button"
          className="h-11 w-full rounded-lg"
          disabled={!ready}
          onClick={() => {
            saveAll();
            onClose();
          }}
        >
          Готово
        </Button>
      </div>
    </div>
  );
}
