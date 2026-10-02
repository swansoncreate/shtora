import { loadProfileCached, loadStoriesCached, shouldRefreshPosts } from "@/lib/instagram/load";
import { folderForAccount, type ShtoraSettings } from "@/lib/shtora-settings";
import type { IgPost, IgStoryItem } from "@/lib/instagram/types";
import { destFor, safeName } from "./paths";
import { uploadMediaJob } from "./client-upload";
import { liveDropboxToken } from "./token";
import {
  isFileSaved,
  markFileSaved,
  markStoriesSavedToday,
  getLastRun,
  setLastRun,
  setSaveNotice,
  type SaveKind,
} from "./saved";

export type SaveJob = {
  username: string;
  kind: SaveKind;
  id: string;
  slide: number;
  url: string;
  destPath: string;
  posterFrom?: boolean;
};

export type SaveProgress = {
  status: "idle" | "running" | "done" | "error";
  username?: string;
  message: string;
  done: number;
  total: number;
  mode?: "manual" | "auto";
};

type Listener = (p: SaveProgress) => void;

const COVER_SLIDE = 1000;

let progress: SaveProgress = { status: "idle", message: "", done: 0, total: 0 };
const listeners = new Set<Listener>();
let chain: Promise<void> = Promise.resolve();
const inflight = new Set<string>();
let hideTimer = 0;

export function getSaveProgress(): SaveProgress {
  return progress;
}

