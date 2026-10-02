import { createEngine } from "./engine/runner";
import type { IgStories } from "./types";

export async function fetchStoriesSmart(
  username: string,
  apifyToken: string,
  hikerToken: string,
  force = false,
  tikhubToken = "",
): Promise<IgStories> {
  return createEngine({ apify: apifyToken, hiker: hikerToken, tikhub: tikhubToken }).stories(username, force);
}
