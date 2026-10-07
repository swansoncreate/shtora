import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckSquare, ChevronLeft, Folder, FolderInput, LoaderCircle, Play, Square, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChatSendButton } from "@/components/chat-send-button";
import { ImagineBar } from "@/components/imagine-dice";
import { Button } from "@/components/ui/button";
import { ShtoraMediaViewer } from "@/components/shtora-media-viewer";
import { fetchDropboxBlob } from "@/lib/dropbox/client-file";
import { deleteDropboxFile, deleteDropboxMany, getShtoraMarks, getThumbnails, listEntries, listFolders, moveDropboxFile, moveDropboxMany, setShtoraMarks } from "@/lib/dropbox/functions";
import { parentDropboxPath, sharedFolder } from "@/lib/dropbox/paths";
import { liveDropboxToken } from "@/lib/dropbox/token";
import type { ShtoraSettings } from "@/lib/shtora-settings";

export function DropboxBrowser({
  settings,
  path,
  onPath,
  onNeedToken,
  previewMode = false,
}: {
  settings: ShtoraSettings;
  path: string;
  onPath: (path: string) => void;
  onNeedToken: () => void;
  previewMode?: boolean;
}) {
  const token = settings.dropboxToken.trim();
  useEffect(() => {
    if (!settings.dropboxRefreshToken) return;
    void liveDropboxToken(token).catch(() => undefined);
  }, [settings.dropboxRefreshToken, token]);
  const root = settings.defaultFolder || "/Штора";
  const shared = sharedFolder(root);
  const current = path || root;
  const [viewer, setViewer] = useState<{ path: string; name: string; video: boolean } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setSelecting(false);
    setSelected(new Set());
    setConfirmDel(false);
  }, [current]);

  const listQuery = useQuery({
    queryKey: ["dropbox-list", token, current],
    queryFn: () => listEntries({ data: { token, path: current } }),
    enabled: Boolean(token),
    staleTime: 60_000,
  });

  const files = listQuery.data?.entries ?? [];
  const imagePaths = useMemo(
    () => files.filter((entry) => entry.isImage || entry.isVideo).map((entry) => entry.path),
    [files],
  );
  const photoPaths = useMemo(
    () => files.filter((entry) => entry.isImage && !entry.isVideo && !/\.heic$/i.test(entry.name)).map((entry) => entry.path),
    [files],
  );

  const marksKey = ["dropbox-marks", token, current, photoPaths.join("|")] as const;
  const marksQuery = useQuery({
    queryKey: marksKey,
    queryFn: () => getShtoraMarks({ data: { token, paths: photoPaths.slice(0, 200) } }),
    enabled: Boolean(token && photoPaths.length),
    staleTime: 20_000,
  });

  const marked = useMemo(() => {
    const set = new Set<string>();
    for (const row of marksQuery.data?.files ?? []) {
      if (row.tagged) set.add(row.path);
    }
    return set;
  }, [marksQuery.data]);

  const thumbsQuery = useQuery({
    queryKey: ["dropbox-thumbs", token, current, imagePaths.join("|")],
    queryFn: () => getThumbnails({ data: { token, paths: imagePaths } }),
    enabled: Boolean(token && imagePaths.length),
    staleTime: 5 * 60_000,
  });

  const thumbs = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of thumbsQuery.data ?? []) {
      map.set(item.path, item.thumbnail);
      map.set(item.path.toLowerCase(), item.thumbnail);
    }
    return map;
  }, [thumbsQuery.data]);

  function thumbFor(path: string) {
    return thumbs.get(path) ?? thumbs.get(path.toLowerCase());
  }

  function togglePath(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    setConfirmDel(false);
  }

  async function bulkDelete() {
    if (!selected.size || busy) return;
    setBusy(true);
    try {
      const out = await deleteDropboxMany({
        data: { token: await liveDropboxToken(token), paths: [...selected] },
      });
      if (out.failed && !out.done) throw new Error(out.error || "Не удалилось");
      toast.success(out.failed ? `Удалено ${out.done}, ошибок ${out.failed}` : `Удалено ${out.done}`);
      setSelected(new Set());
      setSelecting(false);
      setConfirmDel(false);
      void listQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалилось");
    } finally {
      setBusy(false);
    }
  }

  async function bulkMove(folder: string) {
    if (!selected.size || busy) return;
    setBusy(true);
    try {
      const out = await moveDropboxMany({
        data: { token: await liveDropboxToken(token), from: [...selected], toFolder: folder },
      });
      if (out.failed && !out.done) throw new Error(out.error || "Не переместилось");
      toast.success(out.failed ? `Перемещено ${out.done}, ошибок ${out.failed}` : `Перемещено ${out.done}`);
      setSelected(new Set());
      setSelecting(false);
      setMoving(false);
      void listQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не переместилось");
    } finally {
      setBusy(false);
    }
  }

  function selectionMarkMode() {
    const photos = [...selected].filter((path) => photoPaths.includes(path));
    if (!photos.length || photos.some((path) => !marked.has(path))) return true;
    return false;
  }

  async function bulkMark(on: boolean) {
    const paths = [...selected].filter((path) => photoPaths.includes(path));
    if (!paths.length || busy) {
      if (!paths.length) toast.error("Метку можно поставить только на фото");
      return;
    }
    setBusy(true);
    try {
      const out = await setShtoraMarks({
        data: { token: await liveDropboxToken(token), paths, tagged: on },
      });
      queryClient.setQueryData(marksKey, (prev: { files?: { path: string; tagged: boolean }[] } | undefined) => {
        const map = new Map((prev?.files ?? []).map((row) => [row.path, row.tagged]));
        for (const path of paths) map.set(path, on);
        return { files: [...map].map(([path, tagged]) => ({ path, tagged })) };
      });
      toast.success(on ? `В ленте: ${out.done}` : `Метка снята: ${out.done}`);
      if (out.failed) toast.error(out.error || "Часть фото не отметилась");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось поставить метку");
    } finally {
      setBusy(false);
    }
  }

  const media = files.filter((entry) => entry.isImage || entry.isVideo);
  const viewerIndex = viewer ? media.findIndex((entry) => entry.path === viewer.path) : -1;

  if (!token) {
    if (previewMode) {
      const previewFolders = [
        { name: "2026", meta: "24 файла", note: "архив года" },
        { name: "София", meta: "18 файлов", note: "личное" },
        { name: "Общее", meta: "42 файла", note: "доступное всем" },
        { name: "Избранное", meta: "9 файлов", note: "для Шторы" },
      ];
      const previewPhotos = [
        { name: "IMG_2041.jpg", url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=700&q=82" },
        { name: "IMG_1988.jpg", url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=700&q=82" },
        { name: "VID_1022.mp4", url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=82" },
      ];
      return (
        <div className="mt-2 pb-12">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-subtle">пример структуры</p>
              <p className="mt-1 truncate text-sm text-muted">/Штора</p>
            </div>
            <span className="rounded-full bg-elevated px-3 py-1.5 text-[11px] text-muted">токен не нужен</span>
          </div>

          <section className="mt-7">
            <div className="flex items-end justify-between">
              <p className="font-display text-xl text-fg">Папки</p>
              <p className="text-xs text-subtle">как будут выглядеть</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {previewFolders.map((folder) => (
                <button
                  key={folder.name}
                  type="button"
                  className="group flex min-h-28 flex-col justify-between rounded-2xl bg-surface p-4 text-left shadow-[var(--shadow-border)] transition-colors hover:bg-elevated"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Folder className="size-6 text-accent" />
                    <span className="text-[10px] uppercase tracking-[0.16em] text-subtle">{folder.meta}</span>
                  </div>
                  <div className="mt-6 min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{folder.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{folder.note}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-9">
            <div className="flex items-end justify-between">
              <p className="font-display text-xl text-fg">Последние файлы</p>
              <p className="text-xs text-subtle">фото и видео</p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {previewPhotos.map((photo) => (
                <div key={photo.name} className="overflow-hidden rounded-xl bg-elevated">
                  <img src={photo.url} alt="" className="aspect-square w-full object-cover" referrerPolicy="no-referrer" />
                  <p className="truncate px-2 py-2 text-[10px] text-muted">{photo.name}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-8 border-t border-border/50 pt-4">
            <p className="text-xs leading-5 text-muted">
              После подключения Dropbox эти карточки заменятся реальными папками и файлами. Внутри папки остаётся такая же сетка и просмотрщик.
            </p>
            <Button className="mt-4 h-11 rounded-xl" variant="subtle" onClick={onNeedToken}>
              Подключить Dropbox
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-6 rounded-2xl bg-surface px-4 py-10 text-center shadow-[var(--shadow-border)]">
        <p className="font-display text-2xl text-fg">Нет токена Dropbox</p>
        <p className="mt-2 text-sm text-muted">Вставь токен в настройках — здесь появятся твои папки и фото.</p>
        <Button className="mt-4 rounded-lg" onClick={onNeedToken}>
          Открыть настройки
        </Button>
      </div>
    );
  }

  const crumbs = current.split("/").filter(Boolean);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={current === root ? "default" : "outline"}
          className="h-10 rounded-lg px-3 text-sm"
          onClick={() => onPath(root)}
        >
          Штора
        </Button>
        <Button
          variant={current === shared ? "default" : "outline"}
          className="h-10 rounded-lg px-3 text-sm"
          onClick={() => onPath(shared)}
        >
          общее
        </Button>
        {settings.favorites.map((name) => (
          <Button
            key={name}
            variant={current === (settings.accountFolders[name] || `${root}/${name}`) ? "default" : "outline"}
            className="h-10 rounded-lg px-3 text-sm"
            onClick={() => onPath(settings.accountFolders[name] || `${root}/${name}`)}
          >
            {name}
          </Button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {current !== "/" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 rounded-lg"
            aria-label="Назад"
            onClick={() => onPath(parentDropboxPath(current))}
          >
            <ChevronLeft className="size-5" />
          </Button>
        ) : null}
        <p className="min-w-0 flex-1 truncate text-sm text-muted">/{crumbs.join("/") || ""}</p>
        <Button
          type="button"
          variant={selecting ? "default" : "ghost"}
          className="h-10 rounded-lg px-3 text-sm"
          onClick={() => {
            setSelecting((v) => !v);
            setSelected(new Set());
            setConfirmDel(false);
          }}
        >
          {selecting ? "Готово" : "Выбрать"}
        </Button>
      </div>

      {listQuery.isFetching && files.length === 0 ? (
        <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" />
          Открываем Dropbox
        </p>
      ) : null}

      {listQuery.error ? (
        <div className="mt-6 rounded-lg bg-surface px-4 py-6 text-center shadow-[var(--shadow-border)]">
          <p className="text-sm text-danger">
            {listQuery.error instanceof Error ? listQuery.error.message : "Не удалось открыть папку"}
          </p>
          <Button className="mt-3 rounded-lg" variant="subtle" onClick={() => void listQuery.refetch()}>
            Ещё раз
          </Button>
        </div>
      ) : null}

      {!listQuery.isFetching && !listQuery.error && files.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted">В этой папке пусто</p>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-1 pb-24">
        {files.map((entry) => {
          const on = selected.has(entry.path);
          if (entry.tag === "folder") {
            return (
              <button
                key={entry.path}
                type="button"
                className="relative flex aspect-square flex-col items-center justify-center gap-2 rounded-md bg-elevated p-2 text-center"
                onClick={() => (selecting ? togglePath(entry.path) : onPath(entry.path))}
              >
                <Folder className="size-8 text-accent" />
                <span className="line-clamp-2 w-full text-xs text-fg">{entry.name}</span>
                {selecting ? (
                  <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-bg/80">
                    {on ? <CheckSquare className="size-4 text-accent" /> : <Square className="size-4 text-muted" />}
                  </span>
                ) : null}
              </button>
            );
          }
          return (
            <button
              key={entry.path}
              type="button"
              className="relative aspect-square overflow-hidden rounded-md bg-elevated"
              onClick={() =>
                selecting
                  ? togglePath(entry.path)
                  : setViewer({ path: entry.path, name: entry.name, video: entry.isVideo })
              }
            >
              {entry.isImage || entry.isVideo ? (
                <DropboxThumb
                  token={token}
                  path={entry.path}
                  readyUrl={thumbFor(entry.path)}
                  waiting={thumbsQuery.isFetching}
                  name={entry.name}
                />
              ) : (
                <span className="flex size-full items-center justify-center px-2 text-center text-xs text-muted">
                  {entry.name}
                </span>
              )}
              {entry.isVideo ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/20">
                  <Play className="size-5 fill-fg text-fg" />
                </span>
              ) : null}
              {marked.has(entry.path) ? (
                <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium leading-none text-accent-fg">
                  лента
                </span>
              ) : null}
              {selecting ? (
                <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-bg/80">
                  {on ? <Check className="size-3.5 text-accent" /> : <Square className="size-4 text-muted" />}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selecting && selected.size ? (
        <div className="sticky bottom-0 z-20 -mx-1 mt-3 border-t border-border bg-bg px-1 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-sm text-muted">{selected.size} выбрано</p>
            {confirmDel ? (
              <>
                <Button type="button" variant="subtle" className="h-11 rounded-xl px-4 text-danger" disabled={busy} onClick={() => void bulkDelete()}>
                  {busy ? <LoaderCircle className="size-4 animate-spin" /> : "Удалить"}
                </Button>
                <Button type="button" variant="ghost" className="h-11 rounded-xl px-3" onClick={() => setConfirmDel(false)}>
                  Нет
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  className="h-11 rounded-xl px-3"
                  disabled={busy}
                  onClick={() => void bulkMark(selectionMarkMode())}
                >
                  {busy ? <LoaderCircle className="size-4 animate-spin" /> : selectionMarkMode() ? "В ленту" : "Снять"}
                </Button>
                <Button type="button" variant="subtle" className="h-11 rounded-xl px-3" disabled={busy} onClick={() => setMoving(true)}>
                  <FolderInput className="size-4" />
                  Перенести
                </Button>
                <Button type="button" variant="subtle" className="h-11 rounded-xl px-3 text-danger" disabled={busy} onClick={() => setConfirmDel(true)}>
                  <Trash2 className="size-4" />
                  Удалить
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {viewer ? (
        <DropboxViewer
          token={token}
          item={viewer}
          hasPrev={viewerIndex > 0}
          hasNext={viewerIndex >= 0 && viewerIndex < media.length - 1}
          onPrev={() => {
            const prev = media[viewerIndex - 1];
            if (prev) setViewer({ path: prev.path, name: prev.name, video: prev.isVideo });
          }}
          onNext={() => {
            const next = media[viewerIndex + 1];
            if (next) setViewer({ path: next.path, name: next.name, video: next.isVideo });
          }}
          onClose={() => setViewer(null)}
          onNeedToken={onNeedToken}
          onChanged={() => {
            setViewer(null);
            void listQuery.refetch();
          }}
          onSaved={() => void listQuery.refetch()}
          chatUsername={usernameFromFolder(viewer.path, settings)}
          tagged={marked.has(viewer.path)}
          onTagged={(path, on) => {
            queryClient.setQueryData(marksKey, (prev: { files?: { path: string; tagged: boolean }[] } | undefined) => {
              const map = new Map((prev?.files ?? []).map((row) => [row.path, row.tagged]));
              map.set(path, on);
              return { files: [...map].map(([filePath, tagged]) => ({ path: filePath, tagged })) };
            });
          }}
        />
      ) : null}
      {moving ? (
        <MovePicker
          token={token}
          start={current}
          onClose={() => setMoving(false)}
          onPick={(folder) => void bulkMove(folder)}
        />
      ) : null}
    </div>
  );
}

export function DropboxViewer({
  token,
  item,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onNeedToken,
  onSaved,
  onChanged,
  chatUsername,
  tagged,
  onTagged,
}: {
  token: string;
  item: { path: string; name: string; video: boolean };
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onNeedToken: () => void;
  onSaved: () => void;
  onChanged: () => void;
  chatUsername?: string;
  tagged?: boolean;
  onTagged?: (path: string, on: boolean) => void;
}) {
  const fileQuery = useQuery({
    queryKey: ["dropbox-file", item.path],
    queryFn: () => fetchDropboxBlob(token, item.path),
    staleTime: 30 * 60_000,
  });
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [marking, setMarking] = useState(false);
  const canMark = !item.video && !/\.heic$/i.test(item.name);
  const ownMark = useQuery({
    queryKey: ["dropbox-mark", token, item.path],
    queryFn: () => getShtoraMarks({ data: { token, paths: [item.path] } }),
    enabled: canMark && tagged === undefined,
    staleTime: 20_000,
  });
  const queryClient = useQueryClient();
  const isTagged = tagged ?? Boolean(ownMark.data?.files?.[0]?.tagged);

  useEffect(() => {
    setConfirmDel(false);
    setMoving(false);
  }, [item.path]);

  useEffect(() => {
    if (!fileQuery.data) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(fileQuery.data);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [fileQuery.data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  async function toggleMark() {
    if (marking || !canMark) return;
    const next = !isTagged;
    setMarking(true);
    try {
      await setShtoraMarks({
        data: { token: await liveDropboxToken(token), paths: [item.path], tagged: next },
      });
      onTagged?.(item.path, next);
      queryClient.setQueryData(["dropbox-mark", token, item.path], { files: [{ path: item.path, tagged: next }] });
      toast.success(next ? "Фото пойдёт в ленту и в личку" : "Метка снята");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось поставить метку");
    } finally {
      setMarking(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteDropboxFile({ data: { token: await liveDropboxToken(token), path: item.path } });
      toast.success("Удалено");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалилось");
    } finally {
      setBusy(false);
      setConfirmDel(false);
    }
  }

  async function moveTo(folder: string) {
    if (busy) return;
    setBusy(true);
    try {
      await moveDropboxFile({
        data: { token: await liveDropboxToken(token), from: item.path, toFolder: folder },
      });
      toast.success("Перемещено");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не переместилось");
    } finally {
      setBusy(false);
      setMoving(false);
    }
  }

  return (
    <ShtoraMediaViewer
      eyebrow={`Dropbox · ${chatUsername ? `@${chatUsername}` : "архив"}`}
      title={item.name}
      onClose={onClose}
      actions={
        <>
          {confirmDel ? (
            <>
              <Button type="button" variant="subtle" className="h-10 rounded-full px-3 text-sm text-danger" disabled={busy} onClick={() => void remove()}>
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : "Удалить"}
              </Button>
              <Button type="button" variant="ghost" className="h-10 rounded-full px-3 text-sm" onClick={() => setConfirmDel(false)}>
                Нет
              </Button>
            </>
          ) : (
            <>
              {canMark ? (
                <Button
                  type="button"
                  variant={isTagged ? "default" : "subtle"}
                  className="h-10 rounded-full px-3 text-sm"
                  disabled={marking}
                  onClick={() => void toggleMark()}
                >
                  {marking ? <LoaderCircle className="size-4 animate-spin" /> : isTagged ? "В ленте" : "В ленту"}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full" aria-label="Переместить" disabled={busy} onClick={() => setMoving(true)}>
                <FolderInput className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full" aria-label="Удалить" disabled={busy} onClick={() => setConfirmDel(true)}>
                <Trash2 className="size-4" />
              </Button>
              <ChatSendButton username={chatUsername || ""} imageUrl={objectUrl} />
            </>
          )}
        </>
      }
      footer={
        objectUrl && !item.video ? (
          <ImagineBar
            mediaUrl={objectUrl}
            username={chatUsername || "dropbox"}
            saveFolder={parentDropboxPath(item.path)}
            onNeedToken={onNeedToken}
            onSaved={onSaved}
          />
        ) : (
          <div className="h-3" />
        )
      }
    >
      <div className="relative flex size-full min-h-0 items-center justify-center">
        {hasPrev ? (
          <button
            type="button"
            className="absolute left-1 z-10 flex size-11 items-center justify-center rounded-full border border-border/60 bg-bg/65 text-fg shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-md sm:left-3"
            aria-label="Назад"
            onClick={onPrev}
          >
            <ChevronLeft className="size-5" />
          </button>
        ) : null}
        {fileQuery.isFetching ? (
          <LoaderCircle className="size-6 animate-spin text-muted" />
        ) : objectUrl ? (
          item.video ? (
            <video src={objectUrl} className="max-h-full max-w-full rounded-[18px]" controls playsInline autoPlay />
          ) : (
            <img src={objectUrl} alt="" className="max-h-full max-w-full rounded-[18px] object-contain" />
          )
        ) : (
          <div className="max-w-md px-6 text-center">
            <p className="text-sm text-danger">
              {fileQuery.error instanceof Error
                ? fileQuery.error.message
                : "Не удалось открыть файл."}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted">
              В Permissions включите files.content.read и создайте новый токен.
            </p>
          </div>
        )}
        {hasNext ? (
          <button
            type="button"
            className="absolute right-1 z-10 flex size-11 items-center justify-center rounded-full border border-border/60 bg-bg/65 text-fg shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-md sm:right-3"
            aria-label="Дальше"
            onClick={onNext}
          >
            <ChevronLeft className="size-5 rotate-180" />
          </button>
        ) : null}
      </div>
      {moving ? (
        <MovePicker token={token} start={parentDropboxPath(item.path)} onClose={() => setMoving(false)} onPick={(folder) => void moveTo(folder)} />
      ) : null}
    </ShtoraMediaViewer>
  );}

function MovePicker({
  token,
  start,
  onClose,
  onPick,
}: {
  token: string;
  start: string;
  onClose: () => void;
  onPick: (folder: string) => void;
}) {
  const [path, setPath] = useState(start || "/");
  const list = useQuery({
    queryKey: ["dropbox-move-folders", token, path],
    queryFn: () => listFolders({ data: { token, path } }),
    staleTime: 30_000,
  });
  const folders = list.data?.folders ?? [];
  const crumbs = path.split("/").filter(Boolean);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-bg/90" role="dialog" aria-modal="true">
      <header className="flex items-center justify-between gap-3 px-3 py-3 sm:px-5">
        <p className="font-display text-xl">Куда</p>
        <Button type="button" variant="ghost" size="icon" className="size-10" aria-label="Закрыть" onClick={onClose}>
          <X className="size-5" />
        </Button>
      </header>
      <div className="flex items-center gap-2 px-3 sm:px-5">
        {path !== "/" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10"
            aria-label="Назад"
            onClick={() => setPath(parentDropboxPath(path))}
          >
            <ChevronLeft className="size-5" />
          </Button>
        ) : null}
        <p className="min-w-0 truncate text-sm text-muted">/{crumbs.join("/") || ""}</p>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-5">
        {list.isFetching && folders.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" />
            Папки
          </p>
        ) : null}
        <div className="grid grid-cols-3 gap-1">
          {folders.map((folder) => (
            <button
              key={folder.path}
              type="button"
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-md bg-elevated p-2 text-center"
              onClick={() => setPath(folder.path)}
            >
              <Folder className="size-8 text-accent" />
              <span className="line-clamp-2 w-full text-xs text-fg">{folder.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
        <Button className="h-12 w-full rounded-xl" onClick={() => onPick(path || "/")}>
          Сюда
        </Button>
      </div>
    </div>
  );
}

function looksLikeImage(path: string) {
  return /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(path);
}

function usernameFromFolder(path: string, settings: ShtoraSettings): string | undefined {
  const lower = path.toLowerCase();
  for (const name of settings.favorites) {
    const folder = (settings.accountFolders[name] || `${settings.defaultFolder}/${name}`).toLowerCase();
    if (lower === folder || lower.startsWith(`${folder}/`)) return name;
  }
}

let thumbActive = 0;
const thumbWaiters: Array<() => void> = [];

function runThumbJob<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = () => {
      thumbActive += 1;
      fn().then(resolve, reject).finally(() => {
        thumbActive -= 1;
        const next = thumbWaiters.shift();
        if (next) next();
      });
    };
    if (thumbActive < 4) start();
    else thumbWaiters.push(start);
  });
}

export function DropboxThumb({
  token,
  path,
  readyUrl,
  waiting,
  name,
}: {
  token: string;
  path: string;
  readyUrl?: string;
  waiting: boolean;
  name: string;
}) {
  const node = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState(readyUrl);

  useEffect(() => {
    const el = node.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true);
      },
      { rootMargin: "240px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (readyUrl) setUrl(readyUrl);
  }, [readyUrl]);

  useEffect(() => {
    if (url || !visible || waiting) return;
    let cancelled = false;
    let created: string | undefined;
    void runThumbJob(() => fetchDropboxBlob(token, path))
      .then((blob) => {
        if (cancelled) return;
        const type = blob.type || "";
        if (type.startsWith("video/")) return;
        if (!type.startsWith("image/") && type !== "application/octet-stream" && type !== "" && !looksLikeImage(path)) {
          return;
        }
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url, visible, waiting, token, path]);

  if (url) {
    return (
      <span ref={node} className="block size-full">
        <img src={url} alt="" className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span ref={node} className="flex size-full items-center justify-center px-2 text-center text-xs text-muted">
      {waiting || visible ? <LoaderCircle className="size-4 animate-spin text-subtle" /> : name}
    </span>
  );
}
