import { CloudUpload, Dices, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useRef, useState, type FormEvent, type MouseEvent, type PointerEvent } from "react";
import { toast } from "sonner";
import { ChatSendButton } from "@/components/chat-send-button";
import { ShtoraMediaViewer } from "@/components/shtora-media-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendToChat } from "@/lib/chat/send";
import type { ChatKind } from "@/lib/chat/store";
import { uploadMediaJob } from "@/lib/dropbox/client-upload";
import { destFor, safeName } from "@/lib/dropbox/paths";
import { liveDropboxToken } from "@/lib/dropbox/token";
import { imagineVariation } from "@/lib/imagine/functions";
import { getMediaBlob } from "@/lib/instagram/media-cache";
import { folderForAccount, useShtoraSettings } from "@/lib/shtora-settings";

export function ImagineBar({
  mediaUrl,
  username,
  saveFolder,
  replyKind,
  onBusy,
  onNeedToken,
  onSaved,
}: {
  mediaUrl?: string | null;
  username: string;
  saveFolder?: string;
  replyKind?: ChatKind;
  onBusy?: (busy: boolean) => void;
  onNeedToken?: () => void;
  onSaved?: () => void;
}) {
  const { settings } = useShtoraSettings();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [compare, setCompare] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (!mediaUrl) return null;
  const source = mediaUrl;
  const current = result;

  async function roll(custom?: string, chain = false) {
    if (busy) return;
    const from = chain && current ? current : source;
    const prompt = (custom ?? draft).trim() || settings.imaginePrompt.trim() || undefined;
    setOpen(true);
    setBusy(true);
    onBusy?.(true);
    if (result?.startsWith("blob:")) URL.revokeObjectURL(result);
    setResult(null);
    try {
      let dataUrl: string;
      if (from.startsWith("data:image/jpeg") || from.startsWith("data:image/jpg")) {
        dataUrl = from.length > 4_500_000 ? await blobToJpegDataUrl(await (await fetch(from)).blob()) : from;
      } else {
        const blob = await getMediaBlob(from);
        dataUrl = await blobToJpegDataUrl(blob);
      }
      if (!chain || !original) setOriginal(dataUrl);
      let out = await imagineVariation({ data: { imageDataUrl: dataUrl, prompt } });
      if (!out.ok && !/подождать|слишком часто|credit|quota|Нет доступа|не принял/i.test(out.error || "")) {
        await sleep(900);
        out = await imagineVariation({ data: { imageDataUrl: dataUrl, prompt } });
      }
      if (!out.ok) throw new Error(out.error || "Imagine не выдал кадр. Подожди секунду и ещё раз.");
      setResult(await displayUrl(out.url));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось бросить кости");
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }

  async function saveToDropbox(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!current || saving) return;
    if (!settings.dropboxToken.trim() && !settings.dropboxRefreshToken.trim()) {
      toast.error("Добавьте токен Dropbox в настройках");
      onNeedToken?.();
      return;
    }
    setSaving(true);
    try {
      const name = `imagine_${safeName(String(Date.now()))}`;
      const destPath = destFor(saveFolder || folderForAccount(username, settings), name);
      await uploadMediaJob({
        token: await liveDropboxToken(settings.dropboxToken),
        destPath,
        mediaUrl: current,
      });
      toast.success("Imagine сохранён в Dropbox");
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить Imagine");
    } finally {
      setSaving(false);
    }
  }

  function closeSheet() {
    if (result?.startsWith("blob:")) URL.revokeObjectURL(result);
    setResult(null);
    setOriginal(null);
    setOpen(false);
    setCompare(false);
    onBusy?.(false);
  }

  function onPromptSubmit(e: FormEvent, chain: boolean) {
    e.preventDefault();
    e.stopPropagation();
    void roll(draft, chain);
  }

  async function sendReply() {
    const text = draft.trim();
    if (!text) {
      toast.error("Напиши ответ — или сердечко сверху");
      return;
    }
    if (!source || sending) return;
    setSending(true);
    onBusy?.(true);
    try {
      await sendToChat({ username, imageUrl: source, text, kind: replyKind ?? "photo" });
      setDraft("");
      toast.success(replyKind === "story" ? "Ответ на сторис" : "Отправлено в чат");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не отправилось");
    } finally {
      setSending(false);
      onBusy?.(false);
    }
  }

  function renderForm(chain: boolean) {
    const withReply = Boolean(replyKind) && !chain;
    return (
      <div className="shrink-0 border-t border-border/60 bg-bg pt-2">
        <form className="flex gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5" onSubmit={(e) => onPromptSubmit(e, chain)}>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => onBusy?.(true)}
            onBlur={() => {
              if (!busy && !open && !sending) onBusy?.(false);
            }}
            placeholder={
              chain ? "Докрутить этот кадр" : withReply ? "Ответить или свой промпт" : "Свой промпт"
            }
            maxLength={800}
            aria-label={withReply ? "Ответ или промпт Imagine" : "Промпт Imagine"}
            disabled={busy || sending}
          />
          <Button type="submit" size="lg" className="h-12 w-12 shrink-0 rounded-lg px-0" disabled={busy} aria-label="Сгенерировать">
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Dices className="size-5" />}
          </Button>
          {withReply ? (
            <Button
              type="button"
              size="lg"
              className="h-12 shrink-0 rounded-lg px-4"
              disabled={sending || busy || !draft.trim()}
              onClick={() => void sendReply()}
            >
              {sending ? "…" : "Ответ"}
            </Button>
          ) : null}
        </form>
      </div>
    );
  }

  return (
    <>
      {renderForm(false)}
      {open ? (
        <ShtoraMediaViewer
          eyebrow="Imagine · вариация"
          title={busy ? "Генерирую…" : result ? "Новая версия" : "Подготовка"}
          backdropSrc={current || source}
          meta={<span>{result ? "оригинал → новая версия" : "исходный кадр · готов к преобразованию"}</span>}
          onClose={closeSheet}
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 rounded-full"
                aria-label={compare ? "Скрыть сравнение" : "Было / стало"}
                disabled={!original || !current}
                onClick={() => setCompare((v) => !v)}
              >
                {compare ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
              <ChatSendButton username={username} imageUrl={current} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 rounded-full"
                aria-label="Сохранить в Dropbox"
                onClick={(e) => void saveToDropbox(e)}
                disabled={saving || busy || !current}
              >
                {saving ? <LoaderCircle className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
              </Button>
            </>
          }
          footer={renderForm(true)}
        >
          <div className="relative flex size-full min-h-0 items-center justify-center">
            {current ? (
              compare && original ? (
                <CompareSlide original={original} generated={current} />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-2">
                  <img
                    src={current}
                    alt=""
                    className="max-h-full max-w-full rounded-[22px] object-contain shadow-[0_28px_90px_rgba(0,0,0,0.42)]"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 text-sm text-muted">
                <span className="flex size-12 items-center justify-center rounded-full border border-accent/35 bg-accent/10">
                  <LoaderCircle className="size-5 animate-spin text-accent" />
                </span>
                <span className="uppercase tracking-[0.18em]">Крутим кадр</span>
              </div>
            )}
          </div>
        </ShtoraMediaViewer>
      ) : null}
    </>
  );
}

function CompareSlide({ original, generated }: { original: string; generated: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(0.5);
  const [ratio, setRatio] = useState(3 / 4);

  function setFromEvent(e: PointerEvent<HTMLDivElement>) {
    const el = box.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / Math.max(1, rect.width);
    setSplit(Math.min(0.95, Math.max(0.05, x)));
  }

  return (
    <div className="flex h-full w-full items-center justify-center px-3">
      <div
        ref={box}
        className="relative max-h-full w-full max-w-md touch-none select-none overflow-hidden rounded-md bg-elevated"
        style={{ aspectRatio: String(ratio), height: "min(100%, 72dvh)" }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          setFromEvent(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromEvent(e);
        }}
      >
        <img
          src={original}
          alt=""
          className="absolute inset-0 size-full object-contain"
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
          }}
        />
        <img
          src={generated}
          alt=""
          className="absolute inset-0 size-full object-contain"
          referrerPolicy="no-referrer"
          style={{ clipPath: `inset(0 ${((1 - split) * 100).toFixed(2)}% 0 0)` }}
        />
        <div className="pointer-events-none absolute inset-y-0 w-px bg-fg" style={{ left: `${split * 100}%` }} />
        <div
          className="pointer-events-none absolute top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface/90 shadow-[var(--shadow-border)]"
          style={{ left: `${split * 100}%` }}
        />
        <p className="pointer-events-none absolute bottom-2 left-2 text-[10px] uppercase tracking-wide text-fg/80">было</p>
        <p className="pointer-events-none absolute right-2 bottom-2 text-[10px] uppercase tracking-wide text-fg/80">стало</p>
      </div>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function displayUrl(url: string): Promise<string> {
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  try {
    const blob = await getMediaBlob(url);
    if (blob.size) return URL.createObjectURL(blob);
  } catch {
    /* fall through */
  }
  return url;
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
