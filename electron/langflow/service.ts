import fs from "node:fs/promises";
import path from "node:path";
import { compileLangflowJson, type LangflowJson } from "../workflow/compiler";
import type { WorkflowDefinition } from "../workflow/types";
import {
  checkHealth,
  createFlow,
  createProject,
  findProjectIdByName,
  getFlow,
  listFlows,
} from "./client";
import { getLangflowConfig } from "./config";
import { getLastLangflowStartDetail, getRuntimeMode } from "./manager";
import { readLangflowState, writeLangflowState } from "./store";
import type { LangflowFlowSummary, LangflowStatus } from "./types";

type LangflowFlowExport = {
  id: string;
  name: string;
  data: unknown;
};

function workspaceProjectName(projectRoot: string): string {
  const base = path.basename(projectRoot);
  return base || "agentflow-workspace";
}

export function mapLangflowExportToCompilerInput(flow: LangflowFlowExport): LangflowJson {
  const data =
    flow.data && typeof flow.data === "object"
      ? (flow.data as {
          nodes?: LangflowJson["nodes"];
          edges?: LangflowJson["edges"];
          resources?: LangflowJson["resources"];
        })
      : {};

  return {
    id: flow.id,
    title: flow.name,
    nodes: data.nodes ?? [],
    edges: data.edges ?? [],
    resources: data.resources,
  };
}

export function countStepNodes(langflowJson: LangflowJson): number {
  return (langflowJson.nodes ?? []).filter((node) => node.data?.metadata?.id).length;
}

export async function saveFlowExport(
  projectRoot: string,
  flow: LangflowFlowExport,
): Promise<string> {
  const flowsDir = path.join(projectRoot, ".agentflow/langflow/flows");
  await fs.mkdir(flowsDir, { recursive: true });
  const dest = path.join(flowsDir, `${flow.id}.json`);
  await fs.writeFile(dest, JSON.stringify(flow, null, 2), "utf8");
  return dest;
}

export async function getLangflowStatus(): Promise<LangflowStatus> {
  const config = await getLangflowConfig();
  const ok = await checkHealth(config);
  const mode = getRuntimeMode();
  const startDetail = getLastLangflowStartDetail();
  return {
    ok,
    baseUrl: config.baseUrl,
    mode: ok ? mode : "off",
    detail: ok ? undefined : (startDetail ?? "Langflow is unreachable"),
  };
}

export async function ensureWorkspaceProject(projectRoot: string): Promise<string | undefined> {
  const state = await readLangflowState(projectRoot);
  if (state.projectId) {
    return state.projectId;
  }

  const config = await getLangflowConfig();
  const name = workspaceProjectName(projectRoot);
  let projectId = await createProject(config, name);
  if (!projectId) {
    projectId = await findProjectIdByName(config, name);
  }
  if (projectId) {
    await writeLangflowState(projectRoot, { ...state, projectId });
  }
  return projectId;
}

export async function listWorkspaceFlows(
  projectRoot: string,
): Promise<{ flows: LangflowFlowSummary[]; activeFlowId?: string }> {
  const config = await getLangflowConfig();
  const state = await readLangflowState(projectRoot);
  const projectId = await ensureWorkspaceProject(projectRoot);
  const flows = await listFlows(config, projectId);
  return { flows, activeFlowId: state.activeFlowId };
}

export async function createWorkspaceFlow(
  projectRoot: string,
  name?: string,
): Promise<LangflowFlowSummary> {
  const config = await getLangflowConfig();
  const projectId = await ensureWorkspaceProject(projectRoot);
  const flowName = name ?? `flow-${Date.now()}`;
  return createFlow(config, flowName, projectId);
}

export async function setActiveWorkspaceFlow(
  projectRoot: string,
  flowId: string,
): Promise<WorkflowDefinition> {
  const config = await getLangflowConfig();
  const flow = await getFlow(config, flowId);
  const langflowJson = mapLangflowExportToCompilerInput(flow);

  if (countStepNodes(langflowJson) < 1) {
    throw new Error(
      "Flow has no step nodes with data.metadata.id — add at least one Agent Flow step node before syncing",
    );
  }

  await saveFlowExport(projectRoot, flow);

  const workflow = compileLangflowJson(langflowJson);
  const state = await readLangflowState(projectRoot);
  await writeLangflowState(projectRoot, {
    ...state,
    activeFlowId: flowId,
    lastSyncedAt: new Date().toISOString(),
  });
  return workflow;
}
