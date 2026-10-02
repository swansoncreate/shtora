import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { richerStories, subscribeCache } from "./cache";
import { fetchHighlight } from "./functions";
import { loadAccount } from "./load";
import { dedupeHighlights } from "./normalize";
import { igCache } from "./store";
import type { IgHighlight, IgProfile, IgStories } from "./types";

function cacheStamp(username: string) {
  if (!username) return "";
  const p = igCache.profile(username);
  const s = igCache.stories(username);
  return `${p?.at ?? 0}:${s?.at ?? 0}:${s?.data.highlights.length ?? 0}:${s?.data.stories.length ?? 0}`;
}

function applySnap(username: string, profile?: IgProfile | null, stories?: IgStories | null, at = Date.now()) {
  if (profile) {
    igCache.writeProfile(username, igCache.reconcileProfile(igCache.profile(username)?.data ?? null, profile), at);
  }
  if (stories) {
    igCache.writeStories(username, igCache.reconcileStories(igCache.stories(username)?.data ?? null, stories), at);
  }
}

export function useInstagramAccount(
  username: string,
  tokens: { apify: string; hiker: string; tikhub: string },
  enabled: boolean,
) {
  useSyncExternalStore(subscribeCache, () => cacheStamp(username), () => "");
  const cachedProfile = username ? igCache.profile(username)?.data : null;
  const cachedStories = username ? igCache.stories(username)?.data : null;
  const queryClient = useQueryClient();
  const queryKey = ["ig-account", username, tokens.apify, tokens.hiker, tokens.tikhub];
  const canFetch = enabled && Boolean(username && (tokens.apify || tokens.hiker || tokens.tikhub));
  const [manualBusy, setManualBusy] = useState(false);
  const inflight = useRef<Promise<Awaited<ReturnType<typeof loadAccount>>> | null>(null);
  const [snap, setSnap] = useState<{ profile: IgProfile | null; stories: IgStories | null } | null>(null);
  const [seeded, setSeeded] = useState(() => Boolean(cachedStories?.highlights.length || cachedProfile));

  useEffect(() => {
    if (!username) {
      setSnap(null);
      return;
    }
    let cancelled = false;
    const had = Boolean(igCache.profile(username) || igCache.stories(username)?.data);
    setSeeded(had);
    const cachedAt = igCache.stories(username)?.at ?? 0;
    if (had && cachedAt && Date.now() - cachedAt < 2 * 60 * 1000) return;
    void (async () => {
      try {
        const { fetchSnapshot } = await import("./functions");
        const row = await fetchSnapshot({ data: { username } });
        if (cancelled || !row) return;
        setSnap({ profile: row.profile, stories: row.stories });
        applySnap(username, row.profile, row.stories, row.at);
      } catch {
        /* keep cache */
      } finally {
        if (!cancelled) setSeeded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  const hasRails = Boolean(
    cachedStories?.highlights.length ||
      snap?.stories?.highlights.length ||
      igCache.liveStories(cachedStories?.stories).length ||
      igCache.liveStories(snap?.stories?.stories).length,
  );
  const hasCache = Boolean(cachedProfile || snap?.profile || hasRails);

  const query = useQuery({
    queryKey,
    queryFn: () => loadAccount(username, tokens.apify, false, tokens.hiker, tokens.tikhub),
    enabled: canFetch && seeded && !hasCache,
    initialData:
      cachedProfile || cachedStories
        ? { profile: cachedProfile ?? null, stories: cachedStories ?? null, added: 0, fromCache: true }
        : undefined,
    placeholderData: (prev) => prev,
    staleTime: 20 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const profile = query.data?.profile ?? cachedProfile ?? snap?.profile ?? null;
  const storiesRaw =
    richerStories(
      richerStories(query.data?.stories, cachedStories) ?? query.data?.stories ?? cachedStories,
      snap?.stories,
    ) ??
    query.data?.stories ??
    cachedStories ??
    snap?.stories ??
    null;
  const live = igCache.liveStories(storiesRaw?.stories);
  const highlights = useMemo(
    () => dedupeHighlights(storiesRaw?.highlights ?? []),
    [storiesRaw?.highlights],
  );

  return {
    profile,
    stories: storiesRaw ? { ...storiesRaw, stories: live } : storiesRaw,
    live,
    highlights,
    loadingProfile: !profile && (query.isFetching || manualBusy || !seeded),
    loadingStories: !storiesRaw && (query.isFetching || manualBusy || !seeded),
    refreshing: manualBusy,
    profileError: query.error,
    storiesError: query.error,
    added: query.data?.added ?? 0,
    fromCache: query.data?.fromCache ?? Boolean(profile),
    refresh: async () => {
      if (inflight.current) return inflight.current;
      if (!tokens.apify.startsWith("apify_api_")) {
        throw new Error("Вставь токен Apify в настройки.");
      }
      setManualBusy(true);
      const run = (async () => {
        const bg = await import("@/lib/dropbox/background");
        if (tokens.tikhub.length > 8) await bg.persistTikhubToken(tokens.tikhub).catch(() => undefined);
        if (tokens.hiker.length > 8) await bg.persistHikerToken(tokens.hiker).catch(() => undefined);
        const result = await loadAccount(username, tokens.apify, true, tokens.hiker, tokens.tikhub);
        const stories = richerStories(result.stories, igCache.stories(username)?.data) ?? result.stories;
        const next = { ...result, stories: stories ?? result.stories };
        queryClient.setQueryData(queryKey, next);
        if (next.fromCache && !next.stories?.highlights.length && !igCache.liveStories(next.stories?.stories).length) {
          throw new Error(result.error || "Не удалось обновить. Проверь токен Apify.");
        }
        return next;
      })();
      inflight.current = run;
      try {
        return await run;
      } finally {
        inflight.current = null;
        setManualBusy(false);
      }
    },
    expandHighlight: async (hl: IgHighlight) => {
      try {
        const full = await fetchHighlight({
          data: {
            id: hl.id,
            username,
            hikerToken: tokens.hiker,
            tikhubToken: tokens.tikhub,
            token: tokens.apify,
          },
        });
        const items = (full.items || []).filter((it) => !String(it.id).endsWith("-cover"));
        if (items.length) {
          const prev = igCache.stories(username)?.data;
          if (prev) {
            igCache.writeStories(username, {
              ...prev,
              highlights: prev.highlights.map((item) =>
                item.id === hl.id || item.id === full.id
                  ? { ...item, ...full, items, coverImageUrl: full.coverImageUrl || item.coverImageUrl }
                  : item,
              ),
            });
          }
          return items;
        }
      } catch {
        /* cached */
      }
      const hasItems =
        hl.items.length > 1 || (hl.items.length === 1 && !String(hl.items[0]?.id).endsWith("-cover"));
      if (hasItems) return hl.items;
      return hl.items.filter((it) => !String(it.id).endsWith("-cover"));
    },
  };
}
