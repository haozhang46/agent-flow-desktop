import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const API_KEY_PATTERN = /sk-[A-Za-z0-9_-]+/;

export function parseApiKeyFromCliOutput(output: string): string | null {
  const match = output.match(API_KEY_PATTERN);
  return match?.[0] ?? null;
}

function settingsPath(): string {
  return path.join(os.homedir(), ".agentflow/settings.json");
}

function langflowConfigDir(): string {
  return path.join(os.homedir(), ".agentflow", "langflow");
}

function langflowVenvPython(): string {
  return path.join(os.homedir(), ".agentflow/langflow-venv/bin/python");
}

async function readSettingsApiKey(): Promise<string> {
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as { langflowApiKey?: string };
    return parsed.langflowApiKey?.trim() ?? "";
  } catch {
    return "";
  }
}

async function persistSettingsApiKey(apiKey: string): Promise<void> {
  const file = settingsPath();
  let current: Record<string, unknown> = {};
  try {
    current = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
  } catch {
    /* new file */
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ ...current, langflowApiKey: apiKey }, null, 2));
}

let provisionPromise: Promise<string | null> | null = null;

export async function provisionLangflowApiKey(): Promise<string | null> {
  const existing = await readSettingsApiKey();
  if (existing) {
    return existing;
  }

  if (!provisionPromise) {
    provisionPromise = (async () => {
      const python = langflowVenvPython();
      try {
        await fs.access(python);
      } catch {
        return null;
      }

      try {
        const { stdout, stderr } = await execFileAsync(python, ["-m", "langflow", "api-key"], {
          env: {
            ...process.env,
            LANGFLOW_CONFIG_DIR: langflowConfigDir(),
          },
          timeout: 120_000,
          maxBuffer: 10 * 1024 * 1024,
        });
        const key = parseApiKeyFromCliOutput(`${stdout}\n${stderr}`);
        if (!key) {
          return null;
        }
        await persistSettingsApiKey(key);
        return key;
      } catch {
        return null;
      } finally {
        provisionPromise = null;
      }
    })();
  }

  return provisionPromise;
}
