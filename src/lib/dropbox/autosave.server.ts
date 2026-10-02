import { fetchProfileFromApify } from "@/lib/instagram/apify.server";
import { fetchStoriesSmart } from "@/lib/instagram/stories.server";
import { PINNED_ACCOUNTS } from "@/lib/instagram/pinned";
import { folderForAccount, type ShtoraSettings } from "@/lib/shtora-settings";
import { refreshDropboxAccess } from "./oauth.server";
import { uploadMediaToDropbox } from "./dropbox.server";
import { destFor, safeName } from "./paths";
import { fileKey } from "./saved";
import { patchServerConfig } from "@/lib/server/config";

export type AutoSaveBody = {
  apifyToken: string;
  hikerToken?: string;
  tikhubToken?: string;
  dropboxToken: string;
  dropboxRefreshToken?: string;
  dropboxAppKey?: string;
  dropboxAppSecret?: string;
  defaultFolder: string;
  accountFolders: ShtoraSettings["accountFolders"];
  savedFiles?: string[];
  username?: string;
  favorites?: string[];
};

type Job = { key: string; url: string; destPath: string };

export async function runServerAutoSave(body: AutoSaveBody) {
  const settings: ShtoraSettings = {
    apifyToken: body.apifyToken.trim(),
    hikerToken: body.hikerToken?.trim() ?? "",
    tikhubToken: body.tikhubToken?.trim() ?? "",
    dropboxToken: body.dropboxToken.trim(),
    dropboxRefreshToken: body.dropboxRefreshToken?.trim() ?? "",
    dropboxAppKey: body.dropboxAppKey?.trim() ?? "",
    dropboxAppSecret: body.dropboxAppSecret?.trim() ?? "",
    dropboxTokenExpiresAt: 0,
    defaultFolder: body.defaultFolder || "/Штора",
    accountFolders: body.accountFolders,
    favorites: body.favorites?.length ? body.favorites : Object.keys(body.accountFolders ?? {}),
    chatBackstory: {},
    chatEvents: {},
    chatSetup: {},
    autoSave: true,
    imaginePrompt: "",
    chatApiKey: "",
    chatModel: "",
    chatEngine: "claude",
  };
  if (!settings.dropboxToken && !settings.dropboxRefreshToken) throw new Error("Нет токена Dropbox.");
  if (!settings.apifyToken && !settings.hikerToken && !settings.tikhubToken) throw new Error("Нет токена TikHub.");

  if (body.dropboxRefreshToken && body.dropboxAppKey && body.dropboxAppSecret) {
    try {
      const next = await refreshDropboxAccess({
        refreshToken: body.dropboxRefreshToken,
        appKey: body.dropboxAppKey,
        appSecret: body.dropboxAppSecret,
      });
      settings.dropboxToken = next.accessToken;
      settings.dropboxTokenExpiresAt = next.expiresAt;
      await patchServerConfig({
        dropboxToken: next.accessToken,
        dropboxRefreshToken: next.refreshToken || body.dropboxRefreshToken,
        dropboxTokenExpiresAt: next.expiresAt,
      }).catch(() => undefined);
    } catch {
      /* keep current access token */
    }
  }

  const known = new Set(body.savedFiles ?? []);
  const names = body.username
    ? [body.username.trim().toLowerCase()]
    : (body.favorites?.length ? body.favorites : [...PINNED_ACCOUNTS]).map((name) => name.trim().toLowerCase());
  const keys: string[] = [];
  let uploaded = 0;
  let failed = 0;
  let lastError: string | undefined;
  const jobs: Job[] = [];

  for (const username of names) {
    if (!username) continue;
    const folder = folderForAccount(username, settings);
    try {
      const profile = await fetchProfileFromApify(username, settings.apifyToken);
      for (const post of profile.posts) {
        post.slides.forEach((slide, i) => {
          const key = fileKey(username, "post", post.id, i);
          if (known.has(key)) return;
          const url = slide.type === "video" ? (slide.videoUrl ?? slide.displayUrl) : slide.displayUrl;
          if (!url) return;
          const stem = safeName(post.shortCode || post.id);
          jobs.push({
            key,
            url,
            destPath: destFor(folder, post.slides.length > 1 ? `${stem}_${i + 1}` : stem, slide.type === "video"),
          });
          if (slide.type === "video" && slide.displayUrl && slide.displayUrl !== slide.videoUrl) {
            const coverKey = fileKey(username, "post", post.id, 1000 + i);
            if (!known.has(coverKey)) {
              jobs.push({
                key: coverKey,
                url: slide.displayUrl,
                destPath: destFor(
                  folder,
                  post.slides.length > 1 ? `${stem}_${i + 1}_cover` : `${stem}_cover`,
                ),
              });
            }
          }
        });
      }
    } catch (err) {
      failed += 1;
      lastError = err instanceof Error ? err.message : "профиль";
    }

    try {
      const stories = await fetchStoriesSmart(username, settings.apifyToken, settings.hikerToken, false, settings.tikhubToken);
      stories.stories.forEach((story, i) => {
        const key = fileKey(username, "story", story.id, 0);
        if (known.has(key)) return;
        const url =
          story.mediaType === "video" ? (story.videoUrl ?? story.imageUrl ?? "") : (story.imageUrl ?? "");
        if (!url) return;
        const stamp = story.takenAt
          ? new Date(story.takenAt * 1000).toISOString().slice(0, 10)
          : "story";
        jobs.push({
          key,
          url,
          destPath: destFor(folder, `${stamp}_${safeName(story.id) || String(i)}`, story.mediaType === "video"),
        });
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : "сторис";
    }
  }

  for (const job of jobs) {
    try {
      await uploadMediaToDropbox({
        token: settings.dropboxToken,
        destPath: job.destPath,
        mediaUrl: job.url,
      });
      known.add(job.key);
      keys.push(job.key);
      uploaded += 1;
    } catch (err) {
      failed += 1;
      lastError = err instanceof Error ? err.message : "Dropbox";
    }
  }

  const log =
    failed && !uploaded
      ? `Фон: ошибок ${failed}${lastError ? ` — ${lastError}` : ""}`
      : `Фон: ${uploaded} файлов${failed ? `, ошибок ${failed}` : ""}`;
  return { saved: uploaded, failed, keys, lastError, log };
}
