import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Dices, Instagram, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { DropboxBrowser } from "@/components/dropbox-browser";
import { ImagineStudio } from "@/components/imagine-studio";
import { ChatsSheet, useChatUnread, useChatUnreadMap } from "@/components/chats";
import { InstagramApp } from "@/components/instagram/app";
import { SettingsSheet } from "@/components/settings-sheet";
import { Button } from "@/components/ui/button";
import { CHAT_OPEN_EVENT } from "@/lib/chat/send";
import { useChatEngine } from "@/lib/chat/engine";
import { useChatPings } from "@/lib/chat/pings";
import { useChatDiskSync } from "@/lib/chat/sync";
import { liveDropboxToken } from "@/lib/dropbox/token";
import { useAutoSave } from "@/lib/dropbox/use-autosave";
import { useServerState } from "@/lib/server/use-server-state";
import { useShtoraSettings } from "@/lib/shtora-settings";
import { apiFetch } from "@/lib/shtora-origin";
import { cleanUsername, cn } from "@/lib/utils";

type Tab = "posts" | "stories" | "highlights";
type AppView = "instagram" | "dropbox" | "imagine";

type SearchParams = {
  app?: AppView;
  u?: string;
  tab?: Tab;
  p?: string;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    const u = typeof search.u === "string" && search.u.trim() ? search.u : undefined;
    const tab =
      search.tab === "stories" || search.tab === "highlights" || search.tab === "posts"
        ? search.tab
        : undefined;
    const app = search.app === "dropbox" || search.app === "imagine" ? search.app : undefined;
    const p = typeof search.p === "string" && search.p.trim() ? search.p : undefined;
    return { app, u, tab, p };
  },
  component: Home,
});

