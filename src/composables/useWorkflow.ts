import { parseSseStream, type SseEvent } from "@agent-flow/shared-ui";
import {
  confirmAgentflowWrite,
  shouldConfirmAgentflowPath,
} from "../utils/confirmAgentflowWrite";

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped" | "gate_failed";

export interface WorkflowSummary {
  id: string;
  title: string;
  isLegacy: boolean;
  isActive?: boolean;
}

export interface TemplateSummary {
  id: string;
  title: string;
  source: "builtin" | "user";
}

export interface WorkflowListResponse {
  workflows: WorkflowSummary[];
  activeWorkflowId: string | null;
}

export interface WorkflowStep {
  id: string;
  title: string;
  executor: string;
  skills: string[];
  outputs: string[];
  gate?: string;
}

export interface WorkflowDefinition {
  version: 1;
  id: string;
  title: string;
  steps: WorkflowStep[];
  edges: { from: string; to: string }[];
  resources?: { type: string; name: string; optional?: boolean }[];
}

export interface WorkflowRunState {
  workflowId: string;
  currentStepId: string;
  stepStatuses: Record<string, StepStatus>;
  threadId: string;
}

export interface WorkspaceEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

export interface GateResult {
  id: string;
  status: "PASS" | "FAIL" | "SKIP";
  message?: string;
}

export interface ResolvedResource {
  type: string;
  name: string;
  optional?: boolean;
  instance?: Record<string, string | number | undefined>;
}

export interface DeploymentConfig {
  platform: "docker-compose" | "kubernetes" | "unknown";
  nodeCount?: number;
  hasNginx: boolean;
  services: { name: string; image?: string; ports?: string[] }[];
  databases: { name: string; type: string; host?: string; port?: number }[];
  caches: { name: string; type: string; host?: string; port?: number }[];
  composeFile?: string;
  workflowFiles: string[];
}

export interface OpsConfig {
  portainerUrl?: string | null;
  mesheryUrl?: string | null;
}

export interface DockerOpsSummary {
  configured: boolean;
  reachable: boolean;
  stackCount?: number | null;
  runningContainers?: number | null;
  endpointCount?: number | null;
  error?: string | null;
}

export interface KubernetesOpsSummary {
  configured: boolean;
  reachable: boolean;
  version?: string | null;
  connectionCount?: number | null;
  error?: string | null;
}

export interface OpsSummary {
  docker: DockerOpsSummary;
  kubernetes: KubernetesOpsSummary;
  intentNodeCount?: number | null;
}

export interface TopologyNode {
  id: string;
  kind: string;
  engine?: string;
  source?: string;
  dockerfile?: string;
}

export interface TopologyEdge {
  from: string;
  to: string;
  env?: Record<string, string>;
}

