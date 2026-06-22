import type { WorkspaceDefinition, WorkspaceRegistryEntry } from "../workspace/registry";
import { confirmAgentflowMutation } from "../utils/confirmAgentflowWrite";

export interface WorkspaceListResponse {
  workflowId: string;
  stepIds: string[];
}

export interface WorkspaceRegistryResponse {
  components: WorkspaceRegistryEntry[];
}

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

export type SaveWorkspaceOptions = {
  confirmed?: boolean;
};

export function useWorkspaceConfig() {
  async function fetchWorkspace(workflowId: string, stepId: string): Promise<WorkspaceDefinition> {
    return apiJson(
      `/v1/workflows/${encodeURIComponent(workflowId)}/workspaces/${encodeURIComponent(stepId)}`,
    );
  }

  async function saveWorkspace(
    workflowId: string,
    stepId: string,
    definition: WorkspaceDefinition,
    options: SaveWorkspaceOptions = {},
  ): Promise<WorkspaceDefinition> {
    if (!options.confirmed) {
      const ok = confirmAgentflowMutation(
        `Save workspace for step "${stepId}" (${workflowId})`,
      );
      if (!ok) throw new Error("user_denied");
    }
    return apiJson(
      `/v1/workflows/${encodeURIComponent(workflowId)}/workspaces/${encodeURIComponent(stepId)}?confirmed=1`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(definition),
      },
    );
  }

  async function fetchRegistry(): Promise<WorkspaceRegistryResponse> {
    return apiJson("/v1/workspace/registry");
  }

  async function listWorkspaces(workflowId: string): Promise<WorkspaceListResponse> {
    return apiJson(`/v1/workflows/${encodeURIComponent(workflowId)}/workspaces`);
  }

  return {
    fetchWorkspace,
    saveWorkspace,
    fetchRegistry,
    listWorkspaces,
  };
}
