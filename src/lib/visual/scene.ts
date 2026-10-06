import type { PhotoIntent, Scene, VisualContext } from "./types";

const WORLD_CHANGE_RE = /теперь|потом|друг(?:ое|ой)|переод|сменил|в кафе|в ресторан|в бар|на улице|на пляж|дома|в офис|на работе|уехал|пришла|ушла/i;

export function makeSceneId(username: string, at = Date.now()) {
  return username.toLowerCase() + "-" + at.toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

export function sceneChanged(text: string, prev: VisualContext | undefined, next: VisualContext | undefined) {
  if (prev && next) {
    const pairs: Array<[string | undefined, string | undefined]> = [
      [prev.place, next.place],
      [prev.clothes, next.clothes],
      [prev.activity, next.activity],
      [prev.timeContext, next.timeContext],
    ];
    for (const [before, after] of pairs) {
      if (before && after && before.trim().toLowerCase() !== after.trim().toLowerCase()) return true;
    }
  }
  return WORLD_CHANGE_RE.test(text);
}

export function resolveScene(input: {
  username: string;
  intent: PhotoIntent;
  previous?: Scene;
  current?: VisualContext;
  now?: number;
}): Scene {
  const now = input.now || Date.now();
  const prev = input.previous;
  const current = input.current || {};
  const explicitNew = input.intent.mode === "new_scene";
  const textChanges =
    input.intent.mode === "continue"
      ? (input.intent.changes || []).join(" ")
      : input.intent.mode === "pov"
        ? [input.intent.scene || "", input.intent.subject || ""].join(" ")
        : "";
  const newScene = explicitNew || sceneChanged(textChanges, prev, current);

  if (prev && !newScene && input.intent.mode !== "new_scene") {
    return { ...prev, ...current, id: prev.id };
  }

  return {
    ...current,
    id: makeSceneId(input.username, now),
    username: input.username.toLowerCase(),
    createdAt: now,
    parentSceneId: prev?.id,
  };
}

export function intentFromMessage(text: string, hasPreviousPhoto: boolean) {
  return deterministicIntent(text, hasPreviousPhoto);
}

function deterministicIntent(text: string, hasPreviousPhoto: boolean): PhotoIntent {
  const t = (text || "").trim().toLowerCase();
  if (!t) return { mode: "none" };
  return requireDeterministic(t, hasPreviousPhoto);
}

function requireDeterministic(text: string, hasPreviousPhoto: boolean): PhotoIntent {
  // Kept as a tiny indirection so future semantic resolution can sit here without changing callers.
  const raw = text;
  if (/из галере|вчерашн|та фот|как на той|то фото/.test(raw)) {
    return { mode: "gallery", query: raw, reference: "visual_memory" };
  }
  if (/от первого лица|\bpov\b/.test(raw)) {
    return { mode: "pov", camera: "pov", scene: raw.slice(0, 160), reference: hasPreviousPhoto ? "last_photo" : "world" };
  }
  if (/боком|сбоку|со спины|сзади|зеркал|во весь рост|полный рост|селфи/.test(raw)) {
    let camera: "selfie" | "mirror" | "side" | "back" | "full" = "selfie";
    if (/зеркал/.test(raw)) camera = "mirror";
    else if (/боком|сбоку/.test(raw)) camera = "side";
    else if (/со спины|сзади/.test(raw)) camera = "back";
    else if (/во весь рост|полный рост/.test(raw)) camera = "full";
    return { mode: "continue", camera, reference: "last_photo" };
  }
  return deterministicPhotoIntent(raw, hasPreviousPhoto);
}
