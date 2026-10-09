import { Check, Clapperboard, CloudUpload, Copy, Dices, Forward, ImagePlus, LoaderCircle, Pencil, Play, Plus, Smartphone, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DropboxPicker, type PickedFile } from "@/components/dropbox-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchDropboxBlob } from "@/lib/dropbox/client-file";
import { uploadMediaJob } from "@/lib/dropbox/client-upload";
import { destFor, parentDropboxPath, personRoot, safeName, sharedFolder } from "@/lib/dropbox/paths";
import { liveDropboxToken } from "@/lib/dropbox/token";
import { dropStudioMedia, stashStudioMedia } from "@/lib/imagine/studio-media";
import { dropStudio, imagineVariation, listStudio, saveStudio } from "@/lib/imagine/functions";
import { clearStudioLocal, mergeStudio, readStudioLocal, type StudioItem } from "@/lib/imagine/studio";
import { idbDropStudio } from "@/lib/shtora-idb";
import { pollImagineVideo, startImagineClip, startImagineVideo } from "@/lib/imagine/video";
import { DEFAULT_VARIATION_PROMPT, PHONE_RAW } from "@/lib/imagine/prompt";
import { apiUrl } from "@/lib/shtora-origin";
import type { ShtoraSettings } from "@/lib/shtora-settings";
import { cn } from "@/lib/utils";

type Result = StudioItem;
type Job = "photo" | "live" | "edit" | "extend";
const COUNTS = [1, 2, 4, 6, 8] as const;

const PREVIEW_HISTORY: StudioItem[] = [
  {
    id: "preview-1",
    kind: "image",
    url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=85",
    from: "preview",
    at: Date.now() - 1000 * 60 * 18,
    prompt: "мягкий вечерний свет, чистый фон",
  },
  {
    id: "preview-2",
    kind: "image",
    url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=85",
    from: "preview",
    at: Date.now() - 1000 * 60 * 73,
    prompt: "портрет, тёплое зерно, редакционный стиль",
  },
  {
    id: "preview-3",
    kind: "image",
    url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=85",
    from: "preview",
    at: Date.now() - 1000 * 60 * 60 * 5,
    prompt: "чёрный фон, розовый акцент, мягкий свет",
  },
  {
    id: "preview-4",
    kind: "image",
    url: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85",
    from: "preview",
    at: Date.now() - 1000 * 60 * 60 * 22,
    prompt: "естественная поза, спокойное настроение",
  },
];


