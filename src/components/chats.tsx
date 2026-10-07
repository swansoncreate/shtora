import { ChevronLeft, CircleCheck, Heart, LoaderCircle, NotebookPen, Send, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ChatSetup } from "@/components/chat-setup";
import { ProfilePhotoViewer } from "@/components/profile-photo";
import { MediaImg } from "@/components/media-img";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildPersona, stripChatMeta, storyFacts } from "@/lib/chat/functions";
import { dumpBond } from "@/lib/chat/bond";
import {
  appendMessage,
  bumpWarmth,
  deleteThread,
  clearAllChats,
  ensureThread,
  getThread,
  hydrateChats,
  listThreads,
  markThreadRead,
  markAllChatsRead,
  patchThread,
  performAction,
  setMessageHeart,
  subscribeChats,
  unreadTotal,
  viewOncePhoto,
  type ChatThread,
} from "@/lib/chat/store";
import { getCachedProfile } from "@/lib/instagram/cache";
import { storiesUnseen, useUnseenTick } from "@/lib/instagram/unseen";
import { resolveChatImage } from "@/lib/instagram/media-cache";
import { chatBackstoryFor } from "@/lib/shtora-settings";
import { isChatTyping, resetChatEngine, subscribeTyping } from "@/lib/chat/engine";
import { herAsk } from "@/lib/chat/life";
import { cn } from "@/lib/utils";
import { ShtoraPageHeader } from "@/components/shtora-page-header";

export function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-fg",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function useChatUnreadMap() {
  const [map, setMap] = useState<Record<string, number>>({});
  useEffect(() => {
    const sync = () => {
      const next: Record<string, number> = {};
      for (const thread of listThreads()) {
        if (thread.unread) next[thread.username] = thread.unread;
      }
      setMap((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(next);
        if (prevKeys.length === nextKeys.length && nextKeys.every((k) => prev[k] === next[k])) return prev;
        return next;
      });
    };
    void hydrateChats().then(sync);
    return subscribeChats(sync);
  }, []);
  return map;
}

export function useChatUnread() {
  const [n, setN] = useState(0);
  useEffect(() => {
    void hydrateChats().then(() => setN(unreadTotal()));
    return subscribeChats(() => {
      const next = unreadTotal();
      setN((prev) => (prev === next ? prev : next));
    });
  }, []);
  return n;
}

export function ChatsSheet({
  open,
  username,
  onClose,
}: {
  open: boolean;
  username?: string | null;
  onClose: () => void;
}) {
  const [threadUser, setThreadUser] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void hydrateChats();
    setThreadUser(username ? username.toLowerCase() : null);
  }, [open, username]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] flex min-h-dvh flex-col bg-bg pointer-events-auto" role="dialog" aria-modal="true" aria-label="Чаты">
      {threadUser ? (
        <ThreadView username={threadUser} onBack={() => setThreadUser(null)} onClose={onClose} />
      ) : (
        <InboxView onOpen={setThreadUser} onClose={onClose} />
      )}
    </div>
  );
}

