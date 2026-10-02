import { createEngine } from "./engine/runner";
import type { IgHighlight, IgStories } from "./types";

export async function fetchStoriesFromHiker(username: string, token: string, force = false): Promise<IgStories> {
  return createEngine({ hiker: token, apify: "" }).stories(username, force);
}

export async function fetchHighlightFromHiker(id: string, token: string): Promise<IgHighlight> {
  return createEngine({ hiker: token, apify: "" }).highlight(id);
}

export function rememberHighlightItems(_username: string, _token: string, _highlight: IgHighlight) {
  /* snapshot persistence lives in fetchHighlight */
}
