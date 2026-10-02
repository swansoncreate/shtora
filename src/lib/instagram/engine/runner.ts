import { unionProfile, unionStories } from "../store";
import type { IgHighlight, IgProfile, IgStories } from "../types";
import { ApifyProfileSource, ApifyStoriesSource } from "./apify";
import { HikerSource } from "./hiker";
import type { EngineTokens, InstagramSource } from "./provider";
import { TikHubSource } from "./tikhub";

const TIKHUB = new TikHubSource();
const HIKER = new HikerSource();
const APIFY_PROFILE = new ApifyProfileSource();
const APIFY_STORIES = new ApifyStoriesSource();

function usefulProfile(p: IgProfile | null) {
  return Boolean(p?.username && (p.posts.length > 0 || p.profilePicUrl));
}

function usefulStories(s: IgStories | null) {
  return Boolean(s && (s.stories.length > 0 || s.highlights.length > 0));
}

export class InstagramEngine {
  constructor(private tokens: EngineTokens) {}

  private errors: string[] = [];

  private note(source: string, err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    this.errors.push(`${source}: ${msg}`);
  }

  lastErrors() {
    return this.errors.slice();
  }

  private sources(): InstagramSource[] {
    const list: InstagramSource[] = [];
    if (this.tokens.apify.startsWith("apify_api_")) {
      list.push(APIFY_PROFILE, APIFY_STORIES);
    }
    if (this.tokens.tikhub.length > 8) list.push(TIKHUB);
    if (this.tokens.hiker.length > 8) list.push(HIKER);
    return list;
  }

  async profile(username: string, force = false): Promise<IgProfile> {
    this.errors = [];
    let best: IgProfile | null = null;
    for (const src of this.sources()) {
      if (!src.profile || !src.canRun(this.tokens)) continue;
      try {
        const next = await src.profile(username, this.tokens, force);
        if (!next?.username) continue;
        best = unionProfile(best, next);
        if (usefulProfile(best) && (src.name === "apify-profile" || src.name === "tikhub" || src.name === "hiker")) return best;
      } catch (err) {
        this.note(src.name, err);
      }
    }
    if (best) return best;
    throw new Error(this.errors[0] || "Профиль не загрузился. Проверь токен Apify в настройках.");
  }

  async stories(username: string, force = false): Promise<IgStories> {
    this.errors = [];
    let best: IgStories | null = null;
    for (const src of this.sources()) {
      if (!src.stories || !src.canRun(this.tokens)) continue;
      try {
        const next = await src.stories(username, this.tokens, force);
        if (usefulStories(next) && (src.name === "apify-stories" || src.name === "tikhub" || src.name === "hiker")) return next;
        best = unionStories(best, next);
        if (usefulStories(best)) return best;
      } catch (err) {
        this.note(src.name, err);
      }
    }
    if (best) return best;
    throw new Error(this.errors[0] || "Сторис и хайлайты не загрузились. Проверь токен Apify.");
  }

  async highlight(id: string): Promise<IgHighlight> {
    this.errors = [];
    for (const src of this.sources()) {
      if (!src.highlight || !src.canRun(this.tokens)) continue;
      try {
        const hit = await src.highlight(id, this.tokens);
        if (hit?.id) return hit;
      } catch (err) {
        this.note(src.name, err);
      }
    }
    throw new Error(this.errors[0] || "Хайлайт не открылся.");
  }
}

export function createEngine(tokens: Partial<EngineTokens>): InstagramEngine {
  return new InstagramEngine({
    tikhub: String(tokens.tikhub ?? "").trim(),
    hiker: String(tokens.hiker ?? "").trim(),
    apify: String(tokens.apify ?? "").trim(),
  });
}
