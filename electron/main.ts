import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startAgentServer } from "./agent/server";
import { startExecutorServer } from "./executor/server";
import { resolveRecursionLimit, setRecursionLimitCache } from "./agent/recursionLimit";
import { clearApiKey, loadApiKey, saveApiKey } from "./settings/keychain";
import { loadSettings, saveSettings } from "./settings/store";
import { ensureProjectWorkflow, initProjectFromTemplate } from "./workflow/loader";
import { ensureLangflowRunning, stopLangflow } from "./langflow/manager";
import { logger } from "./utils/logger";

const AGENT_PORT = 8765;
const EXECUTOR_PORT = 17351;
const MAX_RECENT = 10;

const AGENTFLOW_DIR = path.join(os.homedir(), ".agentflow");
const RECENT_FILE = path.join(AGENTFLOW_DIR, "recent.json");

let agentServer: ReturnType<typeof startAgentServer> | null = null;
let workspaceRoot = process.cwd();
let resourceServerUrl: string | null = null;

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception in main process", err);
});

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logger.error("Unhandled rejection in main process", error);
});

async function refreshResourceServerUrl(): Promise<void> {
  const settings = await loadSettings();
  const url = settings.resourceServerUrl?.trim();
  resourceServerUrl = url || null;
}

function restartAgentServer(): void {
  logger.info("Restarting agent server");
  if (agentServer) {
    agentServer.close();
    agentServer = null;
  }
  agentServer = startAgentServer({
    port: AGENT_PORT,
    getApiKey: loadApiKey,
    getWorkspaceRoot: () => workspaceRoot,
    getResourceServerUrl: () => resourceServerUrl,
  });
  logger.info("Agent server restarted");
}

async function ensureAgentflowDir(): Promise<void> {
  await fs.mkdir(AGENTFLOW_DIR, { recursive: true });
}

async function loadRecentProjects(): Promise<string[]> {
  try {
    await ensureAgentflowDir();
    const raw = await fs.readFile(RECENT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

async function saveRecentProjects(projects: string[]): Promise<void> {
  await ensureAgentflowDir();
  await fs.writeFile(RECENT_FILE, JSON.stringify(projects.slice(0, MAX_RECENT), null, 2));
}

async function addRecentProject(dir: string): Promise<void> {
  const normalized = path.resolve(dir);
  const recent = await loadRecentProjects();
  const filtered = recent.filter((entry) => entry !== normalized);
  filtered.unshift(normalized);
  await saveRecentProjects(filtered);
}

async function openProject(dir: string): Promise<string> {
  workspaceRoot = path.resolve(dir);
  try {
    await ensureProjectWorkflow(workspaceRoot);
  } catch (err) {
    console.warn("[workflow] ensure on open failed:", err);
  }
  await addRecentProject(workspaceRoot);
  restartAgentServer();
  return workspaceRoot;
}

async function refreshRecursionLimitCache(): Promise<void> {
  const settings = await loadSettings();
  setRecursionLimitCache(resolveRecursionLimit(settings));
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  return win;
}

app.whenReady().then(async () => {
  await refreshResourceServerUrl();
  await refreshRecursionLimitCache();
  startExecutorServer(EXECUTOR_PORT);
  restartAgentServer();
  const settings = await loadSettings();
  void ensureLangflowRunning(settings).then((result) => {
    if (!result.ok) {
      console.warn("[langflow] auto-start:", result.detail ?? "unreachable");
    }
  });
  createWindow();

  ipcMain.handle("settings:getApiKey", () => (loadApiKey() ? "***configured***" : ""));
  ipcMain.handle("settings:setApiKey", (_e, key: string) => {
    saveApiKey(key.trim());
    restartAgentServer();
    return true;
  });
  ipcMain.handle("settings:clearApiKey", () => {
    clearApiKey();
    restartAgentServer();
    return true;
  });
  ipcMain.handle("settings:getResourceServerUrl", async () => {
    const settings = await loadSettings();
    return settings.resourceServerUrl ?? "";
  });
  ipcMain.handle("settings:setResourceServerUrl", async (_e, url: string) => {
    await saveSettings({ resourceServerUrl: url.trim() });
    await refreshResourceServerUrl();
    return true;
  });
  ipcMain.handle("settings:getLangflowBaseUrl", async () => {
    const settings = await loadSettings();
    return settings.langflowBaseUrl ?? "http://127.0.0.1:7860";
  });
  ipcMain.handle("settings:getLangflowApiKeyStatus", async () => {
    const settings = await loadSettings();
    return settings.langflowApiKey ? "***configured***" : "";
  });
  ipcMain.handle("settings:setLangflow", async (_e, baseUrl: string, apiKey: string) => {
    await saveSettings({
      langflowBaseUrl: baseUrl.trim(),
      langflowApiKey: apiKey.trim(),
    });
    return true;
  });

  ipcMain.handle("settings:getLangflowAutoStart", async () => {
    const settings = await loadSettings();
    return settings.langflowAutoStart !== false;
  });
  ipcMain.handle("settings:setLangflowAutoStart", async (_e, enabled: boolean) => {
    await saveSettings({ langflowAutoStart: enabled });
    return true;
  });
  ipcMain.handle("settings:getAgentRecursionLimit", async () => {
    const settings = await loadSettings();
    const raw = settings.agentRecursionLimit;
    if (raw === undefined || raw === null || raw === 0) {
      return { unlimited: true as const, limit: null };
    }
    return { unlimited: false as const, limit: Math.max(1, Math.floor(raw)) };
  });
  ipcMain.handle("settings:setAgentRecursionLimit", async (_e, payload: { unlimited?: boolean; limit?: number }) => {
    const unlimited = payload.unlimited !== false;
    const agentRecursionLimit = unlimited
      ? null
      : Math.max(1, Math.floor(Number(payload.limit) || 1));
    await saveSettings({ agentRecursionLimit });
    await refreshRecursionLimitCache();
    return true;
  });
  ipcMain.handle("langflow:restart", async () => {
    await stopLangflow();
    const settings = await loadSettings();
    return ensureLangflowRunning(settings);
  });

  ipcMain.handle("workspace:get", () => workspaceRoot);
  ipcMain.handle("workspace:pick", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths[0]) return workspaceRoot;
    return openProject(result.filePaths[0]);
  });
  ipcMain.handle("project:pickDirectory", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return "";
    return result.filePaths[0];
  });

  ipcMain.handle("project:init", async (_e, dir: string) => {
    await initProjectFromTemplate(dir, "default-dev-cicd");
    return openProject(dir);
  });
  ipcMain.handle("project:open", async (_e, dir: string) => openProject(dir));
  ipcMain.handle("project:recent", () => loadRecentProjects());

  ipcMain.handle("sidecar:port", () => AGENT_PORT);
});

app.on("before-quit", () => {
  void stopLangflow();
});

app.on("window-all-closed", () => {
  agentServer?.close();
  if (process.platform !== "darwin") app.quit();
});
