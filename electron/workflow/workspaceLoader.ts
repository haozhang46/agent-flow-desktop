import fs from "node:fs/promises";
import path from "node:path";
import { loadWorkflow, listWorkflows } from "./loader";
import { listComponentTypes } from "./componentTypeStore";
import { validateWorkspace, type WorkspaceDefinition } from "./workspaceSchema";

const WORKFLOWS_DIR = ".agentflow/workflows";
const LEGACY_WORKSPACES_DIR = ".agentflow/workspaces";

export type WorkspaceLoaderContext = {
  workspaceRoot: string;
  userDataRoot: string;
  workflowId?: string | null;
};

export function workspacesDir(
  projectRoot: string,
  workflowId: string,
  isLegacy: boolean,
): string {
  if (isLegacy) {
    return path.join(projectRoot, LEGACY_WORKSPACES_DIR);
  }
  return path.join(projectRoot, WORKFLOWS_DIR, workflowId, "workspaces");
}

export function workspacePath(
  projectRoot: string,
  workflowId: string,
  stepId: string,
  isLegacy: boolean,
): string {
  return path.join(workspacesDir(projectRoot, workflowId, isLegacy), `${stepId}.workspace.json`);
}

async function validateWithCustomTypes(
  def: unknown,
  ctx?: WorkspaceLoaderContext,
): Promise<WorkspaceDefinition> {
  if (!ctx) {
    return validateWorkspace(def);
  }
  const customTypes = await listComponentTypes({
    workspaceRoot: ctx.workspaceRoot,
    userDataRoot: ctx.userDataRoot,
    workflowId: ctx.workflowId,
  });
  return validateWorkspace(def, { customTypes });
}

export async function loadWorkspace(
  filePath: string,
  ctx?: WorkspaceLoaderContext,
): Promise<WorkspaceDefinition> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return validateWithCustomTypes(parsed, ctx);
}

export async function saveWorkspace(
  filePath: string,
  def: unknown,
  expectedStepId?: string,
  ctx?: WorkspaceLoaderContext,
): Promise<WorkspaceDefinition> {
  const validated = await validateWithCustomTypes(def, ctx);
  if (expectedStepId !== undefined && validated.stepId !== expectedStepId) {
    throw new Error(`Workspace stepId mismatch: expected ${expectedStepId}, got ${validated.stepId}`);
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(validated, null, 2), "utf8");
  return validated;
}

export async function resolveWorkflowLegacy(
  projectRoot: string,
  workflowId: string,
): Promise<boolean> {
  await loadWorkflow(projectRoot, workflowId);
  const list = await listWorkflows(projectRoot);
  const entry = list.find((w) => w.id === workflowId);
  if (!entry) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  return entry.isLegacy;
}

export async function listWorkspaces(
  projectRoot: string,
  workflowId: string,
  isLegacy: boolean,
): Promise<string[]> {
  const dir = workspacesDir(projectRoot, workflowId, isLegacy);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((ent) => ent.isFile() && ent.name.endsWith(".workspace.json"))
      .map((ent) => ent.name.replace(/\.workspace\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}
