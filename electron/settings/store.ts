import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type AgentflowSettings = {
  resourceServerUrl?: string;
  langflowBaseUrl?: string;
  langflowApiKey?: string;
  langflowAutoStart?: boolean;
  langflowPort?: number;
  /** null / 0 / omitted = unlimited agent graph steps */
  agentRecursionLimit?: number | null;
};

const AGENTFLOW_DIR = path.join(os.homedir(), ".agentflow");
const SETTINGS_FILE = path.join(AGENTFLOW_DIR, "settings.json");

async function ensureAgentflowDir(): Promise<void> {
  await fs.mkdir(AGENTFLOW_DIR, { recursive: true });
}

export async function loadSettings(): Promise<AgentflowSettings> {
  try {
    await ensureAgentflowDir();
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw) as AgentflowSettings;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveSettings(partial: AgentflowSettings): Promise<void> {
  await ensureAgentflowDir();
  const current = await loadSettings();
  await fs.writeFile(SETTINGS_FILE, JSON.stringify({ ...current, ...partial }, null, 2));
}
