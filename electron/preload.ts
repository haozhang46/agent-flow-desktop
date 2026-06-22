import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  getApiKeyStatus: () => ipcRenderer.invoke("settings:getApiKey") as Promise<string>,
  setApiKey: (key: string) => ipcRenderer.invoke("settings:setApiKey", key) as Promise<boolean>,
  clearApiKey: () => ipcRenderer.invoke("settings:clearApiKey") as Promise<boolean>,
  getResourceServerUrl: () =>
    ipcRenderer.invoke("settings:getResourceServerUrl") as Promise<string>,
  setResourceServerUrl: (url: string) =>
    ipcRenderer.invoke("settings:setResourceServerUrl", url) as Promise<boolean>,
  getLangflowBaseUrl: () =>
    ipcRenderer.invoke("settings:getLangflowBaseUrl") as Promise<string>,
  getLangflowApiKeyStatus: () =>
    ipcRenderer.invoke("settings:getLangflowApiKeyStatus") as Promise<string>,
  setLangflow: (baseUrl: string, apiKey: string) =>
    ipcRenderer.invoke("settings:setLangflow", baseUrl, apiKey) as Promise<boolean>,
  getLangflowAutoStart: () =>
    ipcRenderer.invoke("settings:getLangflowAutoStart") as Promise<boolean>,
  setLangflowAutoStart: (enabled: boolean) =>
    ipcRenderer.invoke("settings:setLangflowAutoStart", enabled) as Promise<boolean>,
  getAgentRecursionLimit: () =>
    ipcRenderer.invoke("settings:getAgentRecursionLimit") as Promise<{
      unlimited: boolean;
      limit: number | null;
    }>,
  setAgentRecursionLimit: (payload: { unlimited?: boolean; limit?: number }) =>
    ipcRenderer.invoke("settings:setAgentRecursionLimit", payload) as Promise<boolean>,
  restartLangflow: () => ipcRenderer.invoke("langflow:restart") as Promise<unknown>,
  getWorkspace: () => ipcRenderer.invoke("workspace:get") as Promise<string>,
  pickWorkspace: () => ipcRenderer.invoke("workspace:pick") as Promise<string>,
  pickProjectDirectory: () =>
    ipcRenderer.invoke("project:pickDirectory") as Promise<string>,
  initProject: (dir: string) => ipcRenderer.invoke("project:init", dir) as Promise<string>,
  openProject: (dir: string) => ipcRenderer.invoke("project:open", dir) as Promise<string>,
  getRecentProjects: () => ipcRenderer.invoke("project:recent") as Promise<string[]>,
  getSidecarPort: () => ipcRenderer.invoke("sidecar:port") as Promise<number>,
});

export type DesktopApi = {
  getApiKeyStatus: () => Promise<string>;
  setApiKey: (key: string) => Promise<boolean>;
  clearApiKey: () => Promise<boolean>;
  getResourceServerUrl: () => Promise<string>;
  setResourceServerUrl: (url: string) => Promise<boolean>;
  getLangflowBaseUrl: () => Promise<string>;
  getLangflowApiKeyStatus: () => Promise<string>;
  setLangflow: (baseUrl: string, apiKey: string) => Promise<boolean>;
  getLangflowAutoStart: () => Promise<boolean>;
  setLangflowAutoStart: (enabled: boolean) => Promise<boolean>;
  getAgentRecursionLimit: () => Promise<{ unlimited: boolean; limit: number | null }>;
  setAgentRecursionLimit: (payload: { unlimited?: boolean; limit?: number }) => Promise<boolean>;
  restartLangflow: () => Promise<unknown>;
  getWorkspace: () => Promise<string>;
  pickWorkspace: () => Promise<string>;
  pickProjectDirectory: () => Promise<string>;
  initProject: (dir: string) => Promise<string>;
  openProject: (dir: string) => Promise<string>;
  getRecentProjects: () => Promise<string[]>;
  getSidecarPort: () => Promise<number>;
};

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}
