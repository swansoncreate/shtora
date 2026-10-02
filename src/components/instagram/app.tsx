import { LoaderCircle, MessageCircle, RefreshCw, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FavoritesStrip } from "@/components/favorites-strip";
import { FeedComments } from "@/components/feed-comments";
import { HomeFeed } from "@/components/home-feed";
import { UnreadBadge } from "@/components/chats";
import { PostViewer } from "@/components/post-viewer";
import { ProfilePhotoViewer } from "@/components/profile-photo";
import { PullRefresh } from "@/components/pull-refresh";
import { SaveStatus } from "@/components/save-status";
import { StoryViewer } from "@/components/story-viewer";
import { DropboxViewer } from "@/components/dropbox-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bumpWarmth } from "@/lib/chat/store";
import { persistBackgroundPayload } from "@/lib/dropbox/background";
import { queueSaveAccount } from "@/lib/dropbox/engine";
import type { SaveKind } from "@/lib/dropbox/saved";
import { useSaveProgress } from "@/lib/dropbox/use-save-progress";
import { useFeed } from "@/lib/feed/use-feed";
import { feedEngine } from "@/lib/feed/engine";
import type { FeedCard } from "@/lib/feed/simulate";
import { collectContentIds, markAccountSeen, markStoriesViewed, unseenStoryCount, useUnseenTick } from "@/lib/instagram/unseen";
import { queueStoryWatchPing } from "@/lib/chat/pings";
import { useInstagramAccount } from "@/lib/instagram/use-account";
import { usePinnedWatch } from "@/lib/instagram/watch";
import type { IgHighlight, IgPost, IgStoryItem } from "@/lib/instagram/types";
import {
  folderForAccount,
  isFavorite,
  toggleFavorite,
  type ShtoraSettings,
} from "@/lib/shtora-settings";
import { cleanUsername } from "@/lib/utils";
import { HighlightsRail, PostsGrid, ProfileHeader, ProfileTabs, StoriesGrid } from "./profile";

