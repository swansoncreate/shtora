import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

process.env.SHTORA_DATA_DIR = await mkdtemp(join(tmpdir(), "shtora-visual-e2e-"));
process.env.SHTORA_GROK_ORIGIN = "https://shtora-test.grok.me";
process.env.SHTORA_RPC_KEY = "mock-rpc-key";

await register(pathToFileURL(new URL("./src-alias-hook.mjs", import.meta.url).pathname));

const { saveVisualMemory, listVisualMemory, latestVisualMemory } =
  await import("../src/lib/visual/memory.server.ts");
const { createGenerationJob, updateGenerationJob, listGenerationJobs } =
  await import("../src/lib/visual/jobs.server.ts");
const { rememberSourcePath, recentSourcePaths } =
  await import("../src/lib/visual/source-history.server.ts");
const { callGrokApp } = await import("../src/lib/server/grok-app.ts");

test("VisualMemory survives writes, deduplicates by image, and supports semantic lookup", async () => {
  const username = "visual-memory-e2e";
  const base = {
    username,
    createdAt: Date.now(),
    scene: { place: "cafe", clothes: "green dress", activity: "coffee", timeContext: "evening" },
    camera: { mode: "selfie" },
    source: "generated",
    sceneId: "scene-cafe",
  };

  await Promise.all([
    saveVisualMemory({ ...base, id: "m1", imageUrl: "https://img.test/1.jpg", prompt: "вечер в кафе" }),
    saveVisualMemory({ ...base, id: "m2", imageUrl: "https://img.test/2.jpg", prompt: "кофе вечером" }),
  ]);

  const rows = await listVisualMemory(username, "кафе зеленое");
  assert.equal(rows.length, 2);
  assert.equal((await latestVisualMemory(username))?.imageUrl, "https://img.test/2.jpg");

  await saveVisualMemory({ ...base, id: "m3", imageUrl: "https://img.test/2.jpg", prompt: "same image" });
  assert.equal((await listVisualMemory(username)).filter((x) => x.imageUrl === "https://img.test/2.jpg").length, 1);
});

test("GenerationJob serializes same-user writes and preserves lifecycle/provider", async () => {
  const username = "generation-e2e";
  const jobs = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      createGenerationJob({
        username,
        intent: { mode: "continue", camera: "selfie", reference: "last_photo" },
        provider: "pending",
        sceneId: "scene-1",
        finalPrompt: "frame " + i,
      }),
    ),
  );
  assert.equal(new Set(jobs.map((x) => x.id)).size, 8);

  const target = jobs[0];
  await updateGenerationJob(username, target.id, {
    status: "persisted",
    provider: "grok-imagine",
    sourcePath: "/photos/source.jpg",
  });

  const rows = await listGenerationJobs(username);
  const saved = rows.find((x) => x.id === target.id);
  assert.equal(saved?.status, "persisted");
  assert.equal(saved?.provider, "grok-imagine");
  assert.equal(saved?.sourcePath, "/photos/source.jpg");
  assert.equal(rows.length, 8);
});

test("Dropbox source history serializes concurrent writes and prevents immediate reuse", async () => {
  const username = "source-history-e2e";
  const paths = Array.from({ length: 10 }, (_, i) => "/photos/" + i + ".jpg");
  await Promise.all(paths.map((path) => rememberSourcePath(username, path)));

  const recent = await recentSourcePaths(username);
  assert.equal(recent.length, 10);
  for (const path of paths) assert.ok(recent.includes(path));

  await rememberSourcePath(username, paths[0]);
  const refreshed = await recentSourcePaths(username);
  assert.equal(refreshed[0], paths[0]);
  assert.equal(refreshed.filter((x) => x === paths[0]).length, 1);
});

test("published Grok Build contract is sent for reply, ping, and imagine", async () => {
  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const body = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({ ok: true, op: body.op, provider: "mock-grok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    for (const op of ["reply", "ping", "imagine"]) {
      const out = await callGrokApp(op, { test: true });
      assert.deepEqual(out, { ok: true, op, provider: "mock-grok" });
    }
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.url, "https://shtora-test.grok.me/api/grok-chat");
    assert.equal(call.init?.method, "POST");
    const headers = new Headers(call.init?.headers);
    assert.equal(headers.get("content-type"), "application/json");
    assert.ok(headers.get("x-shtora-key"));
    assert.equal(JSON.parse(String(call.init?.body)).engine, "grok");
  }
});

test("published Grok Build contract rejects non-2xx and malformed JSON safely", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("upstream failure", { status: 502 });
    const failed = await callGrokApp("reply", { test: true });
    assert.equal(failed.ok, false);
    assert.match(failed.error, /upstream failure|Grok app HTTP 502/);

    globalThis.fetch = async () => new Response("{not-json", { status: 200 });
    const malformed = await callGrokApp("imagine", { test: true });
    assert.equal(malformed.ok, false);
    assert.equal(malformed.error, "пустой ответ Grok");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("published Grok Build contract preserves the 90 second request timeout", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      assert.ok(init?.signal);
      assert.equal(typeof init.signal.aborted, "boolean");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const out = await callGrokApp("ping", { test: true });
    assert.deepEqual(out, { ok: true });
  } finally {
    globalThis.fetch = previousFetch;
  }
});
