import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "yaml";
import { WorkflowSchema, type WorkflowDefinition } from "./types";

function moduleDir(): string {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }
  return path.dirname(fileURLToPath(import.meta.url));
}

export interface WorkflowSummary {
  id: string;
  title: string;
  isLegacy: boolean;
}

export interface TemplateSummary {
  id: string;
  title: string;
  source: "builtin" | "user";
}

const AGENTFLOW_DIR = ".agentflow";
const ACTIVE_FILE = `${AGENTFLOW_DIR}/active-workflow.json`;
const WORKFLOWS_DIR = `${AGENTFLOW_DIR}/workflows`;

async function agentflowExists(projectRoot: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(projectRoot, AGENTFLOW_DIR));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export function templatesRoot(): string {
  return path.join(moduleDir(), "../../templates");
}

export function userTemplatesRoot(): string {
  return path.join(os.homedir(), ".agentflow/templates");
}

export function workflowYamlPath(
  projectRoot: string,
  workflowId: string,
  isLegacy: boolean,
): string {
  if (isLegacy) {
    return path.join(projectRoot, ".agentflow/workflow.yaml");
  }
  return path.join(projectRoot, WORKFLOWS_DIR, workflowId, "workflow.yaml");
}

export async function loadWorkflowFile(yamlPath: string): Promise<WorkflowDefinition> {
  const raw = await fs.readFile(yamlPath, "utf8");
  return WorkflowSchema.parse(yaml.parse(raw));
}

async function readTemplateTitle(templateDir: string, templateId: string): Promise<string> {
  try {
    const wf = await loadWorkflowFile(path.join(templateDir, templateId, "workflow.yaml"));
    return wf.title;
  } catch {
    return templateId;
  }
}

async function listTemplateIds(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const ids: string[] = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const yamlPath = path.join(root, ent.name, "workflow.yaml");
      try {
        await fs.access(yamlPath);
        ids.push(ent.name);
      } catch {
        // skip dirs without workflow.yaml
      }
    }
    return ids;
  } catch {
    return [];
  }
}

export async function listTemplates(): Promise<TemplateSummary[]> {
  const out: TemplateSummary[] = [];
  const seen = new Set<string>();

  for (const id of await listTemplateIds(templatesRoot())) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title: await readTemplateTitle(templatesRoot(), id),
      source: "builtin",
    });
  }

  for (const id of await listTemplateIds(userTemplatesRoot())) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title: await readTemplateTitle(userTemplatesRoot(), id),
      source: "user",
    });
  }

  return out;
}

export async function listWorkflows(projectRoot: string): Promise<WorkflowSummary[]> {
  const out: WorkflowSummary[] = [];

  const legacyPath = path.join(projectRoot, ".agentflow/workflow.yaml");
  try {
    const wf = await loadWorkflowFile(legacyPath);
    out.push({ id: wf.id, title: wf.title, isLegacy: true });
  } catch {
    // no legacy workflow
  }

  const workflowsDir = path.join(projectRoot, WORKFLOWS_DIR);
  try {
    const entries = await fs.readdir(workflowsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const yamlPath = path.join(workflowsDir, ent.name, "workflow.yaml");
      try {
        const wf = await loadWorkflowFile(yamlPath);
        out.push({ id: wf.id, title: wf.title, isLegacy: false });
      } catch {
        // skip invalid entries
      }
    }
  } catch {
    // no workflows directory
  }

  return out;
}

export async function getActiveWorkflowId(projectRoot: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(projectRoot, ACTIVE_FILE), "utf8");
    const parsed = JSON.parse(raw) as { workflowId?: string };
    if (parsed.workflowId) {
      const list = await listWorkflows(projectRoot);
      if (list.some((w) => w.id === parsed.workflowId)) {
        return parsed.workflowId;
      }
    }
  } catch {
    // fall through
  }

  const list = await listWorkflows(projectRoot);
  if (list.length > 0) {
    return list[0].id;
  }

  throw new Error("No workflows configured");
}

export async function setActiveWorkflowId(
  projectRoot: string,
  workflowId: string,
): Promise<void> {
  const list = await listWorkflows(projectRoot);
  if (!list.some((w) => w.id === workflowId)) {
    throw new Error(`Unknown workflow: ${workflowId}`);
  }
  const dest = path.join(projectRoot, ACTIVE_FILE);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, JSON.stringify({ workflowId }, null, 2), "utf8");
}

