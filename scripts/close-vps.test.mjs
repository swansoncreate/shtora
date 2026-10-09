import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertRpc,
  corsHeaders,
  forwardToVps,
  rpcKey,
  vpsOrLocal,
  vpsOrigin,
} from "../src/lib/server/remote.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const OLD_KEY = "shtora_rpc_b8e41c2a9f6d47e0a1c35d82f0e6b4aa";
const OLD_IP = "81-200-157-181.sslip.io";
const KEY = "stage0-test-key";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|mjs|js|jsx)$/.test(name)) out.push(path);
    else out.push(path);
  }
  return out;
}

function source(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function withEnv(patch, fn) {
  const prev = {};
  for (const key of Object.keys(patch)) {
    prev[key] = process.env[key];
    if (patch[key] === undefined) delete process.env[key];
    else process.env[key] = patch[key];
  }
  const finish = () => {
    for (const key of Object.keys(patch)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  };
  try {
    const result = fn();
    if (result && typeof result.then === "function") return result.finally(finish);
    finish();
    return result;
  } catch (err) {
    finish();
    throw err;
  }
}

function req(path, headers = {}) {
  return new Request(`https://publication.test${path}`, { headers });
}

test("client module no longer exports the compromised key or VPS origin", () => {
  const origin = source("src/lib/shtora-origin.ts");
  assert.equal(origin.includes("SHTORA_RPC_KEY"), false);
  assert.equal(origin.includes("VPS_ORIGIN"), false);
  assert.equal(origin.includes(OLD_KEY), false);
  assert.equal(origin.includes(OLD_IP), false);
  assert.equal(rpcKey(), process.env.SHTORA_RPC_KEY || "");
});

test("compromised key and VPS ip are gone from the tree", () => {
  const hits = [];
  for (const path of walk(join(ROOT, "src"))) {
    const text = readFileSync(path, "utf8");
    if (text.includes(OLD_KEY) || text.includes(OLD_IP)) hits.push(path);
  }
  assert.deepEqual(hits, []);
});

test("no env key is 503, missing or wrong header is 401, match proceeds", () => {
  withEnv({ SHTORA_RPC_KEY: undefined }, () => {
    const denied = assertRpc(req("/api/state", { "x-shtora-key": KEY }));
    assert.equal(denied?.status, 503);
  });
  withEnv({ SHTORA_RPC_KEY: KEY }, () => {
    assert.equal(assertRpc(req("/api/state")).status, 401);
    assert.equal(assertRpc(req("/api/state", { "x-shtora-key": "nope" })).status, 401);
    assert.equal(assertRpc(req("/api/state", { "x-shtora-key": `${KEY}-extra` })).status, 401);
    assert.equal(assertRpc(req("/api/state", { "x-shtora-key": KEY.slice(0, -1) })).status, 401);
    assert.equal(assertRpc(req("/api/state", { "x-shtora-key": KEY })), null);
  });
});

test("vpsOrLocal checks the key before the local handler, except GET /api/health", async () => {
  await withEnv({ SHTORA_SELF: "1", SHTORA_RPC_KEY: undefined, SHTORA_VPS_ORIGIN: undefined }, async () => {
    let called = false;
    const denied = await vpsOrLocal(req("/api/state"), async () => {
      called = true;
      return Response.json({ ok: true });
    });
    assert.equal(denied.status, 503);
    assert.equal(called, false);
  });
  await withEnv({ SHTORA_SELF: "1", SHTORA_RPC_KEY: KEY }, async () => {
    let called = false;
    const denied = await vpsOrLocal(req("/api/chat-dump"), async () => {
      called = true;
      return Response.json({ ok: true });
    });
    assert.equal(denied.status, 401);
    assert.equal(called, false);
    const health = await vpsOrLocal(req("/api/health"), async () => Response.json({ ok: true }));
    assert.equal(health.status, 200);
    const opened = await vpsOrLocal(req("/api/state", { "x-shtora-key": KEY }), async () =>
      Response.json({ ok: true }),
    );
    assert.equal(opened.status, 200);
  });
});

test("publication proxy stays closed without env and does not call local", async () => {
  await withEnv({ SHTORA_SELF: undefined, SHTORA_DATA_DIR: undefined, SHTORA_RPC_KEY: undefined, SHTORA_VPS_ORIGIN: undefined }, async () => {
    let called = false;
    const denied = await vpsOrLocal(req("/api/state"), async () => {
      called = true;
      return Response.json({ ok: true });
    });
    assert.equal(denied.status, 503);
    assert.equal(called, false);
  });
  await withEnv({ SHTORA_SELF: undefined, SHTORA_RPC_KEY: KEY, SHTORA_VPS_ORIGIN: undefined }, async () => {
    const denied = await vpsOrLocal(req("/api/state"), async () => Response.json({ ok: true }));
    assert.equal(denied.status, 503);
    const body = await denied.json();
    assert.equal(body.error, "vps origin not configured");
  });
});

test("publication sets the key itself and takes origin only from SHTORA_VPS_ORIGIN", async () => {
  const prevFetch = globalThis.fetch;
  let seen = null;
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), key: new Headers(init?.headers).get("x-shtora-key") };
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await withEnv(
      { SHTORA_SELF: undefined, SHTORA_RPC_KEY: KEY, SHTORA_VPS_ORIGIN: "https://vps.example/" },
      async () => {
        assert.equal(vpsOrigin(), "https://vps.example");
        const res = await forwardToVps(req("/api/state?x=1"));
        assert.equal(res.status, 200);
        assert.equal(seen.url, "https://vps.example/api/state?x=1");
        assert.equal(seen.key, KEY);
      },
    );
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("rpc and grok-chat no longer allow every origin", () => {
  for (const rel of ["src/routes/api/rpc.ts", "src/routes/api/grok-chat.ts"]) {
    const text = source(rel);
    assert.equal(text.includes("Access-Control-Allow-Origin"), false, rel);
    assert.equal(text.includes('"*"'), false, rel);
    assert.match(text, rel.endsWith("grok-chat.ts") ? /assertRpc\(request\)/ : /assertAppOrRpc\(request\)/);
  }
  withEnv({ SHTORA_FRONT_ORIGIN: "https://front.example", SHTORA_PUBLIC_ORIGIN: undefined }, () => {
    const matched = corsHeaders(req("/api/rpc", { origin: "https://front.example" }), "POST, OPTIONS");
    assert.equal(matched.get("access-control-allow-origin"), "https://front.example");
    const other = corsHeaders(req("/api/rpc", { origin: "https://evil.example" }), "POST, OPTIONS");
    assert.equal(other.get("access-control-allow-origin"), null);
    assert.equal(other.get("access-control-allow-origin") === "*", false);
  });
});

test("media url bypass and grok-chat call assertRpc before local work", () => {
  const media = source("src/routes/api/media.ts");
  const grok = source("src/routes/api/grok-chat.ts");
  assert.equal(media.includes("assertAppOrRpc(request)"), true);
  const mediaGet = media.slice(media.indexOf("GET: async"));
  assert.ok(mediaGet.indexOf("assertAppOrRpc(request)") < mediaGet.indexOf("fetchUpstream"));
  assert.ok(grok.indexOf("assertRpc(request)") < grok.indexOf("runningOnVps()"));
  const rpc = source("src/routes/api/rpc.ts");
  assert.ok(rpc.indexOf("assertAppOrRpc(request)") < rpc.indexOf("body ="));
});

test("safeEqual always calls timingSafeEqual before the length check", () => {
  const text = source("src/lib/server/remote.ts");
  const fn = text.slice(text.indexOf("function safeEqual"), text.indexOf("export function assertRpc"));
  assert.match(fn, /timingSafeEqual\(aa, bb\)/);
  assert.ok(fn.indexOf("timingSafeEqual(aa, bb)") < fn.indexOf("a.length === b.length"));
  assert.equal(fn.includes("a.length === b.length && timingSafeEqual"), false);
});

test("dropbox redirect does not mention VPS or front origin env names", () => {
  const text = source("src/lib/dropbox/token.ts");
  assert.equal(text.includes("SHTORA_VPS_ORIGIN"), false);
  assert.equal(text.includes("SHTORA_FRONT_ORIGIN"), false);
  assert.match(text, /window\.location\.origin/);
  assert.match(text, /return "\/dropbox-oauth"/);
});

test("VPS proxyOr rejects a server function before local disk work", async () => {
  const { register } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  await register(pathToFileURL(new URL("./ts-ext-hook.mjs", import.meta.url).pathname));
  const { proxyOr } = await import("../src/lib/server/remote.ts");
  const { RpcDenied } = await import("../src/lib/server/rpc-guard.server.ts");
  const storage = globalThis[Symbol.for("tanstack-start:event-storage")];
  assert.ok(storage, "tanstack event storage");
  const run = (request, res, fn) => storage.run({ h3Event: { req: request, res } }, fn);

  await withEnv({ SHTORA_SELF: "1", SHTORA_RPC_KEY: undefined }, async () => {
    let called = false;
    const res = { status: 200, statusText: "" };
    await assert.rejects(
      () => run(req("/_server/dumpChatToDisk"), res, () => proxyOr("chat.dump", {}, async () => {
        called = true;
        return { ok: true };
      })),
      (err) => err instanceof RpcDenied && err.status === 503,
    );
    assert.equal(called, false);
    assert.equal(res.status, 503);
  });

  await withEnv({ SHTORA_SELF: "1", SHTORA_RPC_KEY: KEY }, async () => {
    let called = false;
    const res = { status: 200, statusText: "" };
    await assert.rejects(
      () => run(req("/_server/dumpChatToDisk"), res, () => proxyOr("chat.dump", {}, async () => {
        called = true;
        return { ok: true };
      })),
      (err) => err instanceof RpcDenied && err.status === 401,
    );
    assert.equal(called, false);
    assert.equal(res.status, 401);
    const opened = await run(req("/_server/dumpChatToDisk", { "x-shtora-key": KEY }), { status: 200, statusText: "" }, () =>
      proxyOr("chat.erase", {}, async () => {
        called = true;
        return { ok: true };
      }),
    );
    assert.equal(opened.ok, true);
    assert.equal(called, true);
  });
});

test("listed disk server functions enter proxyOr before writing", () => {
  const disk = source("src/lib/chat/disk.ts");
  for (const name of ["dumpChatToDisk", "listDiskChats", "eraseChatDisk"]) {
    const body = disk.slice(disk.indexOf(`export const ${name}`));
    assert.ok(body.indexOf("proxyOr(") < body.indexOf(".server"), name);
  }
  const studio = source("src/lib/imagine/functions.ts");
  for (const name of ["listStudio", "saveStudio", "dropStudio"]) {
    const body = studio.slice(studio.indexOf(`export const ${name}`));
    assert.ok(body.indexOf("proxyOr(") >= 0, name);
  }
  const dropbox = source("src/lib/dropbox/functions.ts");
  assert.match(dropbox, /return proxyOr\(name, data, local\)/);
  const remote = source("src/lib/server/remote.ts");
  const fn = remote.slice(remote.indexOf("export async function proxyOr"));
  assert.ok(fn.indexOf("assertVpsServerFn()") < fn.indexOf("return local()"));
});
