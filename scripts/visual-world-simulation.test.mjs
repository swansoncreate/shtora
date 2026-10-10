import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

await register(pathToFileURL(new URL("./src-alias-hook.mjs", import.meta.url).pathname));

const { deterministicPhotoIntent } = await import("../src/lib/visual/intent.ts");
const { resolveScene } = await import("../src/lib/visual/scene.ts");
const { resolveContinuationMemory } = await import("../src/lib/visual/source-reference.ts");

test("simulated Instagram chat photo flow keeps camera continuity", () => {
  let previousPhoto = false;
  let scene;
  let firstSceneId;
  const world = {
    place: "bathroom",
    clothes: "black shirt",
    activity: "getting ready",
    timeContext: "evening",
  };

  const messages = ["скинь селфи", "теперь боком", "а теперь со спины", "во весь рост"];
  const expected = ["selfie", "side", "back", "full"];

  for (let i = 0; i < messages.length; i += 1) {
    const intent = deterministicPhotoIntent(messages[i], previousPhoto);
    assert.equal(intent.mode, "continue");
    assert.equal(intent.camera, expected[i]);
    scene = resolveScene({
      username: "alice",
      intent,
      previous: scene,
      current: world,
      now: 1000 + i,
    });
    firstSceneId ??= scene.id;
    assert.equal(scene.id, firstSceneId);
    previousPhoto = true;
  }

  assert.ok(scene);
  assert.equal(scene.parentSceneId, undefined);
});

test("continuation keeps the source scene id even if visual memory is unavailable", () => {
  const intent = deterministicPhotoIntent("продолжи", true);
  assert.equal(intent.mode, "continue");
  assert.equal(intent.reference, "last_photo");
  const scene = resolveScene({
    username: "alice",
    intent,
    current: { place: "bathroom", clothes: "black shirt", sceneId: "source-scene-42" },
    now: 2500,
  });
  assert.equal(scene.id, "source-scene-42");
  assert.equal(scene.place, "bathroom");
  assert.equal(scene.clothes, "black shirt");
});

test("simulated new-scene flow creates a new scene without mutating the old one", () => {
  const oldWorld = { place: "bathroom", clothes: "black shirt", activity: "getting ready" };
  const oldIntent = deterministicPhotoIntent("скинь селфи", false);
  const oldScene = resolveScene({
    username: "alice",
    intent: oldIntent,
    current: oldWorld,
    now: 2000,
  });

  const newIntent = deterministicPhotoIntent("скинь фото теперь в кафе, переоденься в зелёное платье", true);
  assert.equal(newIntent.mode, "new_scene");

  const newWorld = { place: "cafe", clothes: "green dress", activity: "having coffee" };
  const newScene = resolveScene({
    username: "alice",
    intent: newIntent,
    previous: oldScene,
    current: newWorld,
    now: 3000,
  });

  assert.notEqual(newScene.id, oldScene.id);
  assert.equal(newScene.parentSceneId, oldScene.id);
  assert.equal(oldScene.place, "bathroom");
  assert.equal(newScene.place, "cafe");
  assert.equal(newScene.clothes, "green dress");
});

test("a feed scene between two DM photos does not replace the DM scene", () => {
  const dmWorld = {
    place: "bathroom",
    clothes: "black shirt",
    activity: "getting ready",
    timeContext: "evening",
  };
  const firstDmIntent = deterministicPhotoIntent("скинь селфи", false);
  const firstDmScene = resolveScene({
    username: "alice",
    intent: firstDmIntent,
    current: dmWorld,
    now: 4000,
  });

  const feedScene = resolveScene({
    username: "alice",
    intent: { mode: "new_scene", scene: "street outfit post", reference: "identity" },
    previous: firstDmScene,
    current: { place: "street", clothes: "blue coat", activity: "taking a walk" },
    now: 5000,
  });
  assert.notEqual(feedScene.id, firstDmScene.id);

  // The DM continuation must be resolved from its own source photo/world, not the feed's latest scene.
  const continuation = resolveScene({
    username: "alice",
    intent: deterministicPhotoIntent("теперь боком", true),
    previous: firstDmScene,
    current: { ...dmWorld, sceneId: firstDmScene.id },
    now: 6000,
  });
  assert.equal(continuation.id, firstDmScene.id);
  assert.equal(continuation.place, "bathroom");
  assert.equal(continuation.clothes, "black shirt");
  assert.notEqual(continuation.id, feedScene.id);
});