function InboxView({ onOpen, onClose }: { onOpen: (username: string) => void; onClose: () => void }) {
  const [threads, setThreads] = useState<ChatThread[]>(listThreads());
  useUnseenTick();
  useEffect(() => {
    const sync = () => setThreads(listThreads());
    void hydrateChats().then(sync);
    return subscribeChats(sync);
  }, []);

  return (
    <>
      <ShtoraPageHeader eyebrow="Сообщения" title="Чаты" onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-muted">
            На профиле нажми «Написать» — переписка сохранится здесь.
          </p>
        ) : (
          threads.map((thread) => {
            const last = thread.messages[thread.messages.length - 1];
            return (
              <div key={thread.username} className="flex items-center gap-1 border-b border-border/45 pr-2 transition-colors hover:bg-elevated/45">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-4 px-6 py-4 text-left"
                onClick={() => onOpen(thread.username)}
              >
                <span
                  className={cn(
                    "size-13 shrink-0 rounded-full border p-[2px]",
                    storiesUnseen(thread.username) ? "border-accent" : "border-border",
                  )}
                >
                  <span className="block size-full overflow-hidden rounded-full border-2 border-bg bg-elevated">
                    {thread.avatar ? <MediaImg src={thread.avatar} alt="" className="size-full object-cover" /> : null}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-fg">{thread.fullName || thread.username}</span>
                    {thread.unread ? <UnreadBadge count={thread.unread} /> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {previewText(last)}
                  </span>
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 shrink-0 rounded-full"
                aria-label="Удалить чат"
                onClick={() => {
                  resetChatEngine(thread.username);
                  void deleteThread(thread.username).then(() => toast.message("Чат стёрт"));
                }}
              >
                <Trash2 className="size-4 text-muted" />
              </Button>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function ThreadView({
  username,
  onBack,
  onClose,
}: {
  username: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const [thread, setThread] = useState(() => getThread(username));
  const [draft, setDraft] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [openPhoto, setOpenPhoto] = useState<string | null>(null);
  const [onceView, setOnceView] = useState<{ id: string; url: string } | null>(null);
  const [typing, setTyping] = useState(() => isChatTyping(username));
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const profile = getCachedProfile(username)?.data;
    void (async () => {
      try {
        await ensureThread({
          username,
          fullName: profile?.fullName || username,
          avatar: profile?.profilePicUrl,
        });
        if (cancelled) return;
        await markThreadRead(username);
        if (cancelled) return;
        setThread(getThread(username));
        const t = getThread(username);
        if (t?.persona) return;
        const captions = (profile?.posts ?? [])
          .map((post) => post.caption)
          .filter((c): c is string => Boolean(c?.trim()))
          .slice(0, 8)
          .map((c) => c.slice(0, 180));
        const card = await buildPersona({
          data: {
            username,
            fullName: profile?.fullName || t?.fullName,
            bio: profile?.biography?.slice(0, 400),
            captions,
          },
        });
        if (!cancelled && card.ok) await patchThread(username, { persona: card.persona, mood: card.mood });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  useEffect(() => {
    return subscribeChats(() => setThread(getThread(username)));
  }, [username]);

  useEffect(() => {
    const sync = () => setTyping(isChatTyping(username));
    sync();
    return subscribeTyping(sync);
  }, [username]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length, typing]);

  useEffect(() => {
    const urls = (thread?.messages ?? []).map((m) => m.imageUrl).filter((u): u is string => Boolean(u));
    void Promise.all(urls.map((u) => resolveChatImage(u)));
  }, [thread?.messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await appendMessage(username, { role: "user", text, kind: "text" });
  }

  async function sendHeart() {
    await appendMessage(username, { role: "user", text: "", kind: "heart", heartByUser: true });
    await bumpWarmth(username, 1);
  }

  async function toggleHeart(id: string, already?: boolean) {
    await setMessageHeart(username, id, "user", !already);
    await bumpWarmth(username, already ? -1 : 1);
  }

  async function doAction(id: string) {
    const ask = await performAction(username, id);
    if (ask) toast.success(ask.did);
  }

  const messages = thread?.messages ?? [];
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const metrics = thread
    ? dumpBond(thread.bond, thread.warmth, storyFacts(chatBackstoryFor(username)).girlfriend)
    : null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ShtoraPageHeader
        eyebrow={
          metrics
            ? `${thread?.mood || `@${username}`} · ${metrics.head}`
            : thread?.mood || `@${username}`
        }
        title={thread?.fullName || `@${username}`}
        onBack={onBack}
        actions={
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full" aria-label="Настройки чата" onClick={() => setNotesOpen(true)}>
              <NotebookPen className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 rounded-full"
              aria-label="Удалить чат"
              onClick={() => {
                void deleteThread(username).then(() => {
                  resetChatEngine(username);
                  toast.message("Переписка стёрта. Предыстория и метрики на месте");
                  onBack();
                });
              }}
            >
              <Trash2 className="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full" onClick={onClose} aria-label="Закрыть">
              <X className="size-4" />
            </Button>
          </div>
        }
      />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Напиши первым. Может прислать фото.</p>
        ) : null}
        {messages.map((item, index) => {
          const text = stripChatMeta(item.text);
          const story = item.kind === "story";
          const post = item.kind === "post";
          const heartOnly = item.kind === "heart" && !item.imageUrl && !text;
          const actionDone = item.kind === "action";
          const circle = item.kind === "circle" && Boolean(item.imageUrl);
          const ask = streakAsk(messages, index);
          return (
            <div key={item.id} className={cn("flex", item.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(circle ? "max-w-none" : "max-w-[80%]")}>
                <div
                  className={cn(
                    "relative text-sm",
                    circle
                      ? "overflow-visible bg-transparent px-0 py-0"
                      : "overflow-hidden rounded-lg px-3 py-2",
                    circle
                      ? ""
                      : heartOnly
                      ? "bg-transparent px-0 py-0"
                      : actionDone
                        ? "bg-accent/20 text-fg ring-1 ring-accent/40"
                        : item.role === "user"
                        ? "bg-accent text-accent-fg"
                        : "bg-elevated text-fg",
                  )}
                  onDoubleClick={() => void toggleHeart(item.id, item.heartByUser)}
                >
                  {story && item.imageUrl ? (
                    <button type="button" className="mb-2 flex items-center gap-2 text-left" onClick={() => setOpenPhoto(item.imageUrl!)}>
                      <span className="size-12 shrink-0 overflow-hidden rounded-md ring-2 ring-accent">
                        <ChatPic url={item.imageUrl} />
                      </span>
                      <span>
                        <span className="block text-[10px] uppercase tracking-wide opacity-70">ответ на сторис</span>
                        {item.heartByUser ? <Heart className="mt-1 size-4 fill-danger text-danger" /> : null}
                      </span>
                    </button>
                  ) : post && item.imageUrl ? (
                    <button type="button" className="mb-2 flex items-center gap-2 text-left" onClick={() => setOpenPhoto(item.imageUrl!)}>
                      <span className="size-12 shrink-0 overflow-hidden rounded-md">
                        <ChatPic url={item.imageUrl} />
                      </span>
                      <span className="block text-[10px] uppercase tracking-wide opacity-70">пост</span>
                    </button>
                  ) : item.once && item.viewed ? (
                    <p className="text-xs text-muted">открыто</p>
                  ) : item.once && item.imageUrl ? (
                    <button
                      type="button"
                      className="relative mb-1 h-44 w-32 overflow-hidden rounded-lg bg-elevated text-left"
                      onClick={() => {
                        void resolveChatImage(item.imageUrl!).then((url) =>
                          setOnceView({ id: item.id, url: url || item.imageUrl! }),
                        );
                      }}
                    >
                      <span className="pointer-events-none absolute inset-0 opacity-40 blur-md">
                        <ChatPic url={item.imageUrl} />
                      </span>
                      <span className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
                        <span className="text-[10px] uppercase tracking-wide text-fg">фото</span>
                        <span className="text-sm text-fg">1 просмотр</span>
                      </span>
                    </button>
                  ) : item.kind === "circle" && item.imageUrl ? (
                    <CircleNote url={item.imageUrl} />
                  ) : item.imageUrl ? (
                    <button type="button" className="mb-1 block w-full" onClick={() => {
                      void resolveChatImage(item.imageUrl!).then((url) => setOpenPhoto(url || item.imageUrl!));
                    }}>
                      <ChatPic url={item.imageUrl} />
                    </button>
                  ) : null}
                  {heartOnly ? <Heart className="size-10 fill-danger text-danger" /> : null}
                  {actionDone ? <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">сделал</p> : null}
                  {text ? <p className="whitespace-pre-wrap">{text}</p> : null}
                </div>
                <div className={cn("mt-0.5 flex items-center gap-1", item.role === "user" ? "justify-end" : "justify-start")}>
                  <span className="text-[10px] text-subtle">{formatMsgTime(item.at)}</span>
                  {item.role === "user" && lastUser && item.id === lastUser.id ? (
                    <span className="text-[10px] text-subtle">
                      {thread?.seenAt && thread.seenAt >= item.at ? "просм." : "✓"}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-full p-1"
                    aria-label="Сердечко"
                    onClick={() => void toggleHeart(item.id, item.heartByUser)}
                  >
                    <Heart
                      className={cn(
                        "size-3.5",
                        item.heartByUser || item.heartByHer ? "fill-danger text-danger" : "text-subtle",
                      )}
                    />
                  </button>
                  {ask ? (
                    <button
                      type="button"
                      className="rounded-full p-1"
                      aria-label="Сделать"
                      onClick={() => void doAction(item.id)}
                    >
                      <CircleCheck className="size-3.5 text-accent" />
                    </button>
                  ) : null}
                  {item.heartByUser || item.heartByHer ? (
                    <span className="text-[10px] text-muted">
                      {item.heartByUser && item.heartByHer ? "вы оба" : item.heartByHer ? "она" : "ты"}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        {typing ? (
          <div className="flex justify-start">
            <p className="flex items-center gap-2 rounded-lg bg-elevated px-3 py-2 text-sm text-muted">
              <LoaderCircle className="size-3.5 animate-spin" />
              печатает
            </p>
          </div>
        ) : null}
        <div ref={bottom} />
      </div>
      <form
        className="flex gap-2 border-t border-border/60 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5"
        onSubmit={(e) => void send(e)}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Сообщение"
          maxLength={500}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-12 w-12 shrink-0 rounded-lg"
          aria-label="Сердечко"
          onClick={() => void sendHeart()}
        >
          <Heart className="size-5" />
        </Button>
        <Button type="submit" size="lg" className="h-12 w-12 shrink-0 rounded-lg px-0" disabled={!draft.trim()} aria-label="Отправить">
          <Send className="size-5" />
        </Button>
      </form>
      {notesOpen ? (
        <ChatSetup
          username={username}
          onClose={() => {
            setNotesOpen(false);
            setThread(getThread(username));
          }}
        />
      ) : null}
      {openPhoto ? (
        <ProfilePhotoViewer url={openPhoto} username={username} onClose={() => setOpenPhoto(null)} />
      ) : null}
      {onceView ? (
        <OncePhoto url={onceView.url} username={username} onClose={() => {
          const id = onceView.id;
          setOnceView(null);
          void viewOncePhoto(username, id);
        }} />
      ) : null}
    </div>
  );
}

function OncePhoto({ url, username, onClose }: { url: string; username: string; onClose: () => void }) {
  const [src, setSrc] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void resolveChatImage(url).then((next) => {
      if (live) setSrc(next || url);
    });
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label="Фото один раз"
      onClick={onClose}
    >
      <header className="flex items-center justify-between px-3 py-3">
        <p className="text-sm text-muted">@{username} · 1 просмотр</p>
        <Button type="button" variant="ghost" size="icon" className="size-10" onClick={onClose} aria-label="Закрыть">
          <X className="size-5" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2">
        {!src && !failed ? <LoaderCircle className="size-6 animate-spin text-muted" /> : null}
        {src && !failed ? (
          <img
            src={src}
            alt=""
            className="max-h-full max-w-full rounded-md object-contain"
            referrerPolicy="no-referrer"
            onError={() => {
              if (src !== url) setSrc(url);
              else setFailed(true);
            }}
          />
        ) : null}
        {failed ? <p className="text-sm text-muted">не загрузилось</p> : null}
      </div>
    </div>
  );
}

function formatMsgTime(at: number) {
  const d = new Date(at);
  const now = new Date();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const date = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  if (d.toDateString() === now.toDateString()) return `сегодня, ${time}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `вчера, ${date}, ${time}`;
  return `${date}, ${time}`;
}

function visibleText(raw: string) {
  return stripChatMeta(raw);
}

function previewText(last?: ChatThread["messages"][number]) {
  if (!last) return "";
  if (last.kind === "heart") return "❤️";
  if (last.kind === "story") return "ответ на сторис";
  if (last.kind === "post") return "на твой пост";
  const text = visibleText(last.text);
  if (text) return text;
  if (last.imageUrl) return "Фото";
  return "";
}

function streakAsk(messages: { role: string; text: string; acted?: boolean }[], index: number) {
  const item = messages[index];
  if (!item || item.role !== "assistant" || item.acted) return null;
  if (messages[index + 1]?.role === "assistant") return null;
  const parts: string[] = [];
  for (let i = index; i >= 0 && messages[i]?.role === "assistant"; i -= 1) {
    parts.unshift(messages[i]?.text || "");
  }
  return herAsk(parts.join("\n"));
}

function ChatPic({ url }: { url: string }) {
  const [src, setSrc] = useState<string | undefined>(() =>
    url.startsWith("data:") || url.startsWith("blob:") ? url : undefined,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    void (async () => {
      const next = await resolveChatImage(url);
      if (live) {
        if (next) setSrc(next);
        else setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [url]);

  if (!src || failed) {
    return <div className="max-h-72 w-full rounded-md bg-elevated" />;
  }
  return (
    <img
      src={src}
      alt=""
      className="max-h-72 w-full rounded-md object-cover"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function CircleNote({ url }: { url: string }) {
  const wrap = useRef<HTMLButtonElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [wide, setWide] = useState(false);
  const [src, setSrc] = useState("");
  const [clip, setClip] = useState(() => /\.(mp4|webm|mov)(\?|$)/i.test(url) || /id=.*\.mp4/i.test(url));

  useEffect(() => {
    let live = true;
    void (async () => {
      const next = await resolveChatImage(url);
      if (!live || !next) return;
      setSrc(next);
      if (next.startsWith("blob:")) {
        try {
          const blob = await fetch(next).then((r) => r.blob());
          if (live) setClip(blob.type.startsWith("video/"));
        } catch {
          /* keep */
        }
      } else {
        setClip(/\.(mp4|webm|mov)(\?|$)/i.test(url) || /[.]mp4/i.test(url));
      }
    })();
    return () => {
      live = false;
    };
  }, [url]);

  useEffect(() => {
    if (!wide) return;
    const onDoc = (e: PointerEvent) => {
      const root = wrap.current;
      if (root && e.target instanceof Node && root.contains(e.target)) return;
      setWide(false);
      if (video.current) video.current.muted = true;
    };
    document.addEventListener("pointerdown", onDoc, true);
    return () => document.removeEventListener("pointerdown", onDoc, true);
  }, [wide]);

  return (
    <button
      ref={wrap}
      type="button"
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-full bg-black transition-[width,height] duration-200",
        wide ? "size-64" : "size-36",
      )}
      aria-label="Кружок"
      onClick={() => {
        setWide(true);
        const el = video.current;
        if (!el) return;
        el.muted = false;
        void el.play();
      }}
    >
      {clip && src ? (
        <video
          ref={video}
          src={src}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onError={() => setClip(false)}
        />
      ) : src ? (
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
    </button>
  );
}