function Home() {
  const search = Route.useSearch();
  const username = search.u ? cleanUsername(search.u) : "";
  const tab: Tab = search.tab ?? "posts";
  const app: AppView = search.app === "dropbox" || search.app === "imagine" ? search.app : "instagram";
  const navigate = useNavigate({ from: "/" });
  const { settings, patch, setAccountFolder, hydrated } = useShtoraSettings();
  const dropboxPath = search.p || settings.defaultFolder || "/Штора";
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((reg) => reg.unregister())));
    if (typeof caches !== "undefined") {
      void caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("shtora-")).map((k) => caches.delete(k))));
    }
  }, []);
  useAutoSave(settings, ready && hydrated);
  useServerState(ready && hydrated);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  useEffect(() => {
    const sync = () => setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const res = await apiFetch("/api/health", { cache: "no-store" });
        if (!cancelled) setApiOk(res.ok);
      } catch {
        if (!cancelled) setApiOk(false);
      }
    }
    void ping();
    const id = window.setInterval(ping, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [chatUser, setChatUser] = useState<string | null>(null);
  const chatUnread = useChatUnread();
  const chatUnreadMap = useChatUnreadMap();
  useChatPings(settings.favorites, ready && hydrated, chatsOpen ? chatUser : null);
  useChatEngine(ready && hydrated, chatsOpen ? chatUser : null);
  useChatDiskSync(ready && hydrated);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const name = (e as CustomEvent<{ username?: string }>).detail?.username;
      if (!name) return;
      setChatUser(name);
      setChatsOpen(true);
    };
    window.addEventListener(CHAT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CHAT_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!settings.dropboxRefreshToken) return;
    void liveDropboxToken(settings.dropboxToken).catch(() => undefined);
  }, [settings.dropboxRefreshToken, settings.dropboxToken]);

  const caption = app === "dropbox" ? "Файлы" : app === "imagine" ? "Imagine" : "Лента";

  return (
    <div className="min-h-dvh flex flex-col bg-bg text-fg">
      <header className="sticky top-0 z-20 relative border-b border-border/70 bg-bg/90 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 opacity-25 curtain-wash" aria-hidden />
        <div className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-display text-[2.25rem] font-semibold leading-[0.9] tracking-[-0.04em] text-fg sm:text-4xl">штора</p>
              <p className="mt-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted"><span className="size-1.5 rounded-full bg-accent" />{caption}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 rounded-2xl border border-border/70 bg-surface shadow-[var(--shadow-border)]"
              aria-label="Настройки"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="size-5" />
            </Button>
          </div>
          <nav className="mt-4 flex gap-1 rounded-2xl border border-border/60 bg-surface/80 p-1.5 shadow-[var(--shadow-border)]" aria-label="Разделы">
            <AppTab
              label="Instagram"
              active={app === "instagram"}
              onClick={() => void navigate({ to: "/", search: {} })}
            >
              <Instagram className="size-4" />
            </AppTab>
            <AppTab
              label="Файлы"
              active={app === "dropbox"}
              onClick={() =>
                void navigate({
                  to: "/",
                  search: { app: "dropbox", p: dropboxPath, u: username || undefined },
                })
              }
            >
              <DropboxMark className="size-4" />
            </AppTab>
            <AppTab
              label="Imagine"
              active={app === "imagine"}
              onClick={() =>
                void navigate({
                  to: "/",
                  search: { app: "imagine", u: username || undefined },
                })
              }
            >
              <Dices className="size-4" />
            </AppTab>
          </nav>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-10 pt-5 sm:px-6">
        {offline || apiOk === false ? (
          <div
            className="mb-4 flex items-center gap-2 rounded-lg bg-surface px-3 py-2.5 text-sm text-fg shadow-[var(--shadow-border)]"
            role="status"
          >
            <AlertCircle className="size-4 shrink-0 text-danger" />
            <p className="min-w-0 flex-1">Сервер не отвечает — данные не подтянуть</p>
          </div>
        ) : null}
        {app === "dropbox" ? (
          <DropboxBrowser
            settings={settings}
            path={dropboxPath}
            onPath={(next) =>
              void navigate({
                to: "/",
                search: { app: "dropbox", p: next, u: username || undefined },
              })
            }
            onNeedToken={() => setSettingsOpen(true)}
          />
        ) : app === "imagine" ? (
          <ImagineStudio settings={settings} onNeedToken={() => setSettingsOpen(true)} />
        ) : (
          <InstagramApp
            username={username}
            tab={tab}
            settings={settings}
            ready={ready}
            hydrated={hydrated}
            chatUnread={chatUnread}
            chatUnreadMap={chatUnreadMap}
            onOpenUser={(name, nextTab) =>
              void navigate({
                to: "/",
                search: { u: cleanUsername(name) || undefined, tab: nextTab === "stories" ? "stories" : undefined },
              })
            }
            onOpenChats={(name) => {
              setChatUser(name ?? null);
              setChatsOpen(true);
            }}
            onNeedToken={() => setSettingsOpen(true)}
          />
        )}

        <ChatsSheet
          open={chatsOpen}
          username={chatUser}
          onClose={() => {
            setChatsOpen(false);
            setChatUser(null);
          }}
        />
        <SettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={settings}
          onPatch={patch}
          onAccountFolder={setAccountFolder}
        />
      </div>
    </div>
  );
}

function AppTab({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-[12px] font-semibold text-muted transition-all duration-[var(--motion-quick)]",
        active && "bg-accent text-accent-fg shadow-sm",
      )}
    >
      {children}
      <span className="truncate">{label}</span>
    </button>
  );
}

function DropboxMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M6.01 2.4 12 6.16 6.01 9.92.02 6.16 6.01 2.4Zm11.98 0L24 6.16l-6.01 3.76L12 6.16l5.99-3.76ZM12 13.84l6.01-3.76L24 13.84l-6.01 3.76L12 13.84ZM6.01 10.08l5.99 3.76-5.99 3.76L.02 13.84l5.99-3.76ZM12 15.2l6.01 3.76L12 22.72l-6.01-3.76L12 15.2Z" />
    </svg>
  );
}
