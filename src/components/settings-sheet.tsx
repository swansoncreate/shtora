import { checkDropbox, listFolders } from "@/lib/dropbox/functions";
import { getLastRun } from "@/lib/dropbox/saved";
import { SHTORA_PHOTO_TAG } from "@/lib/dropbox/tags";
import { dropboxAuthorizeUrl, dropboxRedirectUri, liveDropboxToken } from "@/lib/dropbox/token";
import { clearIgCache } from "@/lib/instagram/cache";
import { clearMediaCache } from "@/lib/instagram/media-cache";
import { clearSeen } from "@/lib/instagram/unseen";
import { FEED_PROMPT } from "@/lib/imagine/prompt";
import { type ShtoraSettings, type ShtoraSettingsPatch } from "@/lib/shtora-settings";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/shtora-origin";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, Folder, LoaderCircle, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type PickerTarget = "default" | string;
type SettingsTab = "insta" | "dropbox" | "chat" | "more";

export function SettingsSheet({
  open,
  onOpenChange,
  settings,
  onPatch,
  onAccountFolder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ShtoraSettings;
  onPatch: (partial: ShtoraSettingsPatch) => void;
  onAccountFolder: (name: string, path: string) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [probing, setProbing] = useState(false);
  const [listing, setListing] = useState(false);
  const [picker, setPicker] = useState<{ target: PickerTarget; path: string } | null>(null);
  const [folders, setFolders] = useState<{ name: string; path: string }[]>([]);
  const [lastLog, setLastLog] = useState<string | undefined>(undefined);
  const [clearing, setClearing] = useState(false);
  const [chatDump, setChatDump] = useState("");
  const [tab, setTab] = useState<SettingsTab>("insta");
  const [apifyDraft, setApifyDraft] = useState("");
  const [appKeyDraft, setAppKeyDraft] = useState("");
  const [appSecretDraft, setAppSecretDraft] = useState("");
  const [chatKeyDraft, setChatKeyDraft] = useState("");
  const [secretFlags, setSecretFlags] = useState({ hiker: false, tikhub: false, apify: false, dropbox: false });

  async function saveSecrets(partial: Record<string, string>) {
    const body = Object.fromEntries(Object.entries(partial).filter(([, value]) => value.trim()));
    if (!Object.keys(body).length) return;
    const res = await apiFetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const flags = (await res.json().catch(() => null)) as typeof secretFlags | null;
    if (!res.ok || !flags) throw new Error("Не удалось сохранить");
    setSecretFlags(flags);
    setApifyDraft("");
    setAppSecretDraft("");
    setChatKeyDraft("");
    onPatch({ apifyToken: "", dropboxAppSecret: "", chatApiKey: "" });
  }

  useEffect(() => {
    if (!open) {
      setPicker(null);
      return;
    }
    setLastLog(getLastRun().log);
  }, [open]);

  async function probeDropbox() {
    setProbing(true);
    try {
      const token = await liveDropboxToken(settings.dropboxToken);
      const form = new FormData();
      form.set("token", token);
      form.set("destPath", `${settings.defaultFolder || "/Штора"}/.shtora-check.txt`);
      form.set("file", new Blob(["shtora ok\n"], { type: "text/plain" }), "shtora-check.txt");
      const res = await apiFetch("/api/dropbox-upload", { method: "POST", body: form });
      const parsed = (await res.json().catch(() => null)) as { path?: string; error?: string } | null;
      if (!res.ok || !parsed?.path) throw new Error(parsed?.error || "Пробная загрузка не прошла");
      toast.success(`Пробный файл: ${parsed.path}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Пробная загрузка не прошла");
    } finally {
      setProbing(false);
    }
  }

  async function verifyDropbox() {
    setChecking(true);
    try {
      const token = await liveDropboxToken(settings.dropboxToken);
      const account = await checkDropbox({ data: { token } });
      toast.success(`Dropbox: ${account.name || account.email || "аккаунт"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось проверить Dropbox");
    } finally {
      setChecking(false);
    }
  }

  async function openPicker(target: PickerTarget) {
    let token = settings.dropboxToken.trim();
    try {
      token = await liveDropboxToken(token);
    } catch {
      toast.error("Сначала подключите Dropbox");
      return;
    }
    const start = target === "default" ? settings.defaultFolder : settings.accountFolders[target];
    setPicker({ target, path: parentPath(start) });
    await loadFolders(token, parentPath(start));
  }

  function connectDropboxForever() {
    const key = appKeyDraft.trim() || settings.dropboxAppKey.trim();
    const secret = appSecretDraft.trim() || settings.dropboxAppSecret.trim();
    if (!key || !secret) {
      toast.error("Сначала вставь App key и App secret");
      return;
    }
    const redirect = dropboxRedirectUri();
    sessionStorage.setItem("shtora-dbx-key", key);
    sessionStorage.setItem("shtora-dbx-secret", secret);
    void saveSecrets({ dropboxAppKey: key, dropboxAppSecret: secret }).catch(() => undefined);
    setAppSecretDraft("");
    window.location.href = dropboxAuthorizeUrl(key, redirect);
  }

  async function loadFolders(token: string, path: string) {
    setListing(true);
    try {
      const result = await listFolders({ data: { token, path } });
      setFolders(result.folders);
      setPicker((prev) => (prev ? { ...prev, path: result.path } : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось открыть папки");
    } finally {
      setListing(false);
    }
  }

  function applyFolder(path: string) {
    if (!picker) return;
    if (picker.target === "default") onPatch({ defaultFolder: path || "/Штора" });
    else onAccountFolder(picker.target, path);
    setPicker(null);
    toast.success("Папка выбрана");
  }

  async function wipeCache() {
    setClearing(true);
    try {
      clearIgCache();
      clearSeen();
      await clearMediaCache();
      toast.success("Кэш очищен.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось очистить кэш");
    } finally {
      setClearing(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg/70" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex h-dvh w-[min(92vw,30rem)] flex-col overflow-hidden rounded-l-2xl bg-surface shadow-[-8px_0_32px_rgba(0,0,0,0.28),var(--shadow-border)] outline-none"
          aria-describedby="settings-desc"
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-3">
            <div>
              <Dialog.Title className="font-display text-2xl font-medium tracking-tight text-fg">Настройки</Dialog.Title>
              <Dialog.Description id="settings-desc" className="mt-1 text-sm text-muted">
                Живут на сервере — очистка Chrome их не сотрёт.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-md" aria-label="Закрыть">
                <X className="size-5" />
              </Button>
            </Dialog.Close>
          </div>

          {picker ? null : (
            <div className="grid shrink-0 grid-cols-4 gap-1 px-6 pb-3">
              <div className="col-span-4 grid grid-cols-4 gap-1 rounded-xl bg-elevated p-1">
                {(
                  [
                    ["insta", "Инста"],
                    ["dropbox", "Диск"],
                    ["chat", "Чат"],
                    ["more", "Ещё"],
                  ] as const
                ).map(([id, label]) => (
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
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
            {picker ? (
              <FolderBrowser
                path={picker.path}
                folders={folders}
                listing={listing}
                onBack={() => {
                  const token = settings.dropboxToken.trim();
                  const next = parentPath(picker.path);
                  setPicker({ ...picker, path: next });
                  if (token) void loadFolders(token, next);
                }}
                onEnter={(path) => {
                  const token = settings.dropboxToken.trim();
                  setPicker({ ...picker, path });
                  if (token) void loadFolders(token, path);
                }}
                onSelect={applyFolder}
                onCancel={() => setPicker(null)}
              />
            ) : (
              <>
                {tab === "insta" ? (
                  <>
                    <Section title="Apify">
                      <p className="mb-3 text-xs leading-relaxed text-subtle">
                        Сторис, хайлайты и посты. «Обновить» в профиле — только если ждут новое.
                      </p>
                      <label className="mb-2 block text-sm font-medium text-fg" htmlFor="apify-token">
                        Токен
                      </label>
                      <Input
                        id="apify-token"
                        value={apifyDraft}
                        onChange={(e) => setApifyDraft(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        type="password"
                        placeholder={secretFlags.apify || settings.apifyToken ? "задан, не показываем" : "apify_api_…"}
                      />
                      <Button
                        type="button"
                        variant="subtle"
                        className="mt-3 h-11 rounded-lg"
                        onClick={() => void saveSecrets({ apifyToken: apifyDraft }).then(() => toast.success("Сохранено")).catch((err) => toast.error(err instanceof Error ? err.message : "Не удалось сохранить"))}
                      >
                        Сохранить
                      </Button>
                    </Section>
                    <Section title="Кэш">
                      <p className="text-xs leading-relaxed text-subtle">Посты на диске сервера. Очистка снова потратит Apify.</p>
                      <Button
                        type="button"
                        variant="subtle"
                        className="mt-3 h-11 rounded-lg"
                        onClick={() => void wipeCache()}
                        disabled={clearing}
                      >
                        {clearing ? <LoaderCircle className="size-4 animate-spin" /> : null}
                        Очистить кэш
                      </Button>
                    </Section>
                  </>
                ) : null}

                {tab === "dropbox" ? (
                  <>
                    <Section title="Подключение">
                      {settings.dropboxRefreshToken ? (
                        <p className="mb-3 rounded-lg bg-elevated px-4 py-3 text-sm text-fg">Подключено. Токен обновляется сам.</p>
                      ) : (
                        <p className="mb-3 text-xs leading-relaxed text-subtle">
                          Один раз OAuth. Generate в Dropbox даёт ключ на 4 часа — его не надо.
                        </p>
                      )}
                      <label className="mb-2 block text-sm font-medium text-fg" htmlFor="dropbox-app-key">
                        App key
                      </label>
                      <Input
                        id="dropbox-app-key"
                        value={appKeyDraft}
                        onChange={(e) => setAppKeyDraft(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={settings.dropboxAppKey ? "задан, вставь заново для OAuth" : "из Settings приложения Dropbox"}
                      />
                      <label className="mb-2 mt-3 block text-sm font-medium text-fg" htmlFor="dropbox-app-secret">
                        App secret
                      </label>
                      <Input
                        id="dropbox-app-secret"
                        value={appSecretDraft}
                        onChange={(e) => setAppSecretDraft(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        type="password"
                        placeholder={secretFlags.dropbox || settings.dropboxAppSecret ? "задан, не показываем" : "Show рядом с App secret"}
                      />
                      <p className="mt-3 text-xs leading-relaxed text-subtle">Redirect URI — в Dropbox App → OAuth 2:</p>
                      <p className="mt-1 break-all rounded-lg bg-elevated px-3 py-2 font-mono text-[11px] text-muted">
                        {typeof window !== "undefined" ? dropboxRedirectUri() : "/dropbox-oauth"}
                      </p>
                      <Button type="button" className="mt-3 h-11 w-full rounded-lg" onClick={() => connectDropboxForever()}>
                        Подключить навсегда
                      </Button>
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          variant="subtle"
                          className="h-11 flex-1 rounded-lg"
                          onClick={() => void verifyDropbox()}
                          disabled={checking || probing}
                        >
                          {checking ? <LoaderCircle className="size-4 animate-spin" /> : "Проверить"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 flex-1 rounded-lg"
                          onClick={() => void probeDropbox()}
                          disabled={checking || probing}
                        >
                          {probing ? <LoaderCircle className="size-4 animate-spin" /> : "Пробный файл"}
                        </Button>
                      </div>
                    </Section>
                    <Section title="Папки">
                      <FolderField
                        id="folder-default"
                        label="Корень Шторы"
                        value={settings.defaultFolder}
                        onChange={(value) => onPatch({ defaultFolder: value })}
                        onBrowse={() => void openPicker("default")}
                      />
                      <p className="mt-2 text-xs text-muted">Избранные — своя папка. Поиск без звезды — в «общее».</p>
                      <p className="mt-2 text-xs leading-relaxed text-muted">
                        В ленту и в фото лички берётся только фото с меткой {SHTORA_PHOTO_TAG}. В папке Dropbox нажми «Выбрать» и «В ленту», либо открой фото и нажми «В ленту».
                      </p>
                      <div className="mt-4 grid grid-cols-1 gap-3">
                        {settings.favorites.map((name) => (
                          <FolderField
                            key={name}
                            id={`folder-${name}`}
                            label={name}
                            value={settings.accountFolders[name] || `${settings.defaultFolder}/${name}`}
                            onChange={(value) => onAccountFolder(name, value)}
                            onBrowse={() => void openPicker(name)}
                          />
                        ))}
                      </div>
                    </Section>
                    <Section title="Автосохранение">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-fg">Сторис и новые посты</p>
                          <p className="mt-1 text-xs leading-relaxed text-subtle">Раз в сутки само, заходить не нужно.</p>
                        </div>
                        <Toggle checked={settings.autoSave} onCheckedChange={(checked) => onPatch({ autoSave: checked })} />
                      </div>
                      {lastLog ? <p className="mt-3 text-xs text-muted">{lastLog}</p> : null}
                    </Section>
                  </>
                ) : null}

                {tab === "chat" ? (
                  <Section title="Кто пишет">
                    <p className="mb-3 text-xs leading-relaxed text-subtle">
                      Фото и кубик всегда Imagine. Предыстория — внутри чата, не здесь.
                    </p>
                    <div className="mb-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className={`h-11 rounded-lg text-sm font-medium ${settings.chatEngine === "grok" ? "bg-fg text-bg" : "bg-elevated text-muted"}`}
                        onClick={() => onPatch({ chatEngine: "grok" })}
                      >
                        Grok
                      </button>
                      <button
                        type="button"
                        className={`h-11 rounded-lg text-sm font-medium ${settings.chatEngine === "claude" ? "bg-fg text-bg" : "bg-elevated text-muted"}`}
                        onClick={() => onPatch({ chatEngine: "claude" })}
                      >
                        Claude
                      </button>
                    </div>
                    {settings.chatEngine === "claude" ? (
                      <>
                        <label className="mb-2 block text-sm font-medium text-fg" htmlFor="openrouter-key">
                          OpenRouter
                        </label>
                        <Input
                          id="openrouter-key"
                          type="password"
                          value={chatKeyDraft}
                          onChange={(e) => setChatKeyDraft(e.target.value)}
                          onBlur={() => {
                            if (!chatKeyDraft.trim()) return;
                            void saveSecrets({ chatApiKey: chatKeyDraft }).catch(() => undefined);
                          }}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={settings.chatApiKey ? "задан, не показываем" : "sk-or-v1-…"}
                        />
                        <label className="mb-2 mt-4 block text-sm font-medium text-fg" htmlFor="chat-model">
                          Модель
                        </label>
                        <Input
                          id="chat-model"
                          value={settings.chatModel}
                          onChange={(e) => onPatch({ chatModel: e.target.value })}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="anthropic/claude-sonnet-4"
                        />
                      </>
                    ) : (
                      <p className="text-xs leading-relaxed text-subtle">Чат идёт через ключ xAI на сервере.</p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 h-11 w-full rounded-lg"
                      onClick={async () => {
                        try {
                          const { flushChatsToDisk, chatsAsMarkdown, chatsAsJson, hydrateChats } = await import("@/lib/chat/store");
                          await hydrateChats();
                          const text = chatsAsMarkdown();
                          const json = chatsAsJson();
                          await flushChatsToDisk();
                          setChatDump(text);
                          if (!text.trim()) {
                            toast.message("Чатов нет.");
                            return;
                          }
                          try {
                            await navigator.clipboard.writeText(text);
                          } catch {
                            /* iOS */
                          }
                          try {
                            const blob = new Blob([json], { type: "application/json" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = "shtora-chats.json";
                            a.click();
                            window.setTimeout(() => URL.revokeObjectURL(url), 4000);
                          } catch {
                            /* ignore */
                          }
                          toast.success("Чаты скопированы.");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Не удалось выгрузить чаты");
                        }
                      }}
                    >
                      Скопировать чаты
                    </Button>
                    {chatDump ? (
                      <Textarea
                        className="mt-3 min-h-40 font-mono text-[11px]"
                        value={chatDump}
                        readOnly
                        aria-label="Переписки"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                    ) : null}
                  </Section>
                ) : null}

                {tab === "more" ? (
                  <Section title="Кубик">
                    <label className="mb-2 block text-sm font-medium text-fg" htmlFor="imagine-prompt">
                      Промпт ленты
                    </label>
                    <Textarea
                      id="imagine-prompt"
                      value={settings.imaginePrompt}
                      onChange={(e) => onPatch({ imaginePrompt: e.target.value })}
                      maxLength={800}
                      spellCheck={false}
                    />
                    <p className="mt-2 text-xs leading-relaxed text-muted">
                      Лента отправляет этот текст как есть. Лицо — случайное фото с меткой. Место, одежду и позу задаёт сам промпт.
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-xs text-subtle">{settings.imaginePrompt.length}/800</p>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 rounded-lg px-3"
                        onClick={() => onPatch({ imaginePrompt: FEED_PROMPT })}
                      >
                        Сбросить
                      </Button>
                    </div>
                  </Section>
                ) : null}
              </>
            )}
          </div>

          {!picker ? (
            <div className="flex justify-end gap-2 px-6 py-4">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Готово
              </Button>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border border-t py-5 first:border-t-0 first:pt-1">
      <p className="mb-3 text-xs font-medium tracking-wide text-subtle uppercase">{title}</p>
      {children}
    </section>
  );
}

function FolderField({
  id,
  label,
  value,
  onChange,
  onBrowse,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBrowse: () => void;
}) {
  return (
    <div className="mt-3">
      <label className="mb-2 block text-sm font-medium text-fg" htmlFor={id}>
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoCapitalize="none"
          placeholder="/Штора"
        />
        <Button
          type="button"
          variant="subtle"
          className="size-12 shrink-0 rounded-lg"
          onClick={onBrowse}
          aria-label="Выбрать папку в Dropbox"
        >
          <Folder className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function FolderBrowser({
  path,
  folders,
  listing,
  onBack,
  onEnter,
  onSelect,
  onCancel,
}: {
  path: string;
  folders: { name: string; path: string }[];
  listing: boolean;
  onBack: () => void;
  onEnter: (path: string) => void;
  onSelect: (path: string) => void;
  onCancel: () => void;
}) {
  const display = path || "/";
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon" className="size-10" onClick={onBack} aria-label="Назад" disabled={!path}>
          <ChevronLeft className="size-5" />
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm text-muted">{display}</p>
      </div>
      <div className="max-h-64 overflow-y-auto rounded-lg bg-elevated">
        {listing ? (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" />
            Загружаем папки
          </p>
        ) : folders.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">Здесь нет вложенных папок.</p>
        ) : (
          <ul>
            {folders.map((folder) => (
              <li key={folder.path} className="border-border border-b last:border-b-0">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-fg hover:bg-surface"
                  onClick={() => onEnter(folder.path)}
                >
                  <Folder className="size-4 shrink-0 text-muted" />
                  <span className="truncate">{folder.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="ghost" className="h-11 flex-1 rounded-lg" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="button" className="h-11 flex-1 rounded-lg" onClick={() => onSelect(path || "/")}>
          Выбрать
        </Button>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Автосохранение"
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-[var(--motion-quick)]",
        checked ? "bg-accent" : "bg-elevated shadow-[var(--shadow-border)]",
      )}
    >
      <span
        className={cn(
          "absolute top-1 left-1 size-5 rounded-full transition-transform duration-[var(--motion-quick)] ease-[var(--ease-smooth-out)]",
          checked ? "translate-x-5 bg-accent-fg" : "translate-x-0 bg-muted",
        )}
      />
    </button>
  );
}

function parentPath(path?: string) {
  const raw = (path || "").replace(/\/+$/, "");
  if (!raw || raw === "/") return "";
  const i = raw.lastIndexOf("/");
  return i <= 0 ? "" : raw.slice(0, i);
}
