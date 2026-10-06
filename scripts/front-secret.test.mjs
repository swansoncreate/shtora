import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createJiti } from "jiti";

const dataDir = mkdtempSync(join(tmpdir(), "shtora-secret-"));
process.env.SHTORA_DATA_DIR = dataDir;
process.env.SHTORA_SELF = "1";
delete process.env.SHTORA_RPC_KEY;
delete process.env.SHTORA_VPS_ORIGIN;

const jiti = createJiti(import.meta.url, { alias: { "@": join(process.cwd(), "src") } });
const secret = await jiti.import("../src/lib/server/front-secret.server.ts");
const remote = await jiti.import("../src/lib/server/remote.ts");

test("environment is the only RPC/VPS secret source", () => {
  assert.equal(secret.FRONT_RPC_KEY, "");
  assert.equal(secret.FRONT_VPS_ORIGIN, "");
  assert.equal(remote.rpcKey(), "");
  assert.equal(remote.vpsOrigin(), "");
  process.env.SHTORA_RPC_KEY = "env-key";
  process.env.SHTORA_VPS_ORIGIN = "https://env.example/";
  assert.equal(remote.rpcKey(), "env-key");
  assert.equal(remote.vpsOrigin(), "https://env.example");
  assert.notEqual(remote.rpcKey(), secret.FRONT_RPC_KEY);
});

test("a foreign key on the VPS is 401 and does not write", async () => {
  process.env.SHTORA_RPC_KEY = "env-key";
  const denied = remote.assertRpc(new Request("https://vps.test/api/rpc", { headers: { "x-shtora-key": "other-key" } }));
  assert.equal(denied?.status, 401);
  writeFileSync(join(dataDir, "story-seen.json"), "[]");
  const before = readFileSync(join(dataDir, "story-seen.json"), "utf8");
  assert.equal(readFileSync(join(dataDir, "story-seen.json"), "utf8"), before);
});

test("the key lives only in the server module", () => {
  const key = secret.FRONT_RPC_KEY;
  const hits = [];
  function walk(dir) {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (name.name === "node_modules" || name.name === ".git") continue;
      const path = join(dir, name.name);
      if (name.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs|json|html|css)$/.test(name.name)) continue;
      const text = readFileSync(path, "utf8");
      if (key && text.includes(key)) hits.push(path);
    }
  }
  walk(join(process.cwd(), "src"));
  walk(join(process.cwd(), "public"));
  assert.deepEqual(hits, [join(process.cwd(), "src/lib/server/front-secret.server.ts")]);
  const settings = readFileSync(join(process.cwd(), "src/components/settings-sheet.tsx"), "utf8");
  const tokens = readFileSync(join(process.cwd(), "src/routes/api/tokens.ts"), "utf8");
  assert.equal(settings.includes(key), false);
  assert.equal(tokens.includes(key), false);
  assert.equal(settings.includes("localStorage.setItem"), false);
});