function findWorkflowEntry(
  list: WorkflowSummary[],
  workflowId: string,
): WorkflowSummary | undefined {
  return list.find((w) => w.id === workflowId);
}

export async function loadWorkflow(
  projectRoot: string,
  workflowId?: string,
): Promise<WorkflowDefinition> {
  let list = await listWorkflows(projectRoot);
  const id = workflowId ?? (await getActiveWorkflowId(projectRoot));
  let entry = findWorkflowEntry(list, id);

  if (!entry) {
    if (list.length === 0) {
      const fallback = path.join(templatesRoot(), "default-dev-cicd/workflow.yaml");
      return loadWorkflowFile(fallback);
    }
    throw new Error(`Workflow not found: ${id}`);
  }

  return loadWorkflowFile(workflowYamlPath(projectRoot, entry.id, entry.isLegacy));
}

export async function saveWorkflow(
  projectRoot: string,
  workflowId: string,
  definition: WorkflowDefinition,
): Promise<void> {
  const parsed = WorkflowSchema.parse(definition);
  if (parsed.id !== workflowId) {
    throw new Error("Workflow id mismatch");
  }

  const list = await listWorkflows(projectRoot);
  const entry = findWorkflowEntry(list, workflowId);
  if (!entry) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const dest = workflowYamlPath(projectRoot, workflowId, entry.isLegacy);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, yaml.stringify(parsed), "utf8");
}

async function resolveNewWorkflowId(projectRoot: string, baseId: string): Promise<string> {
  const existing = new Set((await listWorkflows(projectRoot)).map((w) => w.id));
  if (!existing.has(baseId)) {
    return baseId;
  }
  let n = 2;
  while (existing.has(`${baseId}-${n}`)) {
    n += 1;
  }
  return `${baseId}-${n}`;
}

async function copyTemplateDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      await fs.cp(from, to, { recursive: true });
    } else {
      await fs.copyFile(from, to);
    }
  }
}

export async function createWorkflowFromTemplate(
  projectRoot: string,
  templateId: string,
  newId?: string,
): Promise<string> {
  const builtin = path.join(templatesRoot(), templateId);
  const user = path.join(userTemplatesRoot(), templateId);
  let src = builtin;
  try {
    await fs.access(path.join(builtin, "workflow.yaml"));
  } catch {
    try {
      await fs.access(path.join(user, "workflow.yaml"));
      src = user;
    } catch {
      throw new Error(`Template not found: ${templateId}`);
    }
  }

  const baseId = newId ?? templateId;
  const workflowId = await resolveNewWorkflowId(projectRoot, baseId);
  const dest = path.join(projectRoot, WORKFLOWS_DIR, workflowId);
  await copyTemplateDir(src, dest);

  const yamlPath = path.join(dest, "workflow.yaml");
  const wf = await loadWorkflowFile(yamlPath);
  if (wf.id !== workflowId) {
    wf.id = workflowId;
    await fs.writeFile(yamlPath, yaml.stringify(wf), "utf8");
  }

  return workflowId;
}

export async function deleteWorkflow(
  projectRoot: string,
  workflowId: string,
): Promise<void> {
  const list = await listWorkflows(projectRoot);
  const entry = findWorkflowEntry(list, workflowId);
  if (!entry) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  if (entry.isLegacy) {
    throw new Error("Cannot delete legacy root workflow");
  }

  const activeId = await getActiveWorkflowId(projectRoot);
  if (activeId === workflowId) {
    throw new Error("Cannot delete active workflow");
  }

  await fs.rm(path.join(projectRoot, WORKFLOWS_DIR, workflowId), {
    recursive: true,
    force: true,
  });
}

export async function initProjectFromTemplate(
  projectRoot: string,
  templateId: string,
): Promise<void> {
  if (await agentflowExists(projectRoot)) return;
  const src = path.join(templatesRoot(), templateId);
  const dest = path.join(projectRoot, AGENTFLOW_DIR);
  await fs.cp(src, dest, { recursive: true });
}

/** Ensure project has at least one workflow YAML (copy template only when .agentflow is missing). */
export async function ensureProjectWorkflow(
  projectRoot: string,
  templateId = "default-dev-cicd",
): Promise<string> {
  if (await agentflowExists(projectRoot)) {
    const list = await listWorkflows(projectRoot);
    if (list.length > 0) {
      try {
        return await getActiveWorkflowId(projectRoot);
      } catch {
        return list[0].id;
      }
    }
    throw new Error("No workflows configured");
  }

  await initProjectFromTemplate(projectRoot, templateId);
  return templateId;
}