export function InstagramApp({
  username,
  tab,
  settings,
  ready,
  hydrated,
  chatUnread,
  chatUnreadMap,
  onOpenUser,
  onOpenChats,
  onNeedToken,
}: {
  username: string;
  tab: "posts" | "stories" | "highlights";
  settings: ShtoraSettings;
  ready: boolean;
  hydrated: boolean;
  chatUnread: number;
  chatUnreadMap: Record<string, number>;
  onOpenUser: (name: string, tab?: "posts" | "stories") => void;
  onOpenChats: (name?: string | null) => void;
  onNeedToken: () => void;
}) {
  const tokens = { apify: settings.apifyToken, hiker: settings.hikerToken, tikhub: settings.tikhubToken };
  const unseenTick = useUnseenTick();
  const saveProgress = useSaveProgress();
  const [draft, setDraft] = useState(username);
  useEffect(() => {
    if (username) setDraft(username);
  }, [username]);

  usePinnedWatch(tokens.apify, ready && hydrated, settings.favorites, tokens.hiker, tokens.tikhub);
  useEffect(() => {
    if (!ready || !hydrated) return;
    void persistBackgroundPayload(settings);
  }, [ready, hydrated, settings.hikerToken, settings.apifyToken, settings.tikhubToken]);

  const account = useInstagramAccount(username, tokens, ready && hydrated);
  const feed = useFeed(
    {
      favorites: settings.favorites,
      accountFolders: settings.accountFolders,
      defaultFolder: settings.defaultFolder || "/Штора",
      dropboxToken: settings.dropboxToken,
    },
    ready && hydrated && !username,
  );

  const [postIndex, setPostIndex] = useState<number | null>(null);
  const [feedView, setFeedView] = useState<{ username: string; posts: IgPost[]; index: number } | null>(null);
  const [dbView, setDbView] = useState<{ path: string; name: string; video: boolean } | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState<{
    items: IgStoryItem[];
    title: string;
    subtitle?: string;
    startIndex?: number;
    kind: SaveKind;
    highlightTitle?: string;
    username: string;
  } | null>(null);
  const [commentCard, setCommentCard] = useState<FeedCard | null>(null);

  useEffect(() => {
    setPostIndex(null);
    setStoryOpen(null);
    setAvatarOpen(false);
  }, [username]);

  useEffect(() => {
    if (!username || !account.profile) return;
    markAccountSeen(username, account.profile, account.stories);
  }, [username, account.profile, account.stories]);

  const folder = username ? folderForAccount(username, settings) : "";
  const profileTab: "posts" | "stories" = tab === "stories" ? "stories" : "posts";

  function openHighlight(hl: IgHighlight) {
    const ready = (hl.items || []).filter((it) => !String(it.id).endsWith("-cover"));
    const first =
      ready.length > 0
        ? ready
        : hl.coverImageUrl
          ? [{ id: hl.id, mediaType: "image" as const, imageUrl: hl.coverImageUrl }]
          : [];
    const name = account.profile?.username ?? username;
    if (!first.length) {
      toast.message("Открываю хайлайт…");
    } else {
      setStoryOpen({
        items: first,
        title: hl.title || "Хайлайт",
        subtitle: name,
        kind: "highlight",
        highlightTitle: hl.title,
        username: name,
      });
    }
    void account.expandHighlight(hl).then((items) => {
      if (!items.length) return;
      setStoryOpen((cur) =>
        cur && cur.kind === "highlight" && cur.highlightTitle === hl.title ? { ...cur, items } : cur,
      );
    });
  }

  const dbFeedItems = feed.cards.filter((card) => card.dropbox).map((card) => card.dropbox!);
  const dbViewIndex = dbView ? dbFeedItems.findIndex((item) => item.path === dbView.path) : -1;

  function onSearch(e: FormEvent) {
    e.preventDefault();
    onOpenUser(cleanUsername(draft) || draft);
  }

  async function refreshAccount() {
    if (!username || account.refreshing) return;
    const before = new Set(collectContentIds(account.profile, account.stories));
    try {
      const result = await account.refresh();
      const after = collectContentIds(result.profile, result.stories);
      const added = result.added || after.filter((id) => !before.has(id)).length;
      const live = result.stories?.stories.length ?? 0;
      const posts = result.profile?.posts.length ?? 0;
      toast.success(
        added
          ? `Подгрузили новое: ${added}`
          : `Готово · ${posts} постов${live ? `, сторис ${live}` : ", сторис нет"}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось обновить");
    }
  }

  async function saveCurrent() {
    if (!username) return;
    if (!settings.dropboxToken.trim() && !settings.dropboxRefreshToken.trim()) {
      toast.error("Добавьте токен Dropbox в настройках");
      onNeedToken();
      return;
    }
    try {
      const result = await queueSaveAccount({
        username,
        settings,
        includeStories: true,
        mode: "manual",
      });
      if (result.saved === 0 && result.failed === 0) toast.success("Всё уже сохранено");
      else if (result.failed) toast.error(`Сохранено ${result.saved}, ошибок ${result.failed}`);
      else toast.success(`В Dropbox: ${result.saved} файлов`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
    }
  }

  function onLike(card: FeedCard) {
    const on = feed.like(card.id);
    if (on) {
      void bumpWarmth(card.username, 1);
      void import("@/lib/chat/life").then((m) => m.noteLike(card.username));
      void import("@/lib/chat/send").then((m) =>
        m.noticeFeedLike({
          username: card.username,
          imageUrl: card.thumb || card.post?.displayUrl,
          caption: card.caption,
        }),
      );
    }
  }

  return (
    <>
      <form action="/" method="get" onSubmit={onSearch} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            name="u"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="поиск по нику"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Ник Instagram"
          />
        </div>
        <Button type="submit" variant="subtle" size="icon" className="size-12 shrink-0 rounded-lg" aria-label="Искать">
          <Search className="size-5" />
        </Button>
        <Button
          type="button"
          variant="subtle"
          size="icon"
          className="relative size-12 shrink-0 rounded-lg"
          aria-label="Сообщения"
          onClick={() => onOpenChats(null)}
        >
          <MessageCircle className="size-5" />
          <UnreadBadge count={chatUnread} className="absolute -top-1 -right-1" />
        </Button>
        {!username ? (
          <Button
            type="button"
            variant="subtle"
            size="icon"
            className="size-12 shrink-0 rounded-lg"
            aria-label="Обновить ленту"
            disabled={feed.busy}
            onClick={() => {
              void feed.regenerate().then((n) =>
                toast.success(n ? "Новые посты в ленте" : "Новых пока нет — старые на месте"),
              );
            }}
          >
            <RefreshCw className={feed.busy ? "size-5 animate-spin" : "size-5"} />
          </Button>
        ) : null}
      </form>

      <FavoritesStrip
        names={settings.favorites}
        active={username}
        tick={unseenTick}
        onPick={(name) => onOpenUser(name)}
        onOpenStory={
          username
            ? undefined
            : (name, items) =>
                setStoryOpen({
                  items,
                  title: name,
                  subtitle: "Сторис",
                  kind: "story",
                  username: name,
                })
        }
      />
      <SaveStatus />

      {!username ? (
        <PullRefresh
          busy={feed.busy}
          onRefresh={async () => {
            await feed.regenerate().then((n) =>
              toast.success(n ? "Новые посты в ленте" : "Новых пока нет — старые на месте"),
            );
          }}
        >
          <HomeFeed
            items={feed.cards}
            onOpenPost={(name, posts, index) => setFeedView({ username: name, posts, index })}
            onOpenDropbox={(card) => {
              if (card.dropbox) setDbView(card.dropbox);
            }}
            onOpenProfile={(name) => onOpenUser(name)}
            onLike={onLike}
            onComments={(card) => setCommentCard(card)}
          />
        </PullRefresh>
      ) : null}

      {username ? (
        <section className="mt-6">
          {account.loadingProfile && !account.profile ? (
            <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 text-muted">
              <LoaderCircle className="size-8 animate-spin" />
              <p className="text-sm">Открываем @{username}</p>
            </div>
          ) : null}
          {account.profileError && !account.profile ? (
            <div className="mt-8 rounded-xl bg-surface px-5 py-8 text-center shadow-[var(--shadow-border)]">
              <p className="font-display text-2xl font-medium">Не вышло</p>
              <p className="mt-2 text-sm text-muted">
                {account.profileError instanceof Error ? account.profileError.message : "Профиль не загрузился."}
              </p>
              <Button className="mt-5" type="button" onClick={() => void refreshAccount()}>
                Повторить
              </Button>
            </div>
          ) : null}
          {account.profile ? (
            <>
              <ProfileHeader
                profile={account.profile}
                storyCount={account.live.length}
                unseenStories={unseenStoryCount(account.profile.username || username, account.live)}
                folder={folder}
                saving={saveProgress.status === "running"}
                refreshing={account.refreshing}
                onRefresh={() => void refreshAccount()}
                onSave={() => void saveCurrent()}
                onOpenPhoto={() => setAvatarOpen(true)}
                onOpenStories={() => {
                  const name = account.profile?.username ?? username;
                  setStoryOpen({
                    items: account.live,
                    title: name,
                    subtitle: "Сторис",
                    kind: "story",
                    username: name,
                  });
                }}
                onMessage={() => onOpenChats(account.profile!.username)}
                favorite={isFavorite(account.profile.username, settings)}
                chatUnread={chatUnreadMap[account.profile.username.toLowerCase()] ?? 0}
                onToggleFavorite={() => {
                  const result = toggleFavorite(account.profile!.username);
                  if (!result.ok) toast.error(result.error);
                  else toast.success(result.added ? "В избранном" : "Убран из избранного");
                }}
                warning={
                  !settings.apifyToken.startsWith("apify_api_")
                    ? "Нет токена Apify. Вставь ключ в настройки и нажми Обновить."
                    : undefined
                }
              />
              <HighlightsRail
                highlights={account.highlights}
                onOpen={(hl) => openHighlight(hl)}
              />
              <ProfileTabs
                tab={profileTab}
                storyCount={account.live.length}
                onTab={(next) => onOpenUser(username, next)}
              />
              {profileTab === "posts" ? (
                <PostsGrid
                  posts={account.profile.posts}
                  username={username}
                  onOpen={setPostIndex}
                  onNeedToken={onNeedToken}
                />
              ) : (
                <StoriesGrid
                  stories={account.live}
                  username={username}
                  onOpen={(startIndex) =>
                    setStoryOpen({
                      items: account.live,
                      title: account.profile!.username,
                      subtitle: "Сторис",
                      startIndex,
                      kind: "story",
                      username: account.profile!.username,
                    })
                  }
                  onNeedToken={onNeedToken}
                />
              )}
            </>
          ) : account.highlights.length ? (
            <HighlightsRail highlights={account.highlights} onOpen={(hl) => openHighlight(hl)} />
          ) : null}
        </section>
      ) : null}

      {avatarOpen && account.profile?.profilePicUrl ? (
        <ProfilePhotoViewer
          url={account.profile.profilePicUrl}
          username={username}
          onClose={() => setAvatarOpen(false)}
          onNeedToken={onNeedToken}
        />
      ) : null}
      {postIndex != null && account.profile ? (
        <PostViewer
          posts={account.profile.posts}
          index={postIndex}
          username={username}
          onClose={() => setPostIndex(null)}
          onIndex={setPostIndex}
          onNeedToken={onNeedToken}
        />
      ) : null}
      {feedView ? (
        <PostViewer
          posts={feedView.posts}
          index={feedView.index}
          username={feedView.username}
          onClose={() => setFeedView(null)}
          onIndex={(index) => setFeedView({ ...feedView, index })}
          onNeedToken={onNeedToken}
        />
      ) : null}
      {dbView && settings.dropboxToken ? (
        <DropboxViewer
          token={settings.dropboxToken}
          item={dbView}
          hasPrev={dbViewIndex > 0}
          hasNext={dbViewIndex >= 0 && dbViewIndex < dbFeedItems.length - 1}
          onPrev={() => {
            const prev = dbFeedItems[dbViewIndex - 1];
            if (prev) setDbView(prev);
          }}
          onNext={() => {
            const next = dbFeedItems[dbViewIndex + 1];
            if (next) setDbView(next);
          }}
          onClose={() => setDbView(null)}
          onNeedToken={onNeedToken}
          onSaved={() => void feedEngine.pullDropbox()}
          onChanged={() => {
            setDbView(null);
            void feedEngine.pullDropbox();
          }}
          chatUsername={feed.cards.find((card) => card.dropbox?.path === dbView.path)?.username}
        />
      ) : null}
      {storyOpen ? (
        <StoryViewer
          items={storyOpen.items}
          title={storyOpen.title}
          subtitle={storyOpen.subtitle}
          startIndex={storyOpen.startIndex}
          username={storyOpen.username}
          kind={storyOpen.kind}
          highlightTitle={storyOpen.highlightTitle}
          onClose={() => {
            if (storyOpen.kind === "story") {
              markStoriesViewed(
                storyOpen.username,
                storyOpen.items.map((it) => it.id).filter(Boolean),
              );
              queueStoryWatchPing(storyOpen.username);
            }
            setStoryOpen(null);
          }}
          onNeedToken={onNeedToken}
        />
      ) : null}
      {commentCard ? <FeedComments card={commentCard} onClose={() => setCommentCard(null)} /> : null}
    </>
  );
}
