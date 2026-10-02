import {
  fetchProfileFromApify,
  fetchStoriesFromApify,
} from "../apify.server";
import type { IgHighlight, IgProfile, IgStories } from "../types";
import type { EngineTokens, InstagramSource } from "./provider";

export class ApifyProfileSource implements InstagramSource {
  readonly name = "apify-profile";
  canRun(tokens: EngineTokens) {
    return tokens.apify.startsWith("apify_api_");
  }
  profile(username: string, tokens: EngineTokens, force: boolean): Promise<IgProfile> {
    return fetchProfileFromApify(username, tokens.apify, force);
  }
}

export class ApifyStoriesSource implements InstagramSource {
  readonly name = "apify-stories";
  canRun(tokens: EngineTokens) {
    return tokens.apify.startsWith("apify_api_");
  }
  stories(username: string, tokens: EngineTokens, force: boolean): Promise<IgStories> {
    return fetchStoriesFromApify(username, tokens.apify, force);
  }
  async highlight(id: string, tokens: EngineTokens): Promise<IgHighlight> {
    const want = id.replace(/^highlight:/i, "");
    const match = (hl: IgHighlight) =>
      hl.id === id || hl.id === want || hl.id.replace(/^highlight:/i, "") === want;
    const { listSnapshots } = await import("@/lib/server/snapshots");
    const snaps = await listSnapshots();
    for (const snap of snaps) {
      const found = snap.stories?.highlights.find(match);
      if (!found || !snap.username) continue;
      const real = found.items.filter((it) => !String(it.id).endsWith("-cover"));
      if (real.length) return { ...found, items: real };
      const pack = await fetchStoriesFromApify(snap.username, tokens.apify, true, true);
      const hit = pack.highlights.find(match);
      if (hit?.items.length) return hit;
      if (found.coverImageUrl || found.items.length) return found;
    }
    throw new Error("Хайлайт не открылся.");
  }
}