export function subscribeSaveProgress(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setProgress(next: SaveProgress) {
  progress = next;
  listeners.forEach((fn) => fn(next));
  if (typeof window === "undefined") return;
  window.clearTimeout(hideTimer);
  if (next.status === "done" || next.status === "error") {
    hideTimer = window.setTimeout(() => {
      if (progress.status === "done" || progress.status === "error") {
        progress = { status: "idle", message: "", done: 0, total: 0 };
        listeners.forEach((fn) => fn(progress));
      }
    }, 4500);
  }
}

export function dismissSaveProgress() {
  window.clearTimeout(hideTimer);
  progress = { status: "idle", message: "", done: 0, total: 0 };
  listeners.forEach((fn) => fn(progress));
}

function sameMedia(a?: string, b?: string) {
  if (!a || !b) return false;
  const na = a.split("?")[0];
  const nb = b.split("?")[0];
  return na === nb;
}

function coverJobForVideoPost(username: string, folder: string, post: IgPost, i: number): SaveJob | null {
  const slide = post.slides[i];
  if (!slide || slide.type !== "video") return null;
  if (isFileSaved(username, "post", post.id, COVER_SLIDE + i)) return null;
  const cover = slide.displayUrl && !sameMedia(slide.displayUrl, slide.videoUrl) ? slide.displayUrl : "";
  const stem = safeName(post.shortCode || post.id);
  const name = post.slides.length > 1 ? `${stem}_${i + 1}_cover` : `${stem}_cover`;
  return {
    username,
    kind: "post",
    id: post.id,
    slide: COVER_SLIDE + i,
    url: cover || slide.videoUrl || slide.displayUrl,
    destPath: destFor(folder, name),
    posterFrom: !cover,
  };
}

export function collectPostJobs(username: string, folder: string, posts: IgPost[]): SaveJob[] {
  const jobs: SaveJob[] = [];
  for (const post of posts) {
    post.slides.forEach((slide, i) => {
      if (isFileSaved(username, "post", post.id, i)) return;
      const url = slide.type === "video" ? (slide.videoUrl ?? slide.displayUrl) : slide.displayUrl;
      if (!url) return;
      const stem = safeName(post.shortCode || post.id);
      const name = post.slides.length > 1 ? `${stem}_${i + 1}` : stem;
      jobs.push({
        username,
        kind: "post",
        id: post.id,
        slide: i,
        url,
        destPath: destFor(folder, name, slide.type === "video"),
      });
      const cover = coverJobForVideoPost(username, folder, post, i);
      if (cover) jobs.push(cover);
    });
  }
  return jobs;
}

export function collectStoryJobs(
  username: string,
  folder: string,
  stories: IgStoryItem[],
  kind: SaveKind = "story",
  highlightTitle?: string,
): SaveJob[] {
  const jobs: SaveJob[] = [];
  stories.forEach((story, i) => {
    if (isFileSaved(username, kind, story.id, 0)) return;
    const url =
      story.mediaType === "video" ? (story.videoUrl ?? story.imageUrl ?? "") : (story.imageUrl ?? "");
    if (!url) return;
    const stamp = story.takenAt
      ? new Date(story.takenAt * 1000).toISOString().slice(0, 10)
      : "story";
    const name = `${stamp}_${safeName(story.id) || String(i)}`;
    jobs.push({
      username,
      kind,
      id: story.id,
      slide: 0,
      url,
      destPath: destFor(folder, name, story.mediaType === "video"),
    });
    if (story.mediaType === "video") {
      const hasCover = Boolean(story.imageUrl && !sameMedia(story.imageUrl, story.videoUrl));
      if (!isFileSaved(username, kind, story.id, COVER_SLIDE)) {
        jobs.push({
          username,
          kind,
          id: story.id,
          slide: COVER_SLIDE,
          url: hasCover ? story.imageUrl! : story.videoUrl || story.imageUrl || "",
          destPath: destFor(folder, `${name}_cover`),
          posterFrom: !hasCover,
        });
      }
    }
  });
  return jobs;
}

export function jobForPostSlide(
  username: string,
  folder: string,
  post: IgPost,
  slideIndex: number,
): SaveJob | null {
  const slide = post.slides[slideIndex];
  if (!slide) return null;
  const url = slide.type === "video" ? (slide.videoUrl ?? slide.displayUrl) : slide.displayUrl;
  if (!url) return null;
  const stem = safeName(post.shortCode || post.id);
  const name = post.slides.length > 1 ? `${stem}_${slideIndex + 1}` : stem;
  return {
    username,
    kind: "post",
    id: post.id,
    slide: slideIndex,
    url,
    destPath: destFor(folder, name, slide.type === "video"),
  };
}

export function jobsForPostSlide(
  username: string,
  folder: string,
  post: IgPost,
  slideIndex: number,
): SaveJob[] {
  const main = jobForPostSlide(username, folder, post, slideIndex);
  const jobs = main ? [main] : [];
  const cover = coverJobForVideoPost(username, folder, post, slideIndex);
  if (cover) jobs.push(cover);
  return jobs;
}

export function jobForStoryItem(
  username: string,
  folder: string,
  story: IgStoryItem,
  kind: SaveKind,
  highlightTitle?: string,
  index = 0,
): SaveJob | null {
  const url =
    story.mediaType === "video" ? (story.videoUrl ?? story.imageUrl ?? "") : (story.imageUrl ?? "");
  if (!url) return null;
  const stamp = story.takenAt
    ? new Date(story.takenAt * 1000).toISOString().slice(0, 10)
    : kind === "highlight"
      ? "hl"
      : "story";
  const name = `${stamp}_${safeName(story.id) || String(index)}`;
  return {
    username,
    kind,
    id: story.id,
    slide: 0,
    url,
    destPath: destFor(folder, name, story.mediaType === "video"),
  };
}

export function jobsForStoryItem(
  username: string,
  folder: string,
  story: IgStoryItem,
  kind: SaveKind,
  highlightTitle?: string,
  index = 0,
): SaveJob[] {
  const main = jobForStoryItem(username, folder, story, kind, highlightTitle, index);
  const jobs = main ? [main] : [];
  if (story.mediaType === "video") {
    if (!isFileSaved(username, kind, story.id, COVER_SLIDE)) {
      const hasCover = Boolean(story.imageUrl && !sameMedia(story.imageUrl, story.videoUrl));
      const stamp = story.takenAt
        ? new Date(story.takenAt * 1000).toISOString().slice(0, 10)
        : kind === "highlight"
          ? "hl"
          : "story";
      const name = `${stamp}_${safeName(story.id) || String(index)}_cover`;
      jobs.push({
        username,
        kind,
        id: story.id,
        slide: COVER_SLIDE,
        url: hasCover ? story.imageUrl! : story.videoUrl || story.imageUrl || "",
        destPath: destFor(folder, name),
        posterFrom: !hasCover,
      });
    }
  }
  return jobs;
}

async function uploadJobs(
  dropboxToken: string,
  jobs: SaveJob[],
  username: string,
  mode: "manual" | "auto",
  label: string,
): Promise<{ saved: number; failed: number; lastError?: string }> {
  let saved = 0;
  let failed = 0;
  let lastError: string | undefined;
  let consecutive = 0;
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (!job) continue;
    if (isFileSaved(job.username, job.kind, job.id, job.slide)) {
      saved += 1;
      continue;
    }
    if (mode !== "auto") {
      setProgress({
        status: "running",
        username,
        mode,
        message: `${label}: ${i + 1} из ${jobs.length}`,
        done: i,
        total: jobs.length,
      });
    }
    try {
      await uploadMediaJob({
        token: dropboxToken,
        destPath: job.destPath,
        mediaUrl: job.url,
        posterFrom: job.posterFrom,
      });
      markFileSaved(job.username, job.kind, job.id, job.slide);
      saved += 1;
      consecutive = 0;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "ошибка Dropbox";
      consecutive = message === lastError ? consecutive + 1 : 1;
      lastError = message;
      console.warn("dropbox upload failed", err);
      if (consecutive >= 3) {
        lastError = `${message} — остановил после трёх одинаковых ошибок.`;
        failed += jobs.length - i - 1;
        break;
      }
    }
  }
  return { saved, failed, lastError };
}

