import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, House, MessageCircle, Search, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { DropboxBrowser } from "@/components/dropbox-browser";
import { ImagineStudio } from "@/components/imagine-studio";
import { ChatsSheet, useChatUnread, useChatUnreadMap } from "@/components/chats";
import { InstagramApp } from "@/components/instagram/app";
import { SettingsSheet } from "@/components/settings-sheet";
import { PreviewHome } from "@/components/preview-home";
import { ShtoraPageHeader } from "@/components/shtora-page-header";
import { WelcomeScreen } from "@/components/welcome-screen";
import { SearchSheet } from "@/components/search-sheet";
import { bootstrapStaticPreview } from "@/lib/static-preview";
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
  preview?: string;
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
    const preview = search.preview === "1" ? "1" : undefined;
    return { app, u, tab, p, preview };
  },
  component: Home,
});

function Home() {
  const search = Route.useSearch();
  const username = search.u ? cleanUsername(search.u) : "";
  const tab: Tab = search.tab ?? "posts";
  const app: AppView = search.app === "dropbox" || search.app === "imagine" ? search.app : "instagram";
  const preview = search.preview === "1";
  const staticPreview = import.meta.env.VITE_STATIC_PREVIEW === "1";
  const showPreview = preview || staticPreview;
  const clientOnlyPreview = showPreview;
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
  useEffect(() => {
    if (!staticPreview || !ready || !hydrated) return;
    void bootstrapStaticPreview();
  }, [staticPreview, ready, hydrated]);
  useAutoSave(settings, !clientOnlyPreview && ready && hydrated);
  useServerState(!clientOnlyPreview && ready && hydrated);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(showPreview);
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
    if (staticPreview) {
      setApiOk(null);
      return;
    }
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatUser, setChatUser] = useState<string | null>(null);
  const chatUnread = useChatUnread();
  const chatUnreadMap = useChatUnreadMap();
  useChatPings(settings.favorites, !clientOnlyPreview && ready && hydrated, chatsOpen ? chatUser : null);
  useChatEngine(!clientOnlyPreview && ready && hydrated, chatsOpen ? chatUser : null);
  useChatDiskSync(!clientOnlyPreview && ready && hydrated);

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
    if (!showPreview || typeof window === "undefined") return;
    if (window.localStorage.getItem("shtora-entry-seen") === "1") setEntryOpen(false);
  }, [showPreview]);
  useEffect(() => {
    if (!settings.dropboxRefreshToken) return;
    void liveDropboxToken(settings.dropboxToken).catch(() => undefined);
  }, [settings.dropboxRefreshToken, settings.dropboxToken]);

  useEffect(() => {
    if (app !== "instagram") {
      setSearchOpen(false);
      setChatsOpen(false);
      setChatUser(null);
    }
  }, [app]);

  const caption = app === "dropbox" ? "Файлы" : app === "imagine" ? "Imagine" : "Лента";

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {!showPreview ? <ShtoraPageHeader eyebrow={caption} title="Штора" onSettings={() => setSettingsOpen(true)} /> : null}

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pb-28 pt-4 sm:px-6 sm:pt-5">
        {showPreview ? <PreviewHome settings={settings} app={app} username={username} onOpenChats={(name) => { setChatUser(name ?? null); setChatsOpen(true); }} onNeedSettings={() => setSettingsOpen(true)} /> : null}
        {!showPreview && (offline || apiOk === false) ? (
          <div
            className="mb-4 flex items-center gap-2 rounded-lg bg-surface px-3 py-2.5 text-sm text-fg shadow-[var(--shadow-border)]"
            role="status"
          >
            <AlertCircle className="size-4 shrink-0 text-danger" />
            <p className="min-w-0 flex-1">Сервер не отвечает — данные не подтянуть</p>
          </div>
        ) : null}
        {!showPreview ? (
          app === "dropbox" ? (
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
          )
        ) : null}

        <SearchSheet
          open={searchOpen}
          suggestions={showPreview ? ["ellissawe", "minsiyaaa", "sheptnowa", "sofia"] : settings.favorites}
          onSettings={() => setSettingsOpen(true)}
          onClose={() => setSearchOpen(false)}
          onSearch={(name) => {
            setSearchOpen(false);
            void navigate({
              to: "/",
              search: { u: name, ...(showPreview ? { preview: "1" as const } : {}) },
            });
          }}
        />

        <ChatsSheet
          open={chatsOpen}
          username={chatUser}
          onSettings={() => setSettingsOpen(true)}
          previewMode={showPreview}
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
        <BottomNav
          app={app}
          chatsOpen={chatsOpen}
          searchOpen={searchOpen}
          onHome={() => {
            setSearchOpen(false);
            setChatsOpen(false);
            setChatUser(null);
            void navigate({ to: "/", search: showPreview ? { preview: "1" } : {} });
          }}
          onSearch={() => {
            setChatsOpen(false);
            setChatUser(null);
            void navigate({ to: "/", search: showPreview ? { preview: "1" } : {} });
            setSearchOpen(true);
          }}
          onChats={() => {
            setSearchOpen(false);
            setChatUser(null);
            void navigate({ to: "/", search: showPreview ? { preview: "1" } : {} });
            setChatsOpen(true);
          }}
          onDropbox={() => {
            setSearchOpen(false);
            setChatsOpen(false);
            setChatUser(null);
            void navigate({
              to: "/",
              search: { app: "dropbox", p: dropboxPath, u: username || undefined, ...(showPreview ? { preview: "1" as const } : {}) },
            });
          }}
          onImagine={() => {
            setSearchOpen(false);
            setChatsOpen(false);
            setChatUser(null);
            void navigate({
              to: "/",
              search: { app: "imagine", u: username || undefined, ...(showPreview ? { preview: "1" as const } : {}) },
            });
          }}
        />
      </div>
    </div>
  );
}