export function ImagineStudio({
  settings,
  onNeedToken,
  previewMode = false,
}: {
  settings: ShtoraSettings;
  onNeedToken: () => void;
  previewMode?: boolean;
}) {
  const [picker, setPicker] = useState(false);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<Job | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState<Result | null>(null);
  const [liveSrc, setLiveSrc] = useState<Record<string, string>>({});
  const [posters, setPosters] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [count, setCount] = useState<(typeof COUNTS)[number]>(1);
  const [progress, setProgress] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const localRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const remote = await listStudio().catch(() => []);
      const list = Array.isArray(remote) ? remote : [];
      const local = readStudioLocal();
      const remoteIds = new Set(list.map((item) => item.id));
      if (local.length && local.every((item) => remoteIds.has(item.id))) clearStudioLocal();
      if (cancelled) return;
      setResults(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function forget(id: string) {
    setResults((prev) => prev.filter((item) => item.id !== id));
    setLiveSrc((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (open?.id === id) setOpen(null);
    setPicked((prev) => prev.filter((x) => x !== id));
    void dropStudio({ data: { id } }).catch(() => undefined);
    void dropStudioMedia(id);
    void idbDropStudio(id).catch(() => undefined);
  }

  function remember(item: Result) {
    setResults((prev) => mergeStudio([item], prev));
    void stashStudioMedia(item.id, item.url).then((url) => {
      if (url && (url.startsWith("blob:") || url.startsWith("data:"))) {
        setLiveSrc((prev) => ({ ...prev, [item.id]: url }));
      }
    });
    void saveStudio({
      data: { url: item.url, kind: item.kind, from: item.from, prompt: item.prompt, id: item.id, urls: item.urls },
    }).then((stored) => {
      if (!stored?.url) return;
      setResults((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, url: stored.url, prompt: stored.prompt || row.prompt, urls: stored.urls || row.urls }
            : row,
        ),
      );
      void stashStudioMedia(item.id, stored.url);
    }).catch(() => undefined);
  }

  const photos = files.filter((file) => file.kind !== "video");
  const videos = files.filter((file) => file.kind === "video");
  const photo = photos[0];
  const clip = videos[0];
  const pickedItems = picked.map((id) => results.find((item) => item.id === id)).filter((item): item is Result => Boolean(item));
  const pickedPhotos = pickedItems.filter((item) => item.kind === "image");
  const pickedClips = pickedItems.filter((item) => item.kind === "video");
  const canPhoto = Boolean(photos.length || pickedPhotos.length);
  const canLive = Boolean(photo || pickedPhotos[0]);
  const canClip = Boolean(clip || pickedClips[0]);

  function togglePick(id: string) {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id].slice(-3);
    });
  }

  function revoke(file: PickedFile) {
    if (file.local && file.fileUrl) URL.revokeObjectURL(file.fileUrl);
  }

  function clearFiles() {
    files.forEach(revoke);
    setFiles([]);
  }

  function onLocalFiles(list: FileList | null) {
    const incoming = Array.from(list || []);
    if (!incoming.length) return;
    const next: PickedFile[] = [];
    for (const file of incoming) {
      const video = file.type.startsWith("video/");
      const image = file.type.startsWith("image/");
      if (!video && !image) continue;
      const url = URL.createObjectURL(file);
      next.push({
        path: `local:${file.name}:${file.size}:${file.lastModified}`,
        name: file.name,
        thumb: video ? undefined : url,
        kind: video ? "video" : "image",
        local: true,
        fileUrl: url,
      });
    }
    if (!next.length) {
      toast.error("Нужно фото или видео");
      return;
    }
    setFiles((prev) => {
      const merged = [...prev];
      for (const file of next) {
        if (merged.some((row) => row.path === file.path)) {
          revoke(file);
          continue;
        }
        merged.push(file);
      }
      const keep = merged.slice(0, 4);
      for (const extra of merged.slice(4)) revoke(extra);
      return keep;
    });
  }

  async function jpegOf(file: PickedFile) {
    if (file.local && file.fileUrl) {
      const blob = await fetch(file.fileUrl).then((r) => r.blob());
      return blobToJpegDataUrl(blob);
    }
    const blob = await fetchDropboxBlob(settings.dropboxToken, file.path);
    return blobToJpegDataUrl(blob);
  }

  async function waitClip(requestId: string, from: string) {
    const deadline = Date.now() + 160_000;
    while (Date.now() < deadline) {
      await sleep(4000);
      const poll = await pollImagineVideo({ data: { requestId } });
      if (!poll.ok) throw new Error(poll.error);
      if (poll.status === "done" && poll.url) {
        remember({ id: `v-${Date.now()}`, kind: "video", url: poll.url, from, at: Date.now(), prompt: (draft.trim() || PHONE_RAW).slice(0, 1200) });
        return;
      }
    }
    throw new Error("Видео слишком долго собирается. Попробуй ещё раз.");
  }

  async function makePhoto() {
    if (busy) return;
    if (!canPhoto) {
      setSourceOpen(true);
      return;
    }
    setBusy("photo");
    try {
      const studioShots = (
        await Promise.all(pickedPhotos.slice(0, 3).map((item) => jpegFromUrl(liveSrc[item.id] || item.url)))
      ).filter(Boolean);
      const dropboxShots = (await Promise.all(photos.slice(0, 3).map((file) => jpegOf(file)))).filter(Boolean);
      const shots = [...studioShots, ...dropboxShots].slice(0, 3);
      if (!shots.length) throw new Error("Не прочитались кадры");
      const many = shots.length > 1;
      const prompt =
        draft.trim() ||
        (many
          ? "One candid vertical phone photo of these people together. Keep every face. Not a collage."
          : settings.imaginePrompt.trim() || DEFAULT_VARIATION_PROMPT);
      const batchId = `p-${Date.now()}`;
      const urls: string[] = [];
      for (let i = 0; i < count; i += 1) {
        if (count > 1) setProgress(`${i + 1} из ${count}`);
        const take =
          i === 0
            ? prompt
            : `${prompt}\nAnother candid take, slightly different pose and crop, same person and scene.`;
        const out = await imagineVariation({
          data: {
            imageDataUrl: shots[0]!,
            prompt: take,
            extraImages: many ? shots.slice(1) : undefined,
            mode: many ? "compose" : "identity",
          },
        });
        if (!out.ok) {
          if (!urls.length) throw new Error(out.error || "Imagine не выдал кадр");
          toast.error(`Собрали ${urls.length} из ${count}`);
          break;
        }
        urls.push(out.url);
        remember({
          id: batchId,
          kind: "image",
          url: urls[0]!,
          urls: urls.length > 1 ? [...urls] : undefined,
          from: pickedPhotos[0]?.url || photos[0]?.path || "",
          at: Date.now(),
          prompt: prompt.slice(0, 1200),
        });
      }
      if (urls.length) {
        setOpen({
          id: batchId,
          kind: "image",
          url: urls[0]!,
          urls: urls.length > 1 ? urls : undefined,
          from: pickedPhotos[0]?.url || photos[0]?.path || "",
          at: Date.now(),
          prompt: prompt.slice(0, 1200),
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не собралось фото");
    } finally {
      setBusy(null);
      setProgress("");
    }
  }

  async function makeLive() {
    if (busy) return;
    const source = pickedPhotos[0];
    if (!source && !photo) {
      setSourceOpen(true);
      return;
    }
    setBusy("live");
    try {
      const frame = source ? await jpegFromUrl(liveSrc[source.id] || source.url) : await jpegOf(photo!);
      const prompt =
        draft.trim() ||
        source?.prompt ||
        "Subtle natural motion, same person and face, handheld phone video, no morphing, no extra people. " + PHONE_RAW;
      const started = await startImagineVideo({ data: { imageDataUrl: frame, prompt, duration: 6 } });
      if (!started.ok) throw new Error(started.error);
      await waitClip(started.requestId, source?.url || photo?.path || "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не собралось видео");
    } finally {
      setBusy(null);
    }
  }

  async function runClip(mode: "edit" | "extend", videoUrl?: string) {
    if (busy) return;
    const dbPath = clip && !clip.local ? clip.path : "";
    const pickedUrl = pickedClips[0] ? liveSrc[pickedClips[0].id] || pickedClips[0].url : "";
    const url = videoUrl || pickedUrl || (open?.kind === "video" ? open.url : "");
    if (!dbPath && !url && !clip?.local) {
      toast.error("Отметь ролик галочкой");
      return;
    }
    setBusy(mode);
    try {
      const token = await liveDropboxToken(settings.dropboxToken).catch(() => "");
      let started;
      if (clip?.local && clip.fileUrl && !url) {
        const blob = await fetch(clip.fileUrl).then((r) => r.blob());
        if (blob.size > 12_000_000) throw new Error("Ролик с телефона — до 12 МБ");
        started = await startImagineClip({
          data: {
            mode,
            prompt: draft.trim() || undefined,
            videoDataUrl: await blobToDataUrl(blob),
            duration: 6,
          },
        });
      } else if (dbPath && !url) {
        started = await startImagineClip({
          data: {
            mode,
            prompt: draft.trim() || undefined,
            dropboxToken: token,
            dropboxPath: dbPath,
            duration: 6,
          },
        });
      } else {
        started = await startImagineClip({
          data: {
            mode,
            prompt: draft.trim() || pickedClips[0]?.prompt || undefined,
            videoUrl: url,
            duration: 6,
          },
        });
      }
      if (!started.ok) throw new Error(started.error);
      await waitClip(started.requestId, dbPath || url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не собралось видео");
    } finally {
      setBusy(null);
    }
  }

  async function save(item: Result, url = item.url) {
    if (!settings.dropboxToken.trim() && !settings.dropboxRefreshToken.trim()) {
      onNeedToken();
      toast.error("Добавь токен Dropbox");
      return;
    }
    setSaving(item.id);
    try {
      const roots = files.filter((file) => !file.local).map((file) => personRoot(parentDropboxPath(file.path)));
      const same = roots.length && roots.every((root) => root === roots[0]);
      const folder = same ? roots[0]! : sharedFolder(settings.defaultFolder);
      const name = `${item.kind === "video" ? "clip" : "imagine"}_${safeName(String(Date.now()))}`;
      await uploadMediaJob({
        token: await liveDropboxToken(settings.dropboxToken),
        destPath: destFor(folder, name, item.kind === "video"),
        mediaUrl: url,
      });
      toast.success("В Dropbox");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не сохранилось");
    } finally {
      setSaving(null);
    }
  }

  const hint = pickedPhotos.length
    ? "Отмеченные кадры: изменить или оживить."
    : pickedClips.length
      ? "Отмеченный ролик: править или продлить."
      : !files.length
        ? "Фото или ролик с телефона, из Dropbox — или галочка на генерации."
        : videos.length && !photos.length
          ? "Ролик: правим сцену или продолжаем с последнего кадра."
          : photos.length > 1
            ? "Несколько людей — один кадр."
            : "Фото, оживить, или отметь кадр из истории.";

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-3xl leading-none tracking-tight">Imagine</p>
          <p className="mt-2 max-w-[28rem] text-sm leading-relaxed text-muted">{hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {files.length ? (
            <Button type="button" variant="ghost" className="h-12 rounded-xl px-3 text-xs text-muted" onClick={clearFiles}>
              сбросить
            </Button>
          ) : null}
          <Button type="button" variant="subtle" className="h-12 rounded-xl px-4" onClick={() => setSourceOpen(true)}>
            <Plus className="size-4" />
            Файлы
          </Button>
        </div>
      </div>

      {files.length ? (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {files.map((file) => (
            <div key={file.path} className="relative h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-md bg-elevated">
              {file.thumb ? (
                <img src={file.thumb} alt="" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center px-1 text-center text-[10px] text-muted">
                  {file.name}
                </span>
              )}
              {file.kind === "video" ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/30">
                  <Play className="size-4 fill-fg text-fg" />
                </span>
              ) : null}
              <button
                type="button"
                className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-bg/80"
                aria-label="Убрать"
                onClick={() =>
                  setFiles((prev) => {
                    const gone = prev.find((f) => f.path === file.path);
                    if (gone) revoke(gone);
                    return prev.filter((f) => f.path !== file.path);
                  })
                }
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="flex h-24 w-[4.5rem] shrink-0 items-center justify-center rounded-md bg-elevated text-muted"
            onClick={() => setSourceOpen(true)}
            aria-label="Ещё файлы"
          >
            <Plus className="size-5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="mt-5 flex min-h-48 flex-col items-center justify-center gap-3 rounded-3xl border border-border/60 bg-surface px-6 text-center shadow-[var(--shadow-border)]"
          onClick={() => setSourceOpen(true)}
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-accent/12 text-accent ring-1 ring-accent/20">
            <Plus className="size-5" />
          </span>
          <span className="font-medium text-fg">Добавить исходник</span><span className="text-sm text-muted">С телефона или из Dropbox</span>
        </button>
      )}

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (pickedClips.length || (clip && !photo && !pickedPhotos.length)) void runClip("edit");
          else void makePhoto();
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            pickedClips.length || (clip && !photo)
              ? "Что сделать с роликом"
              : pickedPhotos.length
                ? "Как изменить кадр"
                : "Промпт: поза, одежда, движение"
          }
          maxLength={1200}
          disabled={Boolean(busy)}
        />
      </form>

      {canPhoto ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted">Кадров</span>
          <div className="flex rounded-full bg-elevated p-0.5">
            {COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                disabled={Boolean(busy)}
                className={cn(
                  "h-8 min-w-8 rounded-full px-2.5 text-sm",
                  count === n ? "bg-accent text-accent-fg" : "text-muted",
                )}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button className="h-12 rounded-xl" disabled={Boolean(busy) || !canPhoto} onClick={() => void makePhoto()}>
          {busy === "photo" ? <LoaderCircle className="size-4 animate-spin" /> : <Dices className="size-4" />}
          {pickedPhotos.length ? "Изменить" : "Фото"}
        </Button>
        <Button variant="subtle" className="h-12 rounded-xl" disabled={Boolean(busy) || !canLive} onClick={() => void makeLive()}>
          {busy === "live" ? <LoaderCircle className="size-4 animate-spin" /> : <Clapperboard className="size-4" />}
          Оживить
        </Button>
        <Button variant="subtle" className="h-12 rounded-xl" disabled={Boolean(busy) || !canClip} onClick={() => void runClip("edit")}>
          {busy === "edit" ? <LoaderCircle className="size-4 animate-spin" /> : <Pencil className="size-4" />}
          Править
        </Button>
        <Button variant="subtle" className="h-12 rounded-xl" disabled={Boolean(busy) || !canClip} onClick={() => void runClip("extend")}>
          {busy === "extend" ? <LoaderCircle className="size-4 animate-spin" /> : <Forward className="size-4" />}
          Продлить
        </Button>
      </div>
      {busy ? (
        <p className="mt-3 text-center text-sm text-muted">
          {busy === "photo" ? progress || "Собираем кадр 9:16" : "Собираем ролик — обычно минута"}
        </p>
      ) : null}

      <section className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-subtle">архив студии</p>
            <p className="mt-1 font-display text-xl text-fg">История генераций</p>
          </div>
          <span className="text-xs text-subtle">{results.length || (previewMode ? PREVIEW_HISTORY.length : 0)} шт.</span>
        </div>

        {results.length === 0 && !busy && !previewMode ? (
          <p className="py-6 text-center text-sm text-muted">Генерации остаются здесь, даже если закрыть вкладку.</p>
        ) : null}

        {(results.length ? results : previewMode ? PREVIEW_HISTORY : []).length ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(results.length ? results : PREVIEW_HISTORY).map((item) => {
              const src = liveSrc[item.id] || item.url;
              const on = picked.includes(item.id);
              return (
                <div
                  key={item.id}
                  role={results.length ? "button" : undefined}
                  tabIndex={results.length ? 0 : undefined}
                  className="relative overflow-hidden rounded-2xl border border-border/50 bg-surface shadow-[var(--shadow-border)]"
                  onClick={results.length ? () => setOpen({ ...item, url: src }) : undefined}
                  onKeyDown={
                    results.length
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setOpen({ ...item, url: src });
                          }
                        }
                      : undefined
                  }
                >
                  <StudioStill url={src} />
                  <div className="border-t border-border/40 px-3 py-2.5">
                    <p className="line-clamp-2 text-xs text-fg">{item.prompt || "Без промпта"}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-subtle">{formatRelative(item.at)}</p>
                  </div>
                  {results.length ? (
                    <button
                      type="button"
                      className={cn(
                        "absolute right-1.5 top-1.5 flex size-8 items-center justify-center rounded-full",
                        on ? "bg-accent text-accent-fg" : "bg-bg/75 text-fg ring-1 ring-fg/40",
                      )}
                      aria-label={on ? "Снять" : "Выбрать"}
                      aria-pressed={on}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePick(item.id);
                      }}
                    >
                      {on ? <Check className="size-4" /> : null}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {open ? (
        <StudioViewer
          item={{ ...open, url: liveSrc[open.id] || open.url }}
          saving={saving === open.id}
          busy={Boolean(busy)}
          onClose={() => setOpen(null)}
          onSave={(url) => void save(open, url)}
          onForget={() => {
            forget(open.id);
            setOpen(null);
          }}
          onEdit={
            open.kind === "video"
              ? () => {
                  const url = liveSrc[open.id] || open.url;
                  setOpen(null);
                  setPicked([open.id]);
                  void runClip("edit", url);
                }
              : undefined
          }
          onExtend={
            open.kind === "video"
              ? () => {
                  const url = liveSrc[open.id] || open.url;
                  setOpen(null);
                  setPicked([open.id]);
                  void runClip("extend", url);
                }
              : undefined
          }
        />
      ) : null}

      {sourceOpen ? (
        <div
          className="fixed inset-0 z-[70] flex flex-col justify-end bg-bg/70"
          role="dialog"
          aria-modal="true"
          onClick={() => setSourceOpen(false)}
        >
          <div
            className="rounded-t-2xl bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow-border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-1 pb-3 text-sm text-muted">Откуда взять файл</p>
            <button
              type="button"
              className="flex h-14 w-full items-center gap-3 rounded-xl px-3 text-left text-base"
              onClick={() => {
                setSourceOpen(false);
                localRef.current?.click();
              }}
            >
              <Smartphone className="size-5" />
              С устройства
            </button>
            <button
              type="button"
              className="flex h-14 w-full items-center gap-3 rounded-xl px-3 text-left text-base"
              onClick={() => {
                setSourceOpen(false);
                setPicker(true);
              }}
            >
              <ImagePlus className="size-5" />
              Dropbox
            </button>
            <Button type="button" variant="ghost" className="mt-1 h-12 w-full rounded-xl" onClick={() => setSourceOpen(false)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}

      <input
        ref={localRef}
        type="file"
        accept="image/*,video/mp4,video/quicktime,video/webm,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onLocalFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <DropboxPicker
        open={picker}
        settings={settings}
        accept="media"
        selected={files}
        onClose={() => setPicker(false)}
        onPick={(next) => setFiles(next.slice(0, 4))}
      />
    </div>
  );
}

function formatRelative(at: number) {
  const diff = Math.max(0, Date.now() - at);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} мин назад`;
  if (diff < day) return `${Math.floor(diff / hour)} ч назад`;
  return `${Math.floor(diff / day)} дн назад`;
}

function showable(url: string) {
  return (
    url.startsWith("blob:") ||
    url.startsWith("data:") ||
    url.startsWith("/chat-media") ||
    url.startsWith("/api/chat-media") ||
    url.startsWith("http://") ||
    url.startsWith("https://")
  );
}

function StudioStill({ url }: { url: string }) {
  if (!showable(url)) return <div className="aspect-[9/16] w-full bg-elevated" />;
  return <img src={url} alt="" className="aspect-[9/16] w-full object-cover" />;
}

function StudioViewer({
  item,
  saving,
  busy,
  onClose,
  onSave,
  onEdit,
  onExtend,
  onForget,
}: {
  item: Result;
  saving: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (url: string) => void;
  onEdit?: () => void;
  onExtend?: () => void;
  onForget?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const slides = item.kind === "image" && item.urls && item.urls.length > 1 ? item.urls : [item.url];
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    void el.play().catch(() => undefined);
  }, [item.url]);

  useEffect(() => {
    setSlide(0);
    scroller.current?.scrollTo({ left: 0 });
  }, [item.id]);

  function copyPrompt() {
    const text = item.prompt?.trim();
    if (!text) {
      toast.error("Промпт не сохранился у этого кадра");
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => toast.success("Промпт скопирован"),
      () => toast.error("Не скопировалось"),
    );
  }

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    setSlide(Math.max(0, Math.min(slides.length - 1, i)));
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-bg" role="dialog" aria-modal="true">
      <header className="flex items-center justify-end gap-1 px-3 py-3 sm:px-5">
        {onForget ? (
          <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="Удалить" onClick={onForget}>
            <Trash2 className="size-5" />
          </Button>
        ) : null}
        {onEdit ? (
          <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="Править" disabled={busy} onClick={onEdit}>
            <Pencil className="size-5" />
          </Button>
        ) : null}
        {onExtend ? (
          <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="Дальше" disabled={busy} onClick={onExtend}>
            <Forward className="size-5" />
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="Сохранить" disabled={saving} onClick={() => onSave(slides[slide] || item.url)}>
          {saving ? <LoaderCircle className="size-4 animate-spin" /> : <CloudUpload className="size-5" />}
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="Закрыть" onClick={onClose}>
          <X className="size-5" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        {item.kind === "video" && showable(item.url) ? (
          <video
            ref={videoRef}
            src={item.url}
            className="max-h-full max-w-full rounded-md"
            controls
            playsInline
            autoPlay
            preload="auto"
          />
        ) : slides.length > 1 ? (
          <>
            <div
              ref={scroller}
              className="flex h-full w-full snap-x snap-mandatory overflow-x-auto"
              onScroll={onScroll}
            >
              {slides.map((url) => (
                <div key={url} className="flex h-full w-full shrink-0 snap-center items-center justify-center px-2">
                  {showable(url) ? (
                    <img src={url} alt="" className="max-h-full max-w-full rounded-md object-contain" />
                  ) : (
                    <p className="px-6 text-center text-sm text-muted">Этот кадр не сохранился.</p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 py-2">
              {slides.map((_, i) => (
                <span key={i} className={cn("size-1.5 rounded-full", i === slide ? "bg-fg" : "bg-muted")} />
              ))}
            </div>
          </>
        ) : showable(item.url) ? (
          <img src={item.url} alt="" className="max-h-full max-w-full rounded-md object-contain" />
        ) : (
          <p className="px-6 text-center text-sm text-muted">Этот кадр не сохранился на диске — сгенерируй ещё раз.</p>
        )}
      </div>
      <div className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-muted">
            {item.prompt?.trim() || "промпт не записался"}
            {slides.length > 1 ? ` · ${slide + 1}/${slides.length}` : ""}
          </p>
          <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label="Копировать промпт" onClick={copyPrompt}>
            <Copy className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function VideoThumb({ src, poster, onPoster }: { src: string; poster?: string; onPoster: (url: string) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [shot, setShot] = useState(poster || "");

  useEffect(() => {
    if (shot) return;
    const el = ref.current;
    if (!el) return;
    const grab = () => {
      if (!el.videoWidth) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = el.videoWidth;
        canvas.height = el.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(el, 0, 0);
        const url = canvas.toDataURL("image/jpeg", 0.72);
        if (url.length < 40) return;
        setShot(url);
        onPoster(url);
      } catch {
        /* tainted */
      }
    };
    const kick = () => {
      void el
        .play()
        .then(() => {
          el.pause();
          grab();
        })
        .catch(grab);
    };
    el.addEventListener("loadeddata", kick);
    el.addEventListener("seeked", grab);
    if (el.readyState >= 2) kick();
    return () => {
      el.removeEventListener("loadeddata", kick);
      el.removeEventListener("seeked", grab);
    };
  }, [src, shot, onPoster]);

  return (
    <div className="relative aspect-[9/16] w-full bg-elevated">
      {shot ? <img src={shot} alt="" className="size-full object-cover" /> : null}
      {showable(src) ? (
        <video
          ref={ref}
          src={src}
          className={shot ? "hidden" : "size-full object-cover"}
          muted
          playsInline
          preload="auto"
        />
      ) : null}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-bg/70">
          <Play className="size-5 fill-fg text-fg" />
        </span>
      </span>
    </div>
  );
}

async function jpegFromUrl(url: string) {
  if (!url) throw new Error("Не прочитался кадр из истории");
  const res = await fetch(apiUrl(url));
  if (!res.ok) throw new Error("Не прочитался кадр из истории");
  const blob = await res.blob();
  if (!blob.size || blob.type.startsWith("video/") || blob.type.includes("json") || blob.type.includes("html")) {
    throw new Error("Это не фото");
  }
  return blobToJpegDataUrl(blob);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не прочитался файл"));
    reader.readAsDataURL(blob);
  });
}

async function blobToJpegDataUrl(blob: Blob, maxEdge = 1024): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  let edge = maxEdge;
  let quality = 0.82;
  try {
    for (let i = 0; i < 5; i += 1) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Не удалось подготовить кадр.");
      ctx.drawImage(bitmap, 0, 0, width, height);
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= 3_800_000) return url;
      quality = Math.max(0.52, quality - 0.1);
      edge = Math.round(edge * 0.82);
    }
  } finally {
    bitmap.close();
  }
  throw new Error("Кадр слишком тяжёлый для Imagine.");
}
