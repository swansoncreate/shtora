export const PINNED_ACCOUNTS = ["ellissawe", "dashutiya", "sheptnowa", "minsiyaaa"] as const;

export type PinnedAccount = (typeof PINNED_ACCOUNTS)[number];

export const DEFAULT_FAVORITES: string[] = [];

export const MAX_FAVORITES = 16;

export const DEFAULT_APIFY_TOKEN = "";

export function isPinnedAccount(name: string): name is PinnedAccount {
  return (PINNED_ACCOUNTS as readonly string[]).includes(name);
}

export function cleanFavorite(name: string) {
  return name.trim().replace(/^@/, "").toLowerCase();
}
