if (typeof globalThis.process === "undefined") {
  (globalThis as { process?: { env: Record<string, string>; cwd: () => string } }).process = {
    env: {},
    cwd: () => "/",
  };
}
