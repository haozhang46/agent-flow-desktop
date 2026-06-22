import { execFile, spawn, type ChildProcess } from "node:child_process";
import { openSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { provisionLangflowApiKey } from "./apiKey";
import { checkHealth } from "./client";
import type { LangflowConfig } from "./types";

const execFileAsync = promisify(execFile);

const DEFAULT_SPAWN_PORT = 17860;
const HEALTH_POLL_MS = 2_000;
const HEALTH_TIMEOUT_MS = 300_000;

let child: ChildProcess | null = null;
let spawnedBaseUrl: string | null = null;
let ownsSpawnedProcess = false;
let lastStartDetail: string | undefined;

export function getLastLangflowStartDetail(): string | undefined {
  return lastStartDetail;
}

export type LangflowRuntimeMode = "external" | "spawned" | "off";

export type LangflowStartSettings = {
  langflowAutoStart?: boolean;
  langflowPort?: number;
  langflowBaseUrl?: string;
  langflowApiKey?: string;
};

export function getSpawnedBaseUrl(): string | null {
  return spawnedBaseUrl;
}

export function getRuntimeMode(): LangflowRuntimeMode {
  if (spawnedBaseUrl) return "spawned";
  return "external";
}

function baseUrlForPort(port: number): string {
  return `http://127.0.0.1:${port}`;
}

function configFromSettings(settings: LangflowStartSettings): LangflowConfig {
  const baseUrl = (settings.langflowBaseUrl?.trim() || "http://127.0.0.1:7860").replace(
    /\/$/,
    "",
  );
  return {
    baseUrl,
    apiKey: settings.langflowApiKey?.trim() ?? "",
  };
}

function langflowVenvPython(): string {
  return path.join(os.homedir(), ".agentflow/langflow-venv/bin/python");
}

function augmentedPath(): string {
  const extra = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(os.homedir(), ".local/bin"),
    path.join(os.homedir(), "Library/Python/3.11/bin"),
    path.join(os.homedir(), "Library/Python/3.12/bin"),
    path.join(os.homedir(), "Library/Python/3.13/bin"),
  ];
  return [...extra, process.env.PATH ?? ""].filter(Boolean).join(path.delimiter);
}

async function which(binary: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("which", [binary], {
      env: { ...process.env, PATH: augmentedPath() },
    });
    const found = stdout.trim();
    return found || null;
  } catch {
    return null;
  }
}

async function canRunPythonModule(module: string): Promise<string | null> {
  const python = (await which("python3")) ?? (await which("python"));
  if (!python) return null;
  return canRunPythonModuleWith(python, module);
}

async function canRunPythonModuleWith(python: string, module: string): Promise<string | null> {
  try {
    await execFileAsync(python, ["-c", `import ${module}`], {
      env: { ...process.env, PATH: augmentedPath() },
      timeout: 120_000,
    });
    return python;
  } catch {
    return null;
  }
}

async function resolveLangflowSpawn(): Promise<{ command: string; args: string[] } | null> {
  const venvPython = langflowVenvPython();
  try {
    await fs.access(venvPython);
    return { command: venvPython, args: ["-m", "langflow", "run"] };
  } catch {
    /* venv not installed */
  }

  const langflowPath = await which("langflow");
  if (langflowPath) {
    return { command: langflowPath, args: ["run"] };
  }

  const pythonForLangflow = await canRunPythonModule("langflow");
  if (pythonForLangflow) {
    return { command: pythonForLangflow, args: ["-m", "langflow", "run"] };
  }

  const uvPath = await which("uv");
  if (uvPath) {
    return { command: uvPath, args: ["run", "langflow", "run"] };
  }

  return null;
}

function spawnLogPath(): string {
  return path.join(os.homedir(), ".agentflow", "langflow-spawn.log");
}

async function readSpawnLogTail(maxLines = 8): Promise<string> {
  try {
    const raw = await fs.readFile(spawnLogPath(), "utf8");
    const lines = raw.trim().split("\n").slice(-maxLines);
    return lines.join("\n");
  } catch {
    return "";
  }
}

function spawnLangflow(port: number, spawnSpec: { command: string; args: string[] }): ChildProcess {
  const configDir = path.join(os.homedir(), ".agentflow", "langflow");
  const args = [
    ...spawnSpec.args,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--no-open-browser",
  ];

  const logFd = openSync(spawnLogPath(), "a");

  return spawn(spawnSpec.command, args, {
    env: {
      ...process.env,
      PATH: augmentedPath(),
      LANGFLOW_CONFIG_DIR: configDir,
      LANGFLOW_AUTO_LOGIN: "true",
      LANGFLOW_SKIP_AUTH_AUTO_LOGIN: "true",
    },
    stdio: ["ignore", logFd, logFd],
    detached: false,
  });
}

