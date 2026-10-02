import { fetchProfile, fetchStories } from "./functions";
import { igCache } from "./store";
import type { IgProfile, IgStories } from "./types";

export async function loadAccount(
  username: string,
  token: string,
  force = false,
  hikerToken = "",
  tikhubToken = "",
) {
  return igCache.sync(
    username,
    {
      profile: () =>
        fetchProfile({
          data: {
            username,
            token,
            force,
            hikerToken: hikerToken || undefined,
            tikhubToken: tikhubToken || undefined,
          },
        }),
      stories: () =>
        fetchStories({
          data: {
            username,
            token,
            force,
            hikerToken: hikerToken || undefined,
            tikhubToken: tikhubToken || undefined,
          },
        }),
    },
    force,
  );
}

export async function loadProfileCached(
  username: string,
  token: string,
  force = false,
  hikerToken = "",
  tikhubToken = "",
): Promise<IgProfile> {
  const result = await loadAccount(username, token, force, hikerToken, tikhubToken);
  if (result.profile) return result.profile;
  throw new Error("Профиль не загрузился.");
}

export async function loadStoriesCached(
  username: string,
  token: string,
  force = false,
  hikerToken = "",
  tikhubToken = "",
): Promise<IgStories> {
  const result = await loadAccount(username, token, force, hikerToken, tikhubToken);
  if (result.stories) return result.stories;
  const cached = igCache.stories(username)?.data;
  if (cached) return cached;
  throw new Error("Сторис не открылись.");
}

export function shouldRefreshPosts(username: string): boolean {
  return !igCache.freshEnough(username);
}

export function shouldRefreshStories(username: string): boolean {
  return !igCache.freshEnough(username);
}