export interface Topology {
  version: 1;
  project: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  targets: { id: string; type: string; env?: string }[];
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

export function useWorkflow() {
  function workflowQuery(workflowId?: string): string {
    return workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : "";
  }

  async function fetchWorkflowList(): Promise<WorkflowListResponse> {
    return apiJson("/v1/workflows");
  }

  async function fetchTemplates(): Promise<{ templates: TemplateSummary[] }> {
    return apiJson("/v1/workflows/templates");
  }

  async function fetchWorkflow(workflowId?: string): Promise<WorkflowDefinition> {
    return apiJson(`/v1/workflows/current${workflowQuery(workflowId)}`);
  }

  async function fetchState(workflowId?: string): Promise<WorkflowRunState> {
    return apiJson(`/v1/workflow/state${workflowQuery(workflowId)}`);
  }

  async function saveWorkflow(
    workflowId: string,
    definition: WorkflowDefinition,
  ): Promise<WorkflowDefinition> {
    return apiJson(`/v1/workflows/${encodeURIComponent(workflowId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(definition),
    });
  }

  async function createFromTemplate(
    templateId: string,
    newId?: string,
  ): Promise<{ workflowId: string }> {
    return apiJson("/v1/workflows/from-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, newId }),
    });
  }

  async function activateWorkflow(workflowId: string): Promise<{ workflowId: string; active: boolean }> {
    return apiJson(`/v1/workflows/${encodeURIComponent(workflowId)}/activate`, {
      method: "POST",
    });
  }

  async function deleteWorkflow(workflowId: string): Promise<{ deleted: string }> {
    return apiJson(`/v1/workflows/${encodeURIComponent(workflowId)}`, {
      method: "DELETE",
    });
  }

  async function fetchSkills(): Promise<string[]> {
    return apiJson("/v1/skills");
  }

  async function fetchResourceContext(): Promise<{
    markdown: string;
    resources: ResolvedResource[];
    topology: Topology | null;
  }> {
    return apiJson("/v1/resources/context");
  }

  async function fetchTopology(): Promise<{ topology: Topology | null }> {
    return apiJson("/v1/resources/topology");
  }

  async function fetchPhase(stepId: string): Promise<{ stepId: string; content: string | null }> {
    return apiJson(`/v1/workflow/phase?stepId=${encodeURIComponent(stepId)}`);
  }

  async function fetchGates(stepId: string): Promise<{ stepId: string; results: GateResult[] }> {
    return apiJson(`/v1/workflow/gates?stepId=${encodeURIComponent(stepId)}`);
  }

  async function fetchDeploymentConfig(): Promise<DeploymentConfig> {
    return apiJson("/v1/workspace/deployment");
  }

  async function fetchOpsConfig(): Promise<OpsConfig> {
    return apiJson("/v1/ops/config");
  }

  async function fetchOpsSummary(): Promise<OpsSummary> {
    return apiJson("/v1/ops/summary");
  }

  async function listWorkspace(
    relPath: string,
    recursive = false,
  ): Promise<{ path: string; entries: WorkspaceEntry[]; exists?: boolean }> {
    const q = new URLSearchParams({ path: relPath });
    if (recursive) q.set("recursive", "1");
    return apiJson(`/v1/workspace/list?${q}`);
  }

  async function readWorkspaceFile(relPath: string): Promise<{ path: string; content: string }> {
    return apiJson(`/v1/workspace/file?path=${encodeURIComponent(relPath)}`);
  }

  async function writeWorkspaceFile(
    relPath: string,
    content: string,
    options: { confirmed?: boolean } = {},
  ): Promise<void> {
    if (!options.confirmed && shouldConfirmAgentflowPath(relPath)) {
      const ok = confirmAgentflowWrite(relPath);
      if (!ok) throw new Error("user_denied");
    }
    await apiJson("/v1/workspace/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: relPath, content, confirmed: true }),
    });
  }

  async function deleteWorkspacePath(
    relPath: string,
    options: { confirmed?: boolean } = {},
  ): Promise<void> {
    if (!options.confirmed && shouldConfirmAgentflowPath(relPath)) {
      const ok = confirmAgentflowWrite(relPath, `Delete ${relPath}`);
      if (!ok) throw new Error("user_denied");
    }
    await apiJson(
      `/v1/workspace/file?path=${encodeURIComponent(relPath)}&confirmed=1`,
      {
        method: "DELETE",
      },
    );
  }

  async function advance(
    action: "continue" | "skip" | "retry",
    workflowId?: string,
  ): Promise<WorkflowRunState> {
    return apiJson("/v1/workflow/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, workflowId }),
    });
  }

  async function* runStep(
    stepId?: string,
    skills?: string[],
    workflowId?: string,
    message?: string,
  ): AsyncGenerator<SseEvent> {
    const body: Record<string, unknown> = {};
    if (stepId) body.stepId = stepId;
    if (skills?.length) body.skills = skills;
    if (workflowId) body.workflowId = workflowId;
    if (message) body.message = message;

    const res = await fetch(`${await apiBase()}/v1/workflow/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Workflow run failed: ${res.status}`);
    }
    console.log("runStep", res.body);
    yield* parseSseStream(res.body);
  }

  async function initWorkflow(templateId = "default-dev-cicd"): Promise<{ workflowId: string }> {
    const res = await apiJson<{ workflowId: string }>("/v1/workflows/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId }),
    });
    return res;
  }

  return {
    fetchWorkflowList,
    fetchTemplates,
    fetchWorkflow,
    fetchState,
    saveWorkflow,
    createFromTemplate,
    initWorkflow,
    activateWorkflow,
    deleteWorkflow,
    fetchSkills,
    fetchResourceContext,
    fetchTopology,
    fetchPhase,
    fetchGates,
    fetchDeploymentConfig,
    fetchOpsConfig,
    fetchOpsSummary,
    listWorkspace,
    readWorkspaceFile,
    writeWorkspaceFile,
    deleteWorkspacePath,
    advance,
    runStep,
  };
}

export function stepReportPath(stepId: string): string | null {
  const map: Record<string, string> = {
    test: "test-report.md",
    review: "review-notes.md",
    "test-2": "regression-report.md",
  };
  return map[stepId] ?? null;
}
