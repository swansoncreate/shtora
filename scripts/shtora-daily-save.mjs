import { createJiti } from "jiti";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "data", "shtora-config.json");

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch {
  console.log("Нет data/shtora-config.json — открой Штору, сохрани токен Dropbox.");
  process.exit(1);
}

if (!config?.dropboxToken || !config?.apifyToken) {
  console.log("В конфиге нет токенов.");
  process.exit(1);
}

const jiti = createJiti(import.meta.url, {
  alias: { "@": join(root, "src") },
});
const { runServerAutoSave } = await jiti.import("../src/lib/dropbox/autosave.server.ts");

const result = await runServerAutoSave({
  apifyToken: config.apifyToken,
  dropboxToken: config.dropboxToken,
  dropboxRefreshToken: config.dropboxRefreshToken,
  dropboxAppKey: config.dropboxAppKey,
  dropboxAppSecret: config.dropboxAppSecret,
  defaultFolder: config.defaultFolder || "/Штора",
  accountFolders: config.accountFolders,
  savedFiles: Array.isArray(config.savedFiles) ? config.savedFiles : [],
  favorites: Array.isArray(config.favorites) ? config.favorites : undefined,
});

const savedFiles = [
  ...new Set([...(config.savedFiles ?? []), ...(result.keys ?? [])]),
];
mkdirSync(dirname(configPath), { recursive: true });
writeFileSync(
  configPath,
  JSON.stringify({ ...config, savedFiles, lastLog: result.log, lastRunAt: new Date().toISOString() }),
  "utf8",
);
console.log(result.log || `Сохранено ${result.saved}, ошибок ${result.failed}`);