function BottomNav({
  app,
  chatsOpen,
  searchOpen,
  onHome,
  onSearch,
  onChats,
  onDropbox,
  onImagine,
}: {
  app: AppView;
  chatsOpen: boolean;
  searchOpen: boolean;
  onHome: () => void;
  onSearch: () => void;
  onChats: () => void;
  onDropbox: () => void;
  onImagine: () => void;
}) {
  const itemClass = (active: boolean) =>
    cn(
      "group relative flex h-12 items-center justify-center rounded-2xl text-muted transition-all duration-[var(--motion-quick)]",
      "hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
      active && "text-fg",
    );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[65] px-3 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 pointer-events-none sm:px-4"
      aria-label="Основная навигация"
    >
      <div className="pointer-events-auto mx-auto grid max-w-md grid-cols-[1fr_1fr_auto_1fr_1fr] items-end rounded-[28px] border border-border/70 bg-surface/88 px-2 py-2 shadow-[0_20px_70px_rgba(0,0,0,0.48)] backdrop-blur-2xl">
        <button type="button" className={itemClass(app === "instagram" && !searchOpen && !chatsOpen)} aria-label="Главное" aria-current={app === "instagram" ? "page" : undefined} onClick={onHome}>
          <span className="flex flex-col items-center gap-1">
            <House className={cn("size-5", app === "instagram" && "fill-current")} />
            <span className="text-[8px] uppercase tracking-[0.14em]">Лента</span>
          </span>
        </button>
        <button type="button" className={itemClass(searchOpen)} aria-label="Поиск" aria-current={searchOpen ? "page" : undefined} onClick={onSearch}>
          <span className="flex flex-col items-center gap-1">
            <Search className={cn("size-5", searchOpen && "stroke-[2.4]")} />
            <span className="text-[8px] uppercase tracking-[0.14em]">Поиск</span>
          </span>
        </button>

        <button
          type="button"
          className="relative -mt-7 flex size-14 items-center justify-center rounded-full border border-white/10 text-white shadow-[0_12px_35px_rgba(124,107,255,0.34)]"
          style={{ background: "linear-gradient(135deg,#7c6bff,#f36b9a)" }}
          aria-label="Imagine"
          aria-current={app === "imagine" ? "page" : undefined}
          onClick={onImagine}
        >
          <Sparkles className="size-6" />
          <span className="absolute -bottom-5 rounded-full bg-surface px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-accent shadow-[0_4px_16px_rgba(0,0,0,0.25)]">Imagine</span>
        </button>

        <button type="button" className={itemClass(chatsOpen)} aria-label="Сообщения" aria-current={chatsOpen ? "page" : undefined} onClick={onChats}>
          <span className="flex flex-col items-center gap-1">
            <MessageCircle className={cn("size-5", chatsOpen && "fill-current")} />
            <span className="text-[8px] uppercase tracking-[0.14em]">Чаты</span>
          </span>
        </button>
        <button type="button" className={itemClass(app === "dropbox")} aria-label="Архив" aria-current={app === "dropbox" ? "page" : undefined} onClick={onDropbox}>
          <span className="flex flex-col items-center gap-1">
            <DropboxMark className={cn("size-5", app === "dropbox" && "fill-current")} />
            <span className="text-[8px] uppercase tracking-[0.14em]">Архив</span>
          </span>
        </button>
      </div>
    </nav>
  );
}

function DropboxMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M6.01 2.4 12 6.16 6.01 9.92.02 6.16 6.01 2.4Zm11.98 0L24 6.16l-6.01 3.76L12 6.16l5.99-3.76ZM12 13.84l6.01-3.76L24 13.84l-6.01 3.76L12 13.84ZM6.01 10.08l5.99 3.76-5.99 3.76L.02 13.84l5.99-3.76ZM12 15.2l6.01 3.76L12 22.72l-6.01-3.76L12 15.2Z" />
    </svg>
  );
}
