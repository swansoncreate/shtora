import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DropboxBrowser } from "@/components/dropbox-browser";
import { ImagineStudio } from "@/components/imagine-studio";
import { HomeFeed } from "@/components/home-feed";
import { PostViewer } from "@/components/post-viewer";
import { PullRefresh } from "@/components/pull-refresh";
import { ShtoraPageHeader } from "@/components/shtora-page-header";
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

type Props = {
  settings: ShtoraSettings;
  app: "instagram" | "dropbox" | "imagine";
  username?: string;
  onOpenChats: (name?: string | null) => void;
  onNeedSettings: () => void;
};

type ProfileView = { username: string; tab: "posts" | "stories" };

const img1 = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=85";
const img2 = "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=85";
const img3 = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=85";
const img4 = "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=85";
const img5 = "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=85";
const img6 = "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85";

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
      post("ella-2", img4, "", "2026-08-31T09:52:04.000Z", "video"),
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
      post("mina-2", img5, "Та самая история.", "2026-08-10T11:21:00.000Z", "sidecar"),
      post("mina-3", img6, "Welcome back", "2026-07-30T17:10:00.000Z"),
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
      post("shep-2", img6, "", "2022-05-08T22:34:37.000Z", "sidecar"),
      post("shep-3", img4, "🖤", "2022-02-14T15:31:00.000Z", "sidecar"),
    ],
  },
  {
    username: "sofia",
    fullName: "Sofia",
    biography: "soft light, hard edges.",
    followersCount: 391,
    followsCount: 184,
    postsCount: 3,
    profilePicUrl: img4,
    verified: false,
    private: false,
    posts: [
      post("sofia-1", img4, "вечерний свет", "2026-08-22T18:21:00.000Z"),
      post("sofia-2", img1, "slow sunday", "2026-08-14T10:20:00.000Z"),
      post("sofia-3", img5, "", "2026-08-02T08:40:00.000Z", "sidecar"),
    ],
  },
  {
    username: "lena",
    fullName: "Lena",
    biography: "ничего лишнего.",
    followersCount: 127,
    followsCount: 73,
    postsCount: 3,
    profilePicUrl: img5,
    verified: true,
    private: false,
    posts: [
      post("lena-1", img5, "Новый день.", "2026-08-11T12:11:00.000Z", "sidecar"),
      post("lena-2", img2, "🤍", "2026-07-28T19:08:00.000Z"),
      post("lena-3", img6, "city / rain", "2026-07-17T06:31:00.000Z"),
    ],
  },
  {
    username: "mira",
    fullName: "Mira",
    biography: "архивирую случайные моменты.",
    followersCount: 88,
    followsCount: 41,
    postsCount: 3,
    profilePicUrl: img6,
    verified: false,
    private: false,
    posts: [
      post("mira-1", img6, "archive 09", "2026-08-03T21:51:00.000Z"),
      post("mira-2", img3, "пятница", "2026-07-22T16:42:00.000Z", "video"),
      post("mira-3", img4, "", "2026-07-06T09:15:00.000Z"),
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
  const navigate = useNavigate({ from: "/" });
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
    return (
      <PreviewAppPage
        title="Dropbox"
        eyebrow="архив"
        onBack={() => void navigate({ to: "/", search: { preview: "1" } })}
      >
        <DropboxBrowser settings={{ ...settings, dropboxToken: "" }} path="/Штора" onPath={() => undefined} onNeedToken={onNeedSettings} />
      </PreviewAppPage>
    );
  }

  if (app === "imagine") {
    return (
      <PreviewAppPage
        title="Imagine"
        eyebrow="studio"
        onBack={() => void navigate({ to: "/", search: { preview: "1" } })}
      >
        <ImagineStudio settings={{ ...settings, dropboxToken: "" }} onNeedToken={onNeedSettings} />
      </PreviewAppPage>
    );
  }

  if (view && profile) {
    const stories = storySet(profile);
    const hls = highlights(profile);
    return (
      <section className="-mx-4 sm:-mx-6">
        <ShtoraPageHeader
          eyebrow="Профиль"
          title={`@${profile.username}`}
          onBack={() => setView(null)}
          onSettings={onNeedSettings}
        />
        <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6 sm:pt-8">
        <div className="mt-4">
          <ProfileHeader
            profile={profile}
            storyCount={stories.length}
            unseenStories={0}
            folder={settings.accountFolders[profile.username] || `/Штора/${profile.username}`}
            saving={false}
            refreshing={false}
            onSave={() => undefined}
            onRefresh={() => {
          setRefreshing(true);
          window.setTimeout(() => setRefreshing(false), 650);
        }}
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
    <section className="-mx-4 sm:-mx-6">
      <ShtoraPageHeader eyebrow="Лента" title="Штора" onSettings={onNeedSettings} />
      <div className="mx-auto max-w-4xl px-4 pt-3 sm:px-6 sm:pt-4">
      <FavoritesStrip
        names={profiles.map((item) => item.username)}
        active=""
        tick={0}
        previewPictures={{ ellissawe: img1, minsiyaaa: img2, sheptnowa: img3, sofia: img4, lena: img5, mira: img6 }}
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

    </section>
  );
}


function PreviewAppPage({
  title,
  eyebrow,
  onBack,
  children,
}: {
  title: string;
  eyebrow: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex min-h-dvh flex-col overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label={title}>
      <header className="sticky top-0 z-10 border-b border-border/55 bg-bg/88 px-4 pt-[max(0.65rem,env(safe-area-inset-top))] pb-4 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full text-muted" onClick={onBack} aria-label="Назад">
            <span aria-hidden className="text-lg">←</span>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-subtle">{eyebrow}</p>
            <h1 className="font-display text-3xl leading-none tracking-tight text-fg">{title}</h1>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-12 pt-6 sm:px-6 sm:pt-8">{children}</main>
    </div>
  );
}
