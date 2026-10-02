import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataRoot } from "@/lib/server/data-dir.server";

export type ServerConfig = {
  apifyToken: string;
  hikerToken: string;
  tikhubToken: string;
  dropboxToken: string;
  dropboxRefreshToken: string;
  dropboxAppKey: string;
  dropboxAppSecret: string;
  dropboxTokenExpiresAt: number;
  defaultFolder: string;
  accountFolders: Record<string, string>;
  favorites: string[];
  autoSave: boolean;
  savedFiles: string[];
  chatEngine?: "claude" | "grok";
  chatApiKey?: string;
  chatModel?: string;
  imaginePrompt?: string;
};

async function configPath() {
  return join(await dataRoot(), "shtora-config.json");
}

export async function readRawConfig(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(await configPath(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function patchServerConfig(partial: Record<string, unknown>) {
  const parsed = await readRawConfig();
  const next = { ...parsed, ...partial, updatedAt: new Date().toISOString() };
  await writeFile(await configPath(), JSON.stringify(next), "utf8");
  return next;
}

export async function readServerConfig(): Promise<ServerConfig | null> {
  try {
    const parsed = await readRawConfig();
    if (!Object.keys(parsed).length) return null;
    const apifyToken = String(parsed.apifyToken ?? "").trim();
    const hikerToken = String(parsed.hikerToken ?? "").trim();
    const tikhubToken = String(parsed.tikhubToken ?? "").trim();
    const accountFolders: Record<string, string> = {};
    if (parsed.accountFolders && typeof parsed.accountFolders === "object") {
      for (const [name, value] of Object.entries(parsed.accountFolders as Record<string, unknown>)) {
        if (typeof value === "string" && name.trim()) accountFolders[name.trim().toLowerCase()] = value;
      }
    }
    const favorites = Array.isArray(parsed.favorites)
      ? parsed.favorites.filter((n): n is string => typeof n === "string").map((n) => n.trim().toLowerCase())
      : Object.keys(accountFolders);
    const expiresRaw = parsed.dropboxTokenExpiresAt;
    const dropboxTokenExpiresAt =
      typeof expiresRaw === "number" && Number.isFinite(expiresRaw) ? expiresRaw : 0;
    return {
      apifyToken,
      hikerToken,
      tikhubToken,
      dropboxToken: String(parsed.dropboxToken ?? "").trim(),
      dropboxRefreshToken: String(parsed.dropboxRefreshToken ?? "").trim(),
      dropboxAppKey: String(parsed.dropboxAppKey ?? "").trim(),
      dropboxAppSecret: String(parsed.dropboxAppSecret ?? "").trim(),
      dropboxTokenExpiresAt,
      defaultFolder: String(parsed.defaultFolder ?? "/Штора"),
      accountFolders,
      favorites: favorites.filter(Boolean),
      autoSave: parsed.autoSave !== false,
      savedFiles: Array.isArray(parsed.savedFiles)
        ? parsed.savedFiles.filter((id): id is string => typeof id === "string")
        : [],
      chatEngine: parsed.chatEngine === "claude" || parsed.chatEngine === "grok" ? parsed.chatEngine : undefined,
      chatApiKey: String(parsed.chatApiKey ?? "").trim() || undefined,
      chatModel: String(parsed.chatModel ?? "").trim() || undefined,
      imaginePrompt: String(parsed.imaginePrompt ?? "").trim() || undefined,
    };
  } catch {
    return null;
  }
}
