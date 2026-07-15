import type {
  AnalyzeProgress,
  GraphSummary,
  KnowledgeGraph,
  UaStatus,
  WorkflowDraft,
} from "../types/ua";

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

export function useUa() {
  async function fetchStatus(): Promise<UaStatus> {
    return apiJson("/v1/ua/status");
  }

  async function fetchSummary(): Promise<GraphSummary> {
    return apiJson("/v1/ua/summary");
  }

  async function fetchGraph(): Promise<KnowledgeGraph> {
    return apiJson("/v1/ua/graph");
  }

  async function startAnalyze(options?: {
    forceFull?: boolean;
  }): Promise<{ started: boolean }> {
    return apiJson("/v1/ua/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forceFull: options?.forceFull === true }),
    });
  }

  async function cancelAnalyze(): Promise<{ cancelled: boolean }> {
    return apiJson("/v1/ua/analyze/cancel", { method: "POST" });
  }

  async function pollProgress(): Promise<AnalyzeProgress | null> {
    const res = await fetch(`${await apiBase()}/v1/ua/analyze/progress`);
    if (res.status === 204) return null;
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`/v1/ua/analyze/progress failed (${res.status}): ${detail}`);
    }
    return res.json() as Promise<AnalyzeProgress>;
  }

  async function generateWorkflow(
    goal?: string | null,
  ): Promise<{ draft: WorkflowDraft }> {
    return apiJson("/v1/ua/generate-workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: goal?.trim() ? goal.trim() : undefined }),
    });
  }

  async function applyWorkflow(
    draft: WorkflowDraft,
    options?: { activate?: boolean },
  ): Promise<{ workflowId: string }> {
    return apiJson("/v1/ua/apply-workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draft,
        activate: options?.activate === true,
      }),
    });
  }

  return {
    fetchStatus,
    fetchSummary,
    fetchGraph,
    startAnalyze,
    cancelAnalyze,
    generateWorkflow,
    applyWorkflow,
    pollProgress,
  };
}
