import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { provisionLangflowApiKey } from "./apiKey";
import { getSpawnedBaseUrl } from "./manager";
import type { LangflowConfig } from "./types";

const DEFAULT_BASE_URL = "http://127.0.0.1:7860";

function isLocalLangflowUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

export async function getLangflowConfig(): Promise<LangflowConfig> {
  const settingsPath = path.join(os.homedir(), ".agentflow/settings.json");
  let baseUrl = DEFAULT_BASE_URL;
  let apiKey = "";
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as {
      langflowBaseUrl?: string;
      langflowApiKey?: string;
    };
    baseUrl = (parsed.langflowBaseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
    apiKey = parsed.langflowApiKey?.trim() ?? "";
  } catch {
    /* use defaults */
  }

  const spawned = getSpawnedBaseUrl();
  if (spawned) {
    baseUrl = spawned;
  }

  if (!apiKey && (spawned || isLocalLangflowUrl(baseUrl))) {
    apiKey = (await provisionLangflowApiKey()) ?? "";
  }

  return { baseUrl, apiKey };
}
