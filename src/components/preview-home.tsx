import { useEffect, useMemo, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { DropboxBrowser } from "@/components/dropbox-browser";
import { ImagineStudio } from "@/components/imagine-studio";
import { HomeFeed } from "@/components/home-feed";
import { PostViewer } from "@/components/post-viewer";
import { FavoritesStrip } from "@/components/favorites-strip";
import { Button } from "@/components/ui/button";
import {
  HighlightsRail,
  PostsGrid,
  ProfileHeader,
  ProfileTabs,
  StoriesGrid,
} from "@/components/instagram/profile";
import type { FeedCard } from "@/lib/feed/simulate";
import type { IgHighlight, IgPost, IgProfile, IgStoryItem } from "@/lib/instagram/types";
import type { ShtoraSettings } from "@/lib/shtora-settings";
import { cn } from "@/lib/utils";

type Props = {
  settings: ShtoraSettings;
  app: "instagram" | "dropbox" | "imagine";
  username?: string;
  onOpenChats: (name?: string | null) => void;
  onNeedSettings: () => void;
};

type ProfileView = { username: string; tab: "posts" | "stories" };

const img1 =
  "https://scontent-ham3-1.cdninstagram.com/v/t51.82787-15/791996244_17911993050294263_1123133377771000635_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-ham3-1.cdninstagram.com&_nc_cat=111&_nc_oc=Q6cZ2gHcW6KRLenJOzts1Ui57cmF5-gU4n6l1_USUw0wsu1rNAnlvofjmYtZnDWCiWfenHc&_nc_ohc=JE-qWiJWY1QQ7kNvwG3_a4t&_nc_gid=fMpl9Egbw_x8_7bzhB-2sA&edm=AOQ1c0wBAAAA&ccb=7-5&ig_cache_key=Mzk3NjYxMTYzMzUyNjA4NTQ5MA%3D%3D.3-ccb7-5&oh=00_AQLyUjFTZPNVvcJHu1qPTQbJ3UQ1w3JpDWfehIXLEFEsVg&oe=6A9F2294&_nc_sid=8b3546";
const img2 =
  "https://instagram.fwaw8-2.fna.fbcdn.net/v/t51.71878-15/503026628_1383910889496911_6891064760215577954_n.jpg?stp=dst-jpg_e15_tt6&_nc_ht=instagram.fwaw8-2.fna.fbcdn.net&_nc_cat=111&_nc_oc=Q6cZ2gHzg-o0a4pmJtAUXqtho2YQTt7Mi7izFclIkQ-mo1zOZ11YQ1yBr4HjC9a9ms_q__Q&_nc_ohc=2u1MVVh0IzEQ7kNvwFbRJjm&_nc_gid=DfcH8QHOnB5F3Tj4OPMDeA&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AQJLNWL57eQrVQDSytySAwG9FzrYa0cDF8VVMeyViMSNfQ&oe=6A9F2EB6&_nc_sid=8b3546";
const img3 =
  "https://instagram.ffec19-1.fna.fbcdn.net/v/t51.82787-15/651593557_18067981268270278_4368376125826548432_n.webp?stp=dst-jpg_e15_tt6&_nc_ht=instagram.ffec19-1.fna.fbcdn.net&_nc_cat=110&_nc_oc=Q6cZ2gEjkWX04PgW32b2zlVzJuQUYifhtEqvdUMuXVKyNOC4Q67z85XVD2GiKapDHo9xgk4&_nc_ohc=-0k0nmJIDbwQ7kNvwF5zYke&_nc_gid=jqdmEWyFxsMNkx4J5a4ggg&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_AQJZdM8enPxvYBMBVfUNBgkTtMBJscDEoSaxv2f8Tc54fQ&oe=6A9F5114&_nc_sid=8b3546";

function post(id: string, url: string, caption: string, timestamp: string, type: IgPost["type"] = "image"): IgPost {
  return {
    id,
    type,
    caption,
    displayUrl: url,
    timestamp,
    likesCount: 127,
    commentsCount: 4,
    slides: [{ id: id + "-1", type: type === "video" ? "video" : "image", displayUrl: url }],
  };
}

const profiles: IgProfile[] = [
  {
    username: "ellissawe",
    fullName: "Lisa",
    biography: "Тихо смотрю на жизнь и сохраняю кадры.",
    followersCount: 48,
    followsCount: 21,
    postsCount: 6,
    profilePicUrl: img1,
    verified: false,
    private: false,
    posts: [
      post("ella-1", img1, "Тренировка на спину 🪄", "2026-09-01T13:31:50.000Z", "sidecar"),
      post("ella-2", img2, "", "2026-08-31T09:52:04.000Z", "video"),
      post("ella-3", img3, "утро", "2026-08-18T10:12:24.000Z"),
    ],
  },
  {
    username: "minsiyaaa",
    fullName: "𝓐𝓷𝓪𝓼𝓽𝓪𝓼𝓲𝓪🧿",
    biography: "Три месяца спустя всё ещё улыбаюсь.",
    followersCount: 684,
    followsCount: 339,
    postsCount: 22,
    profilePicUrl: img2,
    verified: true,
    private: false,
    posts: [
      post("mina-1", img2, "🤍", "2026-08-19T19:58:57.000Z", "video"),
      post("mina-2", img1, "Та самая история.", "2026-08-10T11:21:00.000Z", "sidecar"),
      post("mina-3", img3, "Welcome back", "2026-07-30T17:10:00.000Z"),
    ],
  },
  {
    username: "sheptnowa",
    fullName: "An Sheptunowa",
    biography: "rose / black / quiet.",
    followersCount: 219,
    followsCount: 102,
    postsCount: 3,
    profilePicUrl: img3,
    verified: false,
    private: false,
    posts: [
      post("shep-1", img3, "🌹", "2022-05-18T19:51:32.000Z", "sidecar"),
      post("shep-2", img2, "", "2022-05-08T22:34:37.000Z", "sidecar"),
      post("shep-3", img1, "🖤", "2022-02-14T15:31:00.000Z", "sidecar"),
    ],
  },
];

function storySet(profile: IgProfile): IgStoryItem[] {
  return profile.posts.map((p, i) => ({
    id: profile.username + "-story-" + i,
    mediaType: p.type === "video" ? "video" : "image",
    imageUrl: p.displayUrl,
    videoUrl: p.type === "video" ? p.displayUrl : undefined,
    takenAt: Date.parse(p.timestamp || "") || Date.now(),
  }));
}

function highlights(profile: IgProfile): IgHighlight[] {
  const stories = storySet(profile);
  return [
    { id: profile.username + "-hl-1", title: "жизнь", coverImageUrl: stories[0]?.imageUrl, mediaCount: stories.length, items: stories },
    { id: profile.username + "-hl-2", title: "ещё", coverImageUrl: stories[1]?.imageUrl, mediaCount: Math.max(1, stories.length - 1), items: stories.slice(1) },
  ];
}

function feedCards(): FeedCard[] {
  return profiles
    .flatMap((profile) =>
      profile.posts.map((p, i) => ({
        id: profile.username + ":" + p.id,
        username: profile.username,
        fullName: profile.fullName,
        avatar: profile.profilePicUrl,
        verified: profile.verified,
        caption: p.caption,
        at: Date.parse(p.timestamp || "") || Date.now() - i * 3600_000,
        post: p,
        comments: p.commentsCount || 0,
      })),
    )
    .sort((a, b) => b.at - a.at)
    .slice(0, 6);
}

export function PreviewHome({ settings, app, username, onOpenChats, onNeedSettings }: Props) {
  const [view, setView] = useState<ProfileView | null>(null);
  const [postView, setPostView] = useState<{ username: string; posts: IgPost[]; index: number } | null>(null);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const cards = useMemo(() => feedCards().map((card) => ({ ...card, liked: liked[card.id] ?? false })), [liked]);
  const profile = view ? profiles.find((item) => item.username === view.username) || profiles[0] : null;

  useEffect(() => {
    if (!username) {
      setView(null);
      return;
    }
    const found = profiles.find((item) => item.username === username.toLowerCase());
    setView(found ? { username: found.username, tab: "posts" } : null);
  }, [username]);

  if (app === "dropbox") {
    return <DropboxBrowser settings={{ ...settings, dropboxToken: "" }} path="/Штора" onPath={() => undefined} onNeedToken={onNeedSettings} />;
  }

  if (app === "imagine") {
    return <ImagineStudio settings={{ ...settings, dropboxToken: "" }} onNeedToken={onNeedSettings} />;
  }

  if (view && profile) {
    const stories = storySet(profile);
    const hls = highlights(profile);
    return (
      <section>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-10 rounded-lg" aria-label="Назад" onClick={() => setView(null)}>
            <span aria-hidden>←</span>
          </Button>
          <p className="truncate text-sm text-muted">Профиль · @{profile.username}</p>
        </div>
        <div className="mt-4">
          <ProfileHeader
            profile={profile}
            storyCount={stories.length}
            unseenStories={0}
            folder={settings.accountFolders[profile.username] || `/Штора/${profile.username}`}
            saving={false}
            refreshing={false}
            onSave={() => undefined}
            onRefresh={() => undefined}
            onOpenPhoto={() => setPostView({ username: profile.username, posts: profile.posts, index: 0 })}
            onOpenStories={() => setPostView({ username: profile.username, posts: profile.posts, index: 0 })}
            onMessage={() => onOpenChats(profile.username)}
            favorite={settings.favorites.includes(profile.username)}
            chatUnread={0}
            onToggleFavorite={() => undefined}
          />
          <HighlightsRail highlights={hls} onOpen={(hl) => setPostView({ username: profile.username, posts: hl.items as unknown as IgPost[], index: 0 })} />
          <ProfileTabs tab={view.tab} storyCount={stories.length} onTab={(tab) => setView({ ...view, tab })} />
          {view.tab === "posts" ? (
            <PostsGrid posts={profile.posts} username={profile.username} onOpen={(index) => setPostView({ username: profile.username, posts: profile.posts, index })} onNeedToken={onNeedSettings} />
          ) : (
            <StoriesGrid stories={stories} username={profile.username} onOpen={(index) => setPostView({ username: profile.username, posts: profile.posts, index })} onNeedToken={onNeedSettings} />
          )}
        </div>
        {postView ? (
          <PostViewer
            posts={postView.posts}
            index={Math.min(postView.index, Math.max(0, postView.posts.length - 1))}
            username={postView.username}
            onClose={() => setPostView(null)}
            onIndex={(index) => setPostView({ ...postView, index })}
            onNeedToken={onNeedSettings}
          />
        ) : null}
      </section>
    );
  }

  return (
    <section>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="subtle"
          size="icon"
          className="size-12 shrink-0 rounded-lg"
          aria-label="Обновить ленту"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            window.setTimeout(() => setRefreshing(false), 650);
          }}
        >
          <RefreshCw className={refreshing ? "size-5 animate-spin" : "size-5"} />
        </Button>
      </div>

      <FavoritesStrip
        names={settings.favorites.length ? settings.favorites : profiles.map((item) => item.username)}
        active=""
        tick={0}
        onPick={(name) => {
          const found = profiles.find((item) => item.username === name);
          if (found) setView({ username: found.username, tab: "posts" });
        }}
      />

      <HomeFeed
        items={cards}
        refreshing={refreshing}
        onRefresh={() => undefined}
        onOpenPost={(username, posts, index) => setPostView({ username, posts, index })}
        onOpenDropbox={() => undefined}
        onOpenProfile={(username) => setView({ username, tab: "posts" })}
        onLike={(card) => setLiked((prev) => ({ ...prev, [card.id]: !(prev[card.id] ?? false) }))}
        onComments={() => undefined}
      />

      {postView ? (
        <PostViewer
          posts={postView.posts}
          index={postView.index}
          username={postView.username}
          onClose={() => setPostView(null)}
          onIndex={(index) => setPostView({ ...postView, index })}
          onNeedToken={onNeedSettings}
        />
      ) : null}

      <div className="mt-6 flex items-center justify-between rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
        <p className="text-sm text-muted">UI preview · данные локальные · backend не нужен</p>
        <Button type="button" variant="ghost" size="icon" className="size-10 rounded-lg" aria-label="Закрыть" onClick={() => setView(null)}>
          <X className="size-4" />
        </Button>
      </div>
    </section>
  );
}
