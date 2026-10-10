import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

await register(pathToFileURL(new URL("./src-alias-hook.mjs", import.meta.url).pathname));

const { safeDiagnosticValue } = await import("../src/lib/server/diagnostics.server.ts");

test("diagnostics preserve safe boolean and numeric metrics", () => {
  assert.equal(safeDiagnosticValue("hasImage", true), true);
  assert.equal(safeDiagnosticValue("hasPrompt", false), false);
  assert.equal(safeDiagnosticValue("promptChars", 420), 420);
  assert.equal(safeDiagnosticValue("sourceBytes", 12000), 12000);
});

test("diagnostics redact sensitive strings even when the value looks harmless", () => {
  assert.equal(safeDiagnosticValue("prompt", "private prompt"), undefined);
  assert.equal(safeDiagnosticValue("messageText", "private message"), undefined);
  assert.equal(safeDiagnosticValue("sourceImageUrl", "https://example.com/photo.jpg"), undefined);
  assert.equal(safeDiagnosticValue("dropboxToken", "token-value"), undefined);
});

test("diagnostics redact URLs from allowed ordinary string fields", () => {
  assert.equal(safeDiagnosticValue("providerRoute", "https://example.com/rpc"), "[url]");
  assert.equal(safeDiagnosticValue("provider", "image-gateway"), "image-gateway");
});
