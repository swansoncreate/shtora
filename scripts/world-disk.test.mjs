import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createJiti } from "jiti";

const dataDir = mkdtempSync(join(tmpdir(), "shtora-world-"));
process.env.SHTORA_DATA_DIR = dataDir;
process.env.SHTORA_SELF = "1";
process.env.SHTORA_RPC_KEY = "world-test-key";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": join(process.cwd(), "src"),
    "@tanstack/react-router": join(process.cwd(), "scripts/router-stub.mjs"),
  },
});

const disk = await jiti.import("../src/lib/world/disk.server.ts");
const rpc = await jiti.import("../src/routes/api/rpc.ts");
const post = rpc.Route.server.handlers.POST;

function rpcRequest(body, key = process.env.SHTORA_RPC_KEY) {
  return new Request("https://vps.test/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-shtora-key": key } : {}) },
    body: JSON.stringify(body),
  });
}

test("world.get migrates an old thread once and does not write the chat", async () => {
  mkdirSync(join(dataDir, "chats"), { recursive: true });
  writeFileSync(
    join(dataDir, "chats", "inna.json"),
    JSON.stringify({ username: "inna", updatedAt: Date.now(), mood: "tired", world: { placeRu: "дом", clothesRu: "платье" }, messages: [] }),
  );
  const first = await disk.getWorld("inna");
  assert.equal(first.snap.place.value, "дом");
  assert.equal(first.events.length, 1);
  const again = await disk.getWorld("inna");
  assert.equal(again.events.length, 1);
  assert.equal(existsSync(join(dataDir, "world", "inna.json")), true);
  assert.equal(existsSync(join(dataDir, "shtora-config.json")), false);
  const thread = JSON.parse(readFileSync(join(dataDir, "chats", "inna.json"), "utf8"));
  assert.equal(thread.messages.length, 0);
  assert.equal(readdirSync(join(dataDir, "world")).some((name) => name.endsWith(".tmp")), false);
});

test("an empty patch keeps place, clothes stay past six hours, and mood expires in three", async () => {
  const old = Date.now() - 7 * 60 * 60 * 1000;
  await disk.commitWorld("mira", {
    place: { value: "дом", at: Date.now() },
    clothes: { value: "платье", at: old },
    mood: { value: "tired", at: old },
  });
  await disk.commitWorld("mira", { activity: { value: "", at: Date.now() } });
  const got = await disk.getWorld("mira");
  assert.equal(got.snap.place.value, "дом");
  assert.equal(got.snap.clothes.value, "платье");
  assert.equal(got.snap.mood, undefined);
  const stale = disk.expireSnap({ username: "mira", place: { value: "автобус", at: old } });
  assert.equal(stale.place, undefined);
});

test("events keep a tail of 200 and two writers both land", async () => {
  const writes = Array.from({ length: 205 }, (_, i) =>
    disk.commitWorld("long", { place: { value: "дом", at: Date.now() } }, { text: `e-${i}`, source: "user" }),
  );
  await Promise.all(writes);
  const got = await disk.getWorld("long");
  assert.equal(got.events.length, 200);
  assert.equal(got.snap.place.value, "дом");
});

test("world.commit without a key is 401 and does not write", async () => {
  const before = readFileSync(join(dataDir, "world", "inna.json"), "utf8");
  const denied = await post({
    request: rpcRequest({ name: "world.commit", data: { username: "inna", patch: { place: { value: "офис", at: Date.now() } } } }, ""),
  });
  assert.equal(denied.status, 401);
  assert.equal(readFileSync(join(dataDir, "world", "inna.json"), "utf8"), before);
  const rpcText = readFileSync(new URL("../src/routes/api/rpc.ts", import.meta.url), "utf8");
  assert.match(rpcText, /case "world.get"/);
  assert.match(rpcText, /case "world.commit"/);
});
