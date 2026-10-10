import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

process.env.SHTORA_DATA_DIR = await mkdtemp(join(tmpdir(), "shtora-error-recovery-"));
process.env.SHTORA_GROK_ORIGIN = "https://shtora-errors.grok.me";
process.env.SHTORA_RPC_KEY = "mock-rpc-key";

await register(pathToFileURL(new URL("./src-alias-hook.mjs", import.meta.url).pathname));

const { callGrokApp, writeGrokOrigin } = await import("../src/lib/server/grok-app.ts");
const { commitWorld, getWorld } = await import("../src/lib/world/disk.server.ts");

test("Grok gateway returns bounded provider errors for non-2xx responses", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("x".repeat(1000), {
      status: 502,
      headers: { "content-type": "text/plain" },
    });

  try {
    const out = await callGrokApp("reply", { retry: true });
    assert.equal(out.ok, false);
    assert.equal(out.error?.length, 220);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Grok gateway converts malformed JSON and transport failures into safe errors", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response("{not-json", { status: 200 });
    throw new Error("socket closed");
  };

  try {
    const malformed = await callGrokApp("ping", {});
    assert.equal(malformed.ok, false);
    assert.match(String(malformed.error), /JSON|Unexpected/i);

    const transport = await callGrokApp("imagine", {});
    assert.equal(transport.ok, false);
    assert.equal(transport.error, "socket closed");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Grok origin validation rejects unsafe hosts and accepts the published Build host", async () => {
  assert.equal(await writeGrokOrigin("http://evil.example"), false);
  assert.equal(await writeGrokOrigin("https://example.com"), false);
  assert.equal(await writeGrokOrigin("https://safe-build.grok.me/"), true);
  assert.equal(await writeGrokOrigin("https://safe-build.grok.me/"), true);
});

test("world state survives a write/read cycle with scene continuity metadata", async () => {
  const username = "world-restart-e2e";
  const at = Date.now();

  await commitWorld(username, {
    place: { value: "кафе", at },
    activity: { value: "кофе", at },
    clothes: { value: "пальто", at },
    sceneId: { value: "scene-42", at },
  });

  const first = await getWorld(username);
  assert.equal(first.snap?.place?.value, "кафе");
  assert.equal(first.snap?.activity?.value, "кофе");
  assert.equal(first.snap?.clothes?.value, "пальто");
  assert.equal(first.snap?.sceneId?.value, "scene-42");

  const raw = JSON.parse(
    await readFile(join(process.env.SHTORA_DATA_DIR, "world", username + ".json"), "utf8"),
  );
  assert.equal(raw.sceneId.value, "scene-42");
  assert.equal(raw.activity.value, "кофе");

  const second = await getWorld(username);
  assert.deepEqual(second.snap, first.snap);
});

test("concurrent world commits preserve all compatible scene fields", async () => {
  const username = "world-concurrency-e2e";
  const at = Date.now();

  await Promise.all([
    commitWorld(username, { place: { value: "дом", at } }),
    commitWorld(username, { activity: { value: "ужин", at } }),
    commitWorld(username, { clothes: { value: "свитер", at } }),
    commitWorld(username, { sceneId: { value: "scene-concurrent", at } }),
  ]);

  const out = await getWorld(username);
  assert.equal(out.snap?.place?.value, "дом");
  assert.equal(out.snap?.activity?.value, "ужин");
  assert.equal(out.snap?.clothes?.value, "свитер");
  assert.equal(out.snap?.sceneId?.value, "scene-concurrent");
});
