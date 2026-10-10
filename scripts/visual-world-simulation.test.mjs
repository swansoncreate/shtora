import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

await register(pathToFileURL(new URL("./src-alias-hook.mjs", import.meta.url).pathname));

const { deterministicPhotoIntent } = await import("../src/lib/visual/intent.ts");
const { resolveScene } = await import("../src/lib/visual/scene.ts");

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
