import type { IgPost, IgProfile } from "@/lib/instagram/types";

export type FeedCard = {
  id: string;
  username: string;
  fullName: string;
  avatar?: string;
  verified: boolean;
  caption: string;
  at: number;
  post?: IgPost;
  dropbox?: { path: string; name: string; video: boolean };
  thumb?: string;
  liked?: boolean;
  generated?: boolean;
  filler?: boolean;
  story?: boolean;
  comments?: number;
};

export function cardAsPost(card: FeedCard): IgPost {
  if (card.post) return card.post;
  const url = card.thumb || "";
  const video = Boolean(card.dropbox?.video);
  return {
    id: card.id,
    type: video ? "video" : "image",
    caption: card.caption || "",
    displayUrl: url,
    videoUrl: video ? url : undefined,
    timestamp: new Date(card.at || Date.now()).toISOString(),
    slides: [
      {
        id: card.id,
        type: video ? "video" : "image",
        displayUrl: url,
        videoUrl: video ? url : undefined,
      },
    ],
  };
}

const SKIP_FOLDER = new Set(["posts", "stories", "highlights", "imagine", "generated", "variations", "shtora"]);

function hash(s: string) {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return n;
}

const LINES = ["", "", "так", "сегодня", "утро", "вечер", "мимоходом", "оставила", "без повода", "свет", "просто"];

export function generatedLine(username: string, seed: string, _world?: { place?: string; clothes?: string }, slot?: "morning" | "evening") {
  const key = `${username}:${slot || ""}:${(seed || "").slice(-32)}`;
  return LINES[hash(key) % LINES.length] || "";
}

export function generatedCaption(username: string, post: IgPost) {
  const own = post.caption?.replace(/\s+/g, " ").trim();
  if (own) return own.slice(0, 180);
  return generatedLine(username, post.id);
}

export function ownerFromDropboxPath(path: string, defaultFolder: string, known: string[]) {
  const lower = path.replace(/\\/g, "/").toLowerCase();
  for (const name of known) {
    const n = name.toLowerCase();
    if (!n) continue;
    if (lower.includes(`/${n}/`) || lower.endsWith(`/${n}`)) return n;
  }
  const root = (defaultFolder || "").toLowerCase().replace(/\/+$/, "");
  const rest = (root && lower.startsWith(`${root}/`) ? lower.slice(root.length) : lower)
    .split("/")
    .filter(Boolean);
  return rest.find((part) => !SKIP_FOLDER.has(part)) || "dropbox";
}

export function buildSimulatedFeed(profiles: IgProfile[], prefer: string[]): FeedCard[] {
  const wanted = new Set(prefer.map((n) => n.toLowerCase()));
  const source =
    wanted.size > 0 ? profiles.filter((p) => wanted.has(p.username.toLowerCase())) : profiles;
  const list = source.length ? source : profiles;
  const cards: FeedCard[] = [];
  for (const profile of list) {
    for (const post of profile.posts ?? []) {
      if (!post.displayUrl) continue;
      const ts = post.timestamp ? Date.parse(post.timestamp) : NaN;
      const at = Number.isFinite(ts) ? ts : Date.now() - (hash(post.id) % (36 * 60 * 60 * 1000));
      cards.push({
        id: `${profile.username}:${post.id}`,
        username: profile.username,
        fullName: profile.fullName || profile.username,
        avatar: profile.profilePicUrl,
        verified: profile.verified,
        post,
        caption: generatedCaption(profile.username, post),
        at,
      });
    }
  }
  cards.sort((a, b) => b.at - a.at);
  return cards;
}

export function mergeDropboxFeed(
  cards: FeedCard[],
  files: { path: string; name: string; at: number; isImage: boolean; isVideo: boolean }[],
  opts: {
    defaultFolder: string;
    known: string[];
    profiles: IgProfile[];
    thumbs: Map<string, string>;
  },
): FeedCard[] {
  const byUser = new Map(opts.profiles.map((p) => [p.username.toLowerCase(), p]));
  const extra: FeedCard[] = [];
  for (const file of files) {
    if (!file.isImage || !file.path) continue;
    const username = ownerFromDropboxPath(file.path, opts.defaultFolder, opts.known);
    const profile = byUser.get(username);
    extra.push({
      id: `db:${file.path}`,
      username,
      fullName: profile?.fullName || username,
      avatar: profile?.profilePicUrl,
      verified: Boolean(profile?.verified),
      caption: generatedLine(username, file.path),
      at: file.at || Date.now() - (hash(file.path) % (48 * 60 * 60 * 1000)),
      dropbox: { path: file.path, name: file.name, video: file.isVideo },
      thumb: opts.thumbs.get(file.path) ?? opts.thumbs.get(file.path.toLowerCase()),
    });
  }
  return [...cards, ...extra].sort((a, b) => b.at - a.at).slice(0, 72);
}
