import { CloudUpload, LoaderCircle, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ChatSendButton } from "@/components/chat-send-button";
import { ImagineBar } from "@/components/imagine-dice";
import { MediaImg } from "@/components/media-img";
import { ShtoraMediaViewer } from "@/components/shtora-media-viewer";
import { Button } from "@/components/ui/button";
import { uploadMediaJob } from "@/lib/dropbox/client-upload";
import { destFor } from "@/lib/dropbox/paths";
import { liveDropboxToken } from "@/lib/dropbox/token";
import { markFileSaved } from "@/lib/dropbox/saved";
import { useIsSaved } from "@/lib/dropbox/use-is-saved";
import { folderForAccount, useShtoraSettings } from "@/lib/shtora-settings";

export function ProfilePhotoViewer({
  url,
  username,
  onClose,
  onNeedToken,
}: {
  url: string;
  username: string;
  onClose: () => void;
  onNeedToken?: () => void;
}) {
  const { settings } = useShtoraSettings();
  const [saving, setSaving] = useState(false);
  const saved = useIsSaved(username, "profile", "avatar", 0);

  async function save() {
    if (saving || saved) return;
    if (!settings.dropboxToken.trim() && !settings.dropboxRefreshToken.trim()) {
      toast.error("Добавьте токен Dropbox в настройках");
      onNeedToken?.();
      return;
    }
    setSaving(true);
    try {
      const folder = folderForAccount(username, settings);
      await uploadMediaJob({
        token: await liveDropboxToken(settings.dropboxToken),
        destPath: destFor(folder, "avatar"),
        mediaUrl: url,
      });
      markFileSaved(username, "profile", "avatar", 0);
      toast.success("Аватар сохранён в Dropbox");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить аватар");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ShtoraMediaViewer
      eyebrow="Профиль"
      title={`@${username}`}
      onClose={onClose}
      actions={
        <>
          <ChatSendButton username={username} imageUrl={url} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 rounded-full text-muted hover:text-fg"
            aria-label={saved ? "Сохранено" : "Сохранить в Dropbox"}
            onClick={() => void save()}
            disabled={saving || saved}
          >
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
          </Button>
        </>
      }
      footer={<ImagineBar mediaUrl={url} username={username} onNeedToken={onNeedToken} />}
    >
      <MediaImg src={url} alt="" className="max-h-full max-w-full rounded-[18px] object-contain" />
    </ShtoraMediaViewer>
  );}
