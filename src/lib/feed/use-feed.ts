import { useEffect, useState } from "react";
import { subscribeComments } from "./comments";
import { feedEngine, type FeedHydrateInput } from "./engine";
import type { FeedCard } from "./simulate";

export function useFeed(input: FeedHydrateInput, enabled: boolean) {
  const [cards, setCards] = useState<FeedCard[]>(() => feedEngine.snapshot());
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      feedEngine.subscribe(() => {
        setCards(feedEngine.snapshot());
        setBusy(feedEngine.busy());
      }),
    [],
  );
  useEffect(() => subscribeComments(() => setCards(feedEngine.snapshot())), []);

  useEffect(() => {
    if (!enabled) return;
    feedEngine.configure(input);
  }, [enabled, input.favorites.join("|"), input.defaultFolder, input.dropboxToken, JSON.stringify(input.accountFolders)]);

  useEffect(() => {
    if (!enabled) return;
    void feedEngine.fill();
    const boot = window.setTimeout(() => void feedEngine.fill(), 800);
    const timer = window.setInterval(() => feedEngine.refresh(), 20_000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
    };
  }, [enabled, input.favorites.join("|"), input.dropboxToken, input.defaultFolder]);

  return {
    cards,
    busy,
    like: (id: string) => feedEngine.like(id),
    regenerate: () => feedEngine.regenerate(),
  };
}
