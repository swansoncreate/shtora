import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Dices, Instagram, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { DropboxBrowser } from "@/components/dropbox-browser";
import { ImagineStudio } from "@/components/imagine-studio";
import { ChatsSheet, useChatUnread, useChatUnreadMap } from "@/components/chats";
import { InstagramApp } from "@/components/instagram/app";
import { SettingsSheet } from "@/components/settings-sheet";
import { PreviewHome } from "@/components/preview-home";
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
    if (!settings.dropboxRefreshToken) return;
    void liveDropboxToken(settings.dropboxToken).catch(() => undefined);
  }, [settings.dropboxRefreshToken, settings.dropboxToken]);

  const caption = app === "dropbox" ? "Файлы" : app === "imagine" ? "Imagine" : "Лента";

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-bg/90 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md relative">
        <div className="pointer-events-none absolute inset-0 opacity-25 curtain-wash" aria-hidden />
        <div className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-3 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-display text-[2rem] font-medium leading-none tracking-tight text-fg sm:text-4xl">Штора</p>
              <p className="mt-1 text-sm text-muted">{caption}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 rounded-full"
              aria-label="Настройки"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="size-5" />
            </Button>
          </div>
          <nav className="mt-3 flex rounded-xl bg-elevated p-1" aria-label="Разделы">
            <AppTab
              label="Instagram"
              active={app === "instagram"}
              onClick={() => void navigate({ to: "/", search: { preview: "1" } })}
            >
              <Instagram className="size-4" />
            </AppTab>
            <AppTab
              label="Файлы"
              active={app === "dropbox"}
              onClick={() =>
                void navigate({
                  to: "/",
                  search: { app: "dropbox", p: dropboxPath, u: username || undefined, preview: "1" },
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
                  search: { app: "imagine", u: username || undefined, preview: "1" },
                })
              }
            >
              <Dices className="size-4" />
            </AppTab>
          </nav>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-10 pt-5 sm:px-6">
        {showPreview ? <PreviewHome settings={settings} app={app} onOpenChats={(name) => { setChatUser(name ?? null); setChatsOpen(true); }} onNeedSettings={() => setSettingsOpen(true)} /> : null}
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
        "flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-sm text-muted transition-colors duration-[var(--motion-quick)]",
        active && "bg-surface text-fg shadow-[var(--shadow-border)]",
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
