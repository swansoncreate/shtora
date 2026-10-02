import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createJiti } from "jiti";

process.env.XAI_API_KEY = "test-key";

const jiti = createJiti(import.meta.url, { alias: { "@": join(process.cwd(), "src") } });
const jobs = await jiti.import("../src/lib/imagine/jobs.ts");

const source = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEA";

test("a feed edit rejection does not return the Dropbox source as a finished frame", async () => {
  const prev = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body || "{}")));
    return new Response(JSON.stringify({ error: "unprocessable" }), { status: 422 });
  };
  try {
    const out = await jobs.runStill({
      kind: "feed",
      source,
      prompt: "evening light Instagram feed post, 1:1 frame",
    });
    assert.equal(out.ok, false);
    assert.equal(out.url, undefined);
    assert.notEqual(out.url, source);
    assert.equal(bodies[0].aspect_ratio, "1:1");
    assert.match(bodies[0].prompt, /evening light/);
  } finally {
    globalThis.fetch = prev;
  }
});

test("a direct message edit stays 9:16 and the feed frame is square", async () => {
  const prev = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body || "{}")));
    return new Response(JSON.stringify({ error: "unprocessable" }), { status: 422 });
  };
  try {
    await jobs.runStill({ kind: "selfie", source, userText: "hello" });
    assert.equal(bodies[0].aspect_ratio, "9:16");
  } finally {
    globalThis.fetch = prev;
  }
  const feed = readFileSync(new URL("../src/components/home-feed.tsx", import.meta.url), "utf8");
  const viewer = readFileSync(new URL("../src/components/post-viewer.tsx", import.meta.url), "utf8");
  const daily = readFileSync(new URL("../src/lib/feed/daily.ts", import.meta.url), "utf8");
  assert.match(feed, /aspect-square/);
  assert.match(viewer, /aspect-square w-full max-w-md object-cover/);
  assert.match(daily, /1:1 frame/);
  assert.equal(daily.includes("4:5 frame"), false);
});
