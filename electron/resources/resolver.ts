import fs from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";
import { projectIdFromRoot } from "./topology";
import { loadWorkflow } from "../workflow/loader";

export interface ResourceInstance {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  dsn?: string;
  [key: string]: string | number | undefined;
}

export interface ResolvedResource {
  type: string;
  name: string;
  optional?: boolean;
  instance?: ResourceInstance;
}

interface ResourceDeclaration {
  type: string;
  name: string;
  version?: string;
  optional?: boolean;
}

const RESOURCE_CONTEXT_STEP_IDS = new Set(["be-dev", "cicd", "test"]);

async function loadDeclarations(projectRoot: string): Promise<ResourceDeclaration[]> {
  const resourcesPath = path.join(projectRoot, ".agentflow/resources.yaml");
  try {
    const raw = await fs.readFile(resourcesPath, "utf8");
    const parsed = yaml.parse(raw) as { resources?: ResourceDeclaration[] };
    return parsed.resources ?? [];
  } catch {
    const workflow = await loadWorkflow(projectRoot);
    return workflow.resources ?? [];
  }
}

export async function fetchServerConfig(
  serverUrl: string,
  projectId?: string,
): Promise<Record<string, ResourceInstance>> {
  try {
    const base = serverUrl.replace(/\/$/, "");
    const query = projectId ? `?project=${encodeURIComponent(projectId)}` : "";
    const res = await fetch(`${base}/v1/resources/config${query}`);
    if (!res.ok) {
      return {};
    }
    const data = (await res.json()) as { instances?: Record<string, ResourceInstance> };
    return data.instances ?? {};
  } catch {
    return {};
  }
}

export async function loadLocalInstances(
  projectRoot: string,
): Promise<Record<string, ResourceInstance>> {
  const instancesPath = path.join(projectRoot, ".agentflow/resource-instances.yaml");
  try {
    const raw = await fs.readFile(instancesPath, "utf8");
    const parsed = yaml.parse(raw) as { instances?: Record<string, ResourceInstance> };
    return parsed.instances ?? {};
  } catch {
    return {};
  }
}

export async function resolveResources(
  projectRoot: string,
  resourceServerUrl?: string,
): Promise<ResolvedResource[]> {
  const declarations = await loadDeclarations(projectRoot);
  const projectId = projectIdFromRoot(projectRoot);
  const serverInstances = resourceServerUrl
    ? await fetchServerConfig(resourceServerUrl, projectId)
    : {};
  const localInstances = await loadLocalInstances(projectRoot);
  const mergedInstances = { ...serverInstances, ...localInstances };

  return declarations.map((decl) => ({
    type: decl.type,
    name: decl.name,
    optional: decl.optional,
    instance: mergedInstances[decl.name],
  }));
}

export function formatResourceContextForPrompt(resources: ResolvedResource[]): string {
  if (resources.length === 0) {
    return "";
  }

  const lines = [
    "## Available Server Resources",
    "Use these when generating or updating backend configuration files.",
    "",
  ];

  for (const resource of resources) {
    const instance = resource.instance;
    if (!instance || Object.keys(instance).length === 0) {
      lines.push(`- ${resource.type}/${resource.name} (declared, no connection details)`);
      continue;
    }

    const parts: string[] = [];
    for (const [key, value] of Object.entries(instance)) {
      if (value !== undefined) {
        parts.push(`${key}=${value}`);
      }
    }
    lines.push(`- ${resource.type}/${resource.name}: ${parts.join(" ")}`);
  }

  return lines.join("\n");
}

export function stepNeedsResourceContext(
  stepId: string,
  requiresResources: string[] | undefined,
): boolean {
  return (requiresResources?.length ?? 0) > 0 || RESOURCE_CONTEXT_STEP_IDS.has(stepId);
}
