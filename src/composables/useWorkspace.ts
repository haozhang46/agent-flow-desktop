import type { WorkspaceFile, WorkspaceResponse } from "../types/workspace";

async function apiBase(): Promise<string> {
  const port = await window.desktop.getSidecarPort();
  return `http://127.0.0.1:${port}`;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${await apiBase()}${path}`, init);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${path} failed (${res.status}): ${detail}`);
  }
  return res.json() as Promise<T>;
}

export function useWorkspace() {
  async function fetchWorkspace(): Promise<WorkspaceResponse> {
    return apiJson("/v1/workspace");
  }

  async function saveWorkspace(file: WorkspaceFile): Promise<WorkspaceResponse> {
    return apiJson("/v1/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(file),
    });
  }

  return {
    fetchWorkspace,
    saveWorkspace,
  };
}
