import { Check, ChevronLeft, Folder, LoaderCircle, Play, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DropboxThumb } from "@/components/dropbox-browser";
import { Button } from "@/components/ui/button";
import { getThumbnails, listEntries } from "@/lib/dropbox/functions";
import { parentDropboxPath, sharedFolder } from "@/lib/dropbox/paths";
import { liveDropboxToken } from "@/lib/dropbox/token";
import type { ShtoraSettings } from "@/lib/shtora-settings";

export type PickedFile = {
  path: string;
  name: string;
  thumb?: string;
  kind?: "image" | "video";
  local?: boolean;
  fileUrl?: string;
};

export function DropboxPicker({
  open,
  settings,
  onClose,
  onPick,
  selected = [],
  max = 4,
  accept = "image",
}: {
  open: boolean;
  settings: ShtoraSettings;
  onClose: () => void;
  onPick: (files: PickedFile[]) => void;
  selected?: PickedFile[];
  max?: number;
  accept?: "image" | "media";
}) {
  const rawToken = settings.dropboxToken.trim();
  const [token, setToken] = useState(rawToken);
  const root = settings.defaultFolder || "/Штора";
  const shared = sharedFolder(root);
  const [path, setPath] = useState(root);
  const [picked, setPicked] = useState<PickedFile[]>([]);

  useEffect(() => {
    if (!open) return;
    setPath((prev) => prev || root);
    setPicked(selected.slice(0, max));
    void liveDropboxToken(rawToken)
      .then(setToken)
      .catch(() => setToken(rawToken));
  }, [open, rawToken, root, max]);

  const listQuery = useQuery({
    queryKey: ["imagine-pick-list", token, path],
    queryFn: () => listEntries({ data: { token, path } }),
    enabled: open && Boolean(token),
    staleTime: 60_000,
  });

  const files = listQuery.data?.entries ?? [];
  const thumbPaths = useMemo(
    () =>
      files
        .filter((entry) => entry.isImage || (accept === "media" && entry.isVideo))
        .map((entry) => entry.path)
        .slice(0, 80),
    [files, accept],
  );
  const thumbsQuery = useQuery({
    queryKey: ["imagine-pick-thumbs", token, path, thumbPaths.join("|")],
    queryFn: () => getThumbnails({ data: { token, paths: thumbPaths } }),
    enabled: open && Boolean(token && thumbPaths.length),
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

  if (!open) return null;

  function thumbFor(filePath: string) {
    return thumbs.get(filePath) ?? thumbs.get(filePath.toLowerCase());
  }

  function toggle(file: PickedFile) {
    setPicked((prev) => {
      if (prev.some((p) => p.path === file.path)) return prev.filter((p) => p.path !== file.path);
      if (prev.length >= max) return [...prev.slice(1), file];
      return [...prev, file];
    });
  }

  const crumbs = path.split("/").filter(Boolean);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Выбрать из Dropbox">
      <header className="flex items-center gap-2 px-3 py-3 sm:px-5">
        <p className="min-w-0 flex-1 font-display text-2xl">Dropbox</p>
        {picked.length ? (
          <Button type="button" variant="ghost" className="h-10 px-3 text-xs text-muted" onClick={() => setPicked([])}>
            сбросить
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon" className="size-11" onClick={onClose} aria-label="Закрыть">
          <X className="size-5" />
        </Button>
      </header>
      <div className="flex flex-wrap gap-2 px-3 sm:px-5">
        <Button
          variant={path === root ? "default" : "outline"}
          className="h-10 rounded-lg px-3 text-sm"
          onClick={() => setPath(root)}
        >
          Штора
        </Button>
        <Button
          variant={path === shared ? "default" : "outline"}
          className="h-10 rounded-lg px-3 text-sm"
          onClick={() => setPath(shared)}
        >
          общее
        </Button>
        {settings.favorites.map((name) => {
          const folder = settings.accountFolders[name] || `${root}/${name}`;
          return (
            <Button
              key={name}
              variant={path === folder ? "default" : "outline"}
              className="h-10 rounded-lg px-3 text-sm"
              onClick={() => setPath(folder)}
            >
              {name}
            </Button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 px-3 sm:px-5">
        {path !== "/" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 rounded-lg"
            aria-label="Назад"
            onClick={() => setPath(parentDropboxPath(path))}
          >
            <ChevronLeft className="size-5" />
          </Button>
        ) : null}
        <p className="min-w-0 truncate text-sm text-muted">/{crumbs.join("/")}</p>
      </div>
      {picked.length ? (
        <div className="mt-2 flex gap-2 overflow-x-auto px-3 pb-1 sm:px-5">
          {picked.map((file) => (
            <button
              key={file.path}
              type="button"
              className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-elevated"
              onClick={() => setPicked((prev) => prev.filter((p) => p.path !== file.path))}
              aria-label={`Убрать ${file.name}`}
            >
              {file.thumb ? (
                <img src={file.thumb} alt="" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center px-1 text-center text-[9px] text-muted">
                  {file.name}
                </span>
              )}
              <span className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-bg/80">
                <X className="size-3" />
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-28 pt-3 sm:px-5">
        {!token ? (
          <p className="mt-10 text-center text-sm text-muted">Сначала токен Dropbox в настройках.</p>
        ) : listQuery.isFetching && !files.length ? (
          <p className="mt-10 flex items-center justify-center gap-2 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" />
            Папка
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {files.map((entry) => {
              const pickable = entry.tag === "file" && (entry.isImage || (accept === "media" && entry.isVideo));
              if (entry.tag === "folder") {
                return (
                  <button
                    key={entry.path}
                    type="button"
                    className="flex aspect-square flex-col items-center justify-center gap-2 rounded-md bg-elevated p-2"
                    onClick={() => setPath(entry.path)}
                  >
                    <Folder className="size-8 text-accent" />
                    <span className="line-clamp-2 w-full text-center text-xs">{entry.name}</span>
                  </button>
                );
              }
              if (!pickable) return null;
              const selected = picked.some((p) => p.path === entry.path);
              return (
                <button
                  key={entry.path}
                  type="button"
                  className="relative aspect-square overflow-hidden rounded-md bg-elevated"
                  onClick={() =>
                    toggle({
                      path: entry.path,
                      name: entry.name,
                      thumb: thumbFor(entry.path),
                      kind: entry.isVideo ? "video" : "image",
                    })
                  }
                >
                  {entry.isImage || entry.isVideo ? (
                    <DropboxThumb
                      token={token}
                      path={entry.path}
                      readyUrl={thumbFor(entry.path)}
                      waiting={thumbsQuery.isFetching && !thumbFor(entry.path)}
                      name={entry.name}
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center px-2 text-center text-xs text-muted">
                      {entry.name}
                    </span>
                  )}
                  {entry.isVideo ? (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/25">
                      <Play className="size-5 fill-fg text-fg" />
                    </span>
                  ) : null}
                  {selected ? (
                    <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-accent text-accent-fg">
                      <Check className="size-3.5" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 border-t border-border bg-bg px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        <Button
          className="h-12 w-full rounded-xl"
          onClick={() => {
            onPick(
              picked.map((file) => ({
                ...file,
                thumb: file.thumb || thumbFor(file.path),
              })),
            );
            onClose();
          }}
        >
          {picked.length ? `Готово · ${picked.length}` : "Готово"}
        </Button>
      </div>
    </div>
  );
}
