import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

await register(pathToFileURL(new URL("./src-alias-hook.mjs", import.meta.url).pathname));

const dataDir = mkdtempSync(join(tmpdir(), "shtora-stage2-"));
mkdirSync(dataDir, { recursive: true });
process.env.SHTORA_DATA_DIR = dataDir;
process.env.SHTORA_SELF = "1";
process.env.SHTORA_RPC_KEY = "stage2-test-key";

const tokens = await import("../src/routes/api/tokens.ts");
const post = tokens.Route.server.handlers.POST;

function tokenRequest(body) {
  return new Request("https://vps.test/api/tokens", {
    method: "POST",
    headers: { "content-type": "application/json", "x-shtora-key": process.env.SHTORA_RPC_KEY },
    body: JSON.stringify(body),
  });
}

test("token post writes only non-empty fields and returns flags", async () => {
  writeFileSync(
    join(dataDir, "shtora-config.json"),
    JSON.stringify({ hikerToken: "hiker-kept-123", tikhubToken: "tikhub-kept-123", apifyToken: "apify-kept" }),
  );
  const res = await post({ request: tokenRequest({ apifyToken: "apify-next", hikerToken: "", chatApiKey: "" }) });
  assert.equal(res.status, 200);
  const flags = await res.json();
  assert.deepEqual(Object.keys(flags).sort(), ["apify", "dropbox", "hiker", "tikhub"]);
  assert.equal(JSON.stringify(flags).includes("apify-next"), false);
  assert.equal(JSON.stringify(flags).includes("hiker-kept"), false);
  const saved = JSON.parse(readFileSync(join(dataDir, "shtora-config.json"), "utf8"));
  assert.equal(saved.apifyToken, "apify-next");
  assert.equal(saved.hikerToken, "hiker-kept-123");
  assert.equal(saved.tikhubToken, "tikhub-kept-123");
  assert.equal(saved.chatApiKey, undefined);
});

test("imagine stays on the publication and the browser does not get a data url", () => {
  const text = readFileSync(new URL("../src/lib/imagine/functions.ts", import.meta.url), "utf8");
  const start = text.indexOf("export const imagineVariation");
  const handler = text.slice(start, text.indexOf("export const listStudio", start));
  assert.match(text, /generateImage\(/);
  assert.match(text, /from "\.\/gateway\.ts"/);
  assert.equal(handler.includes("embedImage("), false);
  assert.match(text, /if \(!raw \|\| raw.startsWith\("data:"\) \|\| raw.startsWith\("blob:"\)\) return ""/);
  const studio = readFileSync(new URL("../src/components/imagine-studio.tsx", import.meta.url), "utf8");
  assert.equal(studio.includes("writeStudioLocal"), false);
  assert.match(studio, /clearStudioLocal\(\)/);
  assert.match(studio, /setResults\(list\)/);
});

test("empty dropbox token uses the server refresh, a client token is still accepted", () => {
  const text = readFileSync(new URL("../src/lib/dropbox/functions.ts", import.meta.url), "utf8");
  assert.match(text, /z\.string\(\)\.max\(8000\)\.optional\(\)/);
  assert.match(text, /return dropboxWithRefresh\(token \|\| ""/);
  assert.equal(text.includes("data.token);"), false);
  const settings = readFileSync(new URL("../src/components/settings-sheet.tsx", import.meta.url), "utf8");
  assert.match(settings, /setApifyDraft\(""\)/);
  assert.match(settings, /setAppSecretDraft\(""\)/);
  assert.match(settings, /setChatKeyDraft\(""\)/);
  assert.match(settings, /не показываем/);
});