export async function saveAccountToDropbox(opts: {
  username: string;
  settings: ShtoraSettings;
  includeStories: boolean;
  mode: "manual" | "auto";
}): Promise<{ saved: number; failed: number; skippedStories: boolean; lastError?: string }> {
  const username = opts.username.trim().toLowerCase();
  const hasSrc = Boolean(opts.settings.apifyToken.trim() || opts.settings.hikerToken.trim() || opts.settings.tikhubToken.trim());
  if (!hasSrc) {
    if (opts.mode === "auto") return { saved: 0, failed: 0, skippedStories: true };
    throw new Error("Нет токена Instagram (Apify / Hiker / TikHub).");
  }
  const dropboxToken = await liveDropboxToken(opts.settings.dropboxToken);
  const folder = folderForAccount(username, opts.settings);
  const jobs: SaveJob[] = [];
  let skippedStories = false;
  const silent = opts.mode === "auto";

  if (!silent) {
    setProgress({
      status: "running",
      username,
      mode: opts.mode,
      message: `Открываем @${username}`,
      done: 0,
      total: 1,
    });
  }

  const profile = await loadProfileCached(
    username,
    opts.settings.apifyToken,
    opts.mode === "auto" && shouldRefreshPosts(username),
    opts.settings.hikerToken,
  );
  jobs.push(...collectPostJobs(username, folder, profile.posts));

  if (opts.includeStories) {
    if (!silent) {
      setProgress({
        status: "running",
        username,
        mode: opts.mode,
        message: `Сторис @${username}`,
        done: 0,
        total: 1,
      });
    }
    try {
      const stories = await loadStoriesCached(
        username,
        opts.settings.apifyToken,
        false,
        opts.settings.hikerToken,
      );
      jobs.push(...collectStoryJobs(username, folder, stories.stories));
      for (const hl of stories.highlights ?? []) {
        jobs.push(...collectStoryJobs(username, folder, hl.items, "highlight", hl.title));
      }
      if (opts.mode === "auto") markStoriesSavedToday(username);
    } catch (err) {
      console.warn("stories fetch failed", err);
      skippedStories = true;
    }
  }

  if (jobs.length === 0) {
    if (!silent) {
      setProgress({
        status: "done",
        username,
        mode: opts.mode,
        message: `@${username}: новых файлов нет`,
        done: 0,
        total: 0,
      });
    }
    return { saved: 0, failed: 0, skippedStories };
  }

  const result = await uploadJobs(
    dropboxToken,
    jobs,
    username,
    opts.mode,
    `Сохраняем @${username}`,
  );
  const log =
    result.failed > 0
      ? `@${username}: ${result.saved} сохранено, ${result.failed} ошибок${result.lastError ? ` — ${result.lastError}` : ""}`
      : `@${username}: ${result.saved} файлов`;
  setLastRun(log);
  if (!silent) {
    setProgress({
      status: result.failed && !result.saved ? "error" : "done",
      username,
      mode: opts.mode,
      message: log,
      done: result.saved,
      total: jobs.length,
    });
  }
  return { ...result, skippedStories };
}

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function queueSaveAccount(opts: {
  username: string;
  settings: ShtoraSettings;
  includeStories: boolean;
  mode: "manual" | "auto";
}): Promise<{ saved: number; failed: number; skippedStories: boolean; lastError?: string }> {
  const username = opts.username.trim().toLowerCase();
  return new Promise((resolve, reject) => {
    void enqueue(async () => {
      if (inflight.has(username)) {
        resolve({ saved: 0, failed: 0, skippedStories: true });
        return;
      }
      inflight.add(username);
      try {
        const result = await saveAccountToDropbox(opts);
        resolve(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Не удалось сохранить.";
        if (opts.mode !== "auto") {
          setProgress({
            status: "error",
            username,
            mode: opts.mode,
            message,
            done: 0,
            total: 0,
          });
        }
        reject(err);
      } finally {
        inflight.delete(username);
      }
    });
  });
}

export function queueSaveJobs(opts: {
  jobs: SaveJob[];
  settings: ShtoraSettings;
  username: string;
}): Promise<{ saved: number; failed: number; lastError?: string }> {
  const jobs = opts.jobs.filter(Boolean);
  return new Promise((resolve, reject) => {
    void enqueue(async () => {
      let dropboxToken = "";
      try {
        dropboxToken = await liveDropboxToken(opts.settings.dropboxToken);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Добавьте токен Dropbox в настройках."));
        return;
      }
      if (jobs.length === 0) {
        resolve({ saved: 0, failed: 0 });
        return;
      }
      try {
        const result = await uploadJobs(
          dropboxToken,
          jobs,
          opts.username,
          "manual",
          "Сохраняем",
        );
        setProgress({
          status: result.failed && !result.saved ? "error" : "done",
          username: opts.username,
          mode: "manual",
          message:
            result.failed > 0
              ? `Сохранено ${result.saved}, ошибок ${result.failed}${result.lastError ? ` — ${result.lastError}` : ""}`
              : "Сохранено в Dropbox",
          done: result.saved,
          total: jobs.length,
        });
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
  });
}

export async function runAutoSave(settings: ShtoraSettings): Promise<void> {
  if (!settings.autoSave) return;
  if (!settings.dropboxToken.trim() && !settings.dropboxRefreshToken.trim()) return;
  const last = getLastRun();
  if (last.at && Date.now() - last.at < 6 * 60 * 60 * 1000) return;
  setLastRun("Автосохранение");
  let saved = 0;
  const names = (settings.favorites.length ? settings.favorites : Object.keys(settings.accountFolders || {})).map((n) =>
    n.trim().toLowerCase(),
  );
  for (const username of names) {
    if (!username) continue;
    try {
      const result = await queueSaveAccount({
        username,
        settings,
        includeStories: true,
        mode: "auto",
      });
      saved += result.saved;
    } catch (err) {
      console.warn("autosave failed", username, err);
    }
  }
  if (saved === 0) setLastRun("Автосохранение: новых файлов нет");
  else setSaveNotice(saved, `Автосохранение: ${saved} новых`);
}
