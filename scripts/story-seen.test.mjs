import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createJiti } from "jiti";

const dataDir = mkdtempSync(join(tmpdir(), "shtora-seen-"));
process.env.SHTORA_DATA_DIR = dataDir;
process.env.SHTORA_SELF = "1";
process.env.SHTORA_RPC_KEY = "seen-test-key";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": join(process.cwd(), "src"),
    "@tanstack/react-router": join(process.cwd(), "scripts/router-stub.mjs"),
  },
});

const seen = await jiti.import("../src/lib/instagram/seen.server.ts");
const rpc = await jiti.import("../src/routes/api/rpc.ts");
const post = rpc.Route.server.handlers.POST;

function rpcRequest(body, key = process.env.SHTORA_RPC_KEY) {
  return new Request("https://vps.test/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-shtora-key": key } : {}) },
    body: JSON.stringify(body),
  });
}

test("story views append in story-seen.json, not the thread or config", async () => {
  const first = await seen.recordStorySeen("inna", ["s:story-1", "story-1"]);
  assert.deepEqual(first.added, ["story-1"]);
  const again = await seen.recordStorySeen("inna", ["story-1"]);
  assert.deepEqual(again.added, []);
  const file = join(dataDir, "story-seen.json");
  const rows = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(rows.filter((row) => row.id === "story-1").length, 1);
  assert.equal(existsSync(join(dataDir, "chats")), false);
  assert.equal(existsSync(join(dataDir, "shtora-config.json")), false);
  assert.equal(readdirSync(dataDir).some((name) => name.endsWith(".tmp")), false);
});

test("the tail stays 240 and two writers do not drop a row", async () => {
  const many = Array.from({ length: 250 }, (_, i) => `id-${i}`);
  await seen.recordStorySeen("long", many.slice(0, 40));
  await seen.recordStorySeen("long", many.slice(40, 80));
  await seen.recordStorySeen("long", many.slice(80, 120));
  await seen.recordStorySeen("long", many.slice(120, 160));
  await seen.recordStorySeen("long", many.slice(160, 200));
  await seen.recordStorySeen("long", many.slice(200, 240));
  await seen.recordStorySeen("long", many.slice(240));
  const listed = await seen.listStorySeen("long");
  assert.equal(listed.rows.length, 240);
  assert.equal(listed.rows.some((row) => row.id === "id-0"), false);
  assert.equal(listed.rows.at(-1).id, "id-249");

  await Promise.all([
    seen.recordStorySeen("a", ["a-1"]),
    seen.recordStorySeen("b", ["b-1"]),
  ]);
  const all = await seen.listStorySeen();
  assert.equal(all.rows.some((row) => row.id === "a-1"), true);
  assert.equal(all.rows.some((row) => row.id === "b-1"), true);
});

test("empty ids are 400, a foreign nick adds nothing, and a missing key is 401", async () => {
  await seen.recordStorySeen("keep", ["keep-1"]);
  const before = readFileSync(join(dataDir, "story-seen.json"), "utf8");
  await assert.rejects(seen.recordStorySeen("inna", []), /empty ids/);
  const empty = await post({ request: rpcRequest({ name: "story.seen", data: { username: "inna", ids: [] } }) });
  assert.equal(empty.status, 400);
  assert.equal(readFileSync(join(dataDir, "story-seen.json"), "utf8"), before);

  const foreign = await post({ request: rpcRequest({ name: "story.seen", data: { username: "bad nick", ids: ["x"] } }) });
  assert.equal(foreign.status, 200);
  const body = await foreign.json();
  assert.deepEqual(body.added, []);

  const denied = await post({ request: rpcRequest({ name: "story.seen", data: { username: "inna", ids: ["secret"] } }, "") });
  assert.equal(denied.status, 401);
  const after = JSON.parse(readFileSync(join(dataDir, "story-seen.json"), "utf8"));
  assert.equal(after.some((row) => row.id === "secret"), false);
});

test("markStoriesViewed sends only new ids and a failed pull leaves the local ring", () => {
  const text = readFileSync(new URL("../src/lib/instagram/unseen.ts", import.meta.url), "utf8");
  assert.match(text, /const fresh = nextIds.filter\(\(id\) => !keep.includes\(id\)\)/);
  assert.match(text, /if \(fresh.length\) pushStorySeen\(clean, fresh\)/);
  assert.match(text, /story\.seenList/);
  assert.match(text, /hydrateStorySeen\(\)/);
  assert.match(text, /pullStorySeen\(\)\.catch/);
  const rpc = readFileSync(new URL("../src/routes/api/rpc.ts", import.meta.url), "utf8");
  assert.match(rpc, /case "story\.seen"/);
  assert.match(rpc, /case "story\.seenList"/);
  assert.equal(existsSync(new URL("../src/lib/server/tick.server.ts", import.meta.url)), true);
});