test("ordinary chat never creates a photo intent", () => {
  for (const text of ["как дела?", "что делаешь?", "ты где?", "расскажи что-нибудь"]) {
    assert.deepEqual(deterministicPhotoIntent(text, true), { mode: "none" });
  }
});

test("POV uses world/last-photo references instead of identity-only continuation", () => {
  const first = deterministicPhotoIntent("скинь от первого лица", false);
  assert.deepEqual(first, {
    mode: "pov",
    camera: "pov",
    scene: "скинь от первого лица",
    reference: "world",
  });

  const next = deterministicPhotoIntent("от первого лица", true);
  assert.equal(next.mode, "pov");
  assert.equal(next.reference, "last_photo");
});

test("semantic intent parser falls back safely on malformed provider output", async () => {
  const { parseSemanticPhotoIntent } = await import("../src/lib/visual/intent.ts");
  const fallback = deterministicPhotoIntent("теперь боком", true);
  assert.equal(parseSemanticPhotoIntent("not-json", fallback).camera, "side");
  assert.equal(parseSemanticPhotoIntent(JSON.stringify({ mode: "invalid" }), fallback).camera, "side");
});

test("cached chat-photo URL mismatch falls back to its scene, not the latest feed image", () => {
  const feedMemory = {
    id: "feed-1",
    username: "alice",
    imageUrl: "/chat-media/feed-image.webp",
    createdAt: 6000,
    scene: { place: "street", clothes: "blue coat", sceneId: "feed-scene" },
    camera: { mode: "candid" },
    source: "generated",
    sceneId: "feed-scene",
  };
  const dmMemory = {
    id: "dm-1",
    username: "alice",
    imageUrl: "/chat-media/persisted-dm-image.webp",
    createdAt: 5000,
    scene: { place: "bathroom", clothes: "black shirt", sceneId: "dm-scene" },
    camera: { mode: "selfie" },
    source: "generated",
    sceneId: "dm-scene",
  };

  // The chat bubble can point at a cache URL while visual memory stores the persisted URL.
  const selected = resolveContinuationMemory(
    [feedMemory, dmMemory],
    "/api/chat-media?id=local-cache-id",
    "dm-scene",
  );
  assert.equal(selected?.id, "dm-1");
  assert.equal(selected?.scene.place, "bathroom");
  assert.equal(selected?.scene.clothes, "black shirt");
});

test("continuation resolution prefers the exact source photo when URLs match", () => {
  const source = {
    id: "source",
    username: "alice",
    imageUrl: "/chat-media/source.webp",
    createdAt: 5000,
    scene: { place: "bathroom", clothes: "black shirt", sceneId: "dm-scene" },
    camera: { mode: "selfie" },
    source: "generated",
    sceneId: "dm-scene",
  };
  const other = {
    ...source,
    id: "other",
    imageUrl: "/chat-media/other.webp",
    createdAt: 6000,
  };
  assert.equal(resolveContinuationMemory([other, source], source.imageUrl, "dm-scene")?.id, "source");
});

test("continuation resolution never guesses from unrelated latest memory", () => {
  const unrelated = {
    id: "feed-1",
    username: "alice",
    imageUrl: "/chat-media/feed.webp",
    createdAt: 9000,
    scene: { place: "street", clothes: "blue coat", sceneId: "feed-scene" },
    camera: { mode: "candid" },
    source: "generated",
    sceneId: "feed-scene",
  };
  assert.equal(
    resolveContinuationMemory([unrelated], "/api/chat-media?id=missing", undefined),
    undefined,
  );
});