async function attachIfHealthy(
  config: LangflowConfig,
  baseUrl: string,
  mode: LangflowRuntimeMode,
): Promise<{ ok: true; baseUrl: string; mode: LangflowRuntimeMode } | null> {
  if (!(await checkHealth(config))) {
    return null;
  }
  spawnedBaseUrl = baseUrl;
  return { ok: true, baseUrl, mode };
}

async function waitForHealth(
  config: LangflowConfig,
  timeoutMs: number,
  proc?: ChildProcess | null,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc && proc.exitCode !== null) {
      return checkHealth(config);
    }
    if (await checkHealth(config)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_MS));
  }
  return checkHealth(config);
}

export async function ensureLangflowRunning(settings: LangflowStartSettings): Promise<{
  ok: boolean;
  baseUrl: string;
  mode: LangflowRuntimeMode;
  detail?: string;
}> {
  const autoStart = settings.langflowAutoStart !== false;
  const port = settings.langflowPort ?? DEFAULT_SPAWN_PORT;
  const settingsConfig = configFromSettings(settings);
  const spawnUrl = baseUrlForPort(port);
  const spawnConfig: LangflowConfig = { ...settingsConfig, baseUrl: spawnUrl };

  lastStartDetail = undefined;

  if (await checkHealth(settingsConfig)) {
    spawnedBaseUrl = null;
    ownsSpawnedProcess = false;
    return { ok: true, baseUrl: settingsConfig.baseUrl, mode: "external" };
  }

  const attachedSpawnPort = await attachIfHealthy(spawnConfig, spawnUrl, "external");
  if (attachedSpawnPort) {
    ownsSpawnedProcess = false;
    return attachedSpawnPort;
  }

  if (!autoStart) {
    lastStartDetail = "Langflow is unreachable and auto-start is disabled";
    return {
      ok: false,
      baseUrl: settingsConfig.baseUrl,
      mode: "off",
      detail: lastStartDetail,
    };
  }

  if (child && !child.killed && spawnedBaseUrl) {
    const stillUp = await checkHealth({ ...settingsConfig, baseUrl: spawnedBaseUrl });
    if (stillUp) {
      return { ok: true, baseUrl: spawnedBaseUrl, mode: "spawned" };
    }
    await stopLangflow();
  }

  const spawnSpec = await resolveLangflowSpawn();
  if (!spawnSpec) {
    lastStartDetail =
      "Langflow not installed. Run: python3.11 -m venv ~/.agentflow/langflow-venv && ~/.agentflow/langflow-venv/bin/pip install langflow";
    return {
      ok: false,
      baseUrl: settingsConfig.baseUrl,
      mode: "off",
      detail: lastStartDetail,
    };
  }

  child = spawnLangflow(port, spawnSpec);
  spawnedBaseUrl = spawnUrl;
  ownsSpawnedProcess = true;

  child.on("exit", (code) => {
    child = null;
    ownsSpawnedProcess = false;
    if (code !== null && code !== 0) {
      void readSpawnLogTail().then((tail) => {
        if (tail) {
          console.warn(`[langflow] process exited (${code}). Log tail:\n${tail}`);
        }
      });
    }
  });

  const ready = await waitForHealth(spawnConfig, HEALTH_TIMEOUT_MS, child);
  if (!ready) {
    const attached = await attachIfHealthy(spawnConfig, spawnUrl, "external");
    if (attached) {
      ownsSpawnedProcess = false;
      if (child && !child.killed) {
        child.kill("SIGTERM");
      }
      child = null;
      if (!settingsConfig.apiKey) {
        await provisionLangflowApiKey();
      }
      return attached;
    }

    const logTail = await readSpawnLogTail();
    await stopLangflow();
    lastStartDetail = `Langflow did not become ready within ${HEALTH_TIMEOUT_MS / 1000}s`;
    if (logTail) {
      lastStartDetail += `. See ~/.agentflow/langflow-spawn.log`;
    }
    return {
      ok: false,
      baseUrl: settingsConfig.baseUrl,
      mode: "off",
      detail: lastStartDetail,
    };
  }

  if (!settingsConfig.apiKey) {
    await provisionLangflowApiKey();
  }

  return { ok: true, baseUrl: spawnUrl, mode: "spawned" };
}

export async function stopLangflow(): Promise<void> {
  if (!child) {
    if (ownsSpawnedProcess) {
      spawnedBaseUrl = null;
      ownsSpawnedProcess = false;
    }
    return;
  }

  const proc = child;
  child = null;
  if (ownsSpawnedProcess) {
    spawnedBaseUrl = null;
    ownsSpawnedProcess = false;
  }

  if (proc.killed) return;

  proc.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (!proc.killed) {
        proc.kill("SIGKILL");
      }
      resolve();
    }, 5000);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
