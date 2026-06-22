import fs from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";
import {
  deleteFileTool,
  listDirEntries,
  listFilesRecursive,
  readFileTool,
  resolveWorkspacePath,
  writeFileTool,
} from "../executor/tools";
import { requireAgentflowMutation, requireAgentflowWriteConfirmation } from "./agentflowWriteGuard";
import { projectIdFromRoot } from "../resources/topology";
import { readGateResults, readPhaseOutput } from "../workflow/phases";
import { getResourceContext } from "../workflow/workflowService";
import {
  fetchOpsConfig,
  fetchOpsSummary,
  type OpsConfig,
  type OpsSummary,
} from "../resources/opsClient";

export async function workspaceListDir(workspaceRoot: string, relPath: string) {
  return listDirEntries(workspaceRoot, relPath);
}

export async function workspaceListFiles(workspaceRoot: string, relPath: string) {
  return listFilesRecursive(workspaceRoot, relPath);
}

export async function workspaceReadFile(workspaceRoot: string, relPath: string) {
  const content = await readFileTool(workspaceRoot, relPath);
  return { path: relPath, content };
}

export async function workspaceWriteFile(
  workspaceRoot: string,
  relPath: string,
  content: string,
  confirmed?: boolean,
) {
  requireAgentflowWriteConfirmation(relPath, confirmed);
  await writeFileTool(workspaceRoot, relPath, content);
  return { path: relPath, ok: true };
}

export async function workspaceDeletePath(
  workspaceRoot: string,
  relPath: string,
  confirmed?: boolean,
) {
  requireAgentflowWriteConfirmation(relPath, confirmed);
  await deleteFileTool(workspaceRoot, relPath);
  return { path: relPath, ok: true };
}

export async function workspaceReadPhase(workspaceRoot: string, stepId: string) {
  const content = await readPhaseOutput(workspaceRoot, stepId);
  return { stepId, content };
}

export async function workspaceReadGates(workspaceRoot: string, stepId: string) {
  const results = await readGateResults(workspaceRoot, stepId);
  return { stepId, results: results ?? [] };
}

interface DeploymentService {
  name: string;
  image?: string;
  ports?: string[];
}

interface DeploymentConfig {
  platform: "docker-compose" | "kubernetes" | "unknown";
  nodeCount?: number;
  hasNginx: boolean;
  services: DeploymentService[];
  databases: { name: string; type: string; host?: string; port?: number }[];
  caches: { name: string; type: string; host?: string; port?: number }[];
  composeFile?: string;
  workflowFiles: string[];
}

function detectPlatform(files: string[]): DeploymentConfig["platform"] {
  if (files.some((f) => f.includes("docker-compose") || f === "compose.yaml")) {
    return "docker-compose";
  }
  if (
    files.some(
      (f) =>
        f.startsWith("k8s/") ||
        f.startsWith("kubernetes/") ||
        f.startsWith("manifests/") ||
        f.endsWith("deployment.yaml") ||
        f.endsWith("deployment.yml"),
    )
  ) {
    return "kubernetes";
  }
  return "unknown";
}

async function readIfExists(workspaceRoot: string, relPath: string): Promise<string | null> {
  try {
    return await readFileTool(workspaceRoot, relPath);
  } catch {
    return null;
  }
}

function parseComposeServices(content: string): DeploymentService[] {
  try {
    const doc = yaml.parse(content) as {
      services?: Record<string, { image?: string; ports?: (string | number)[] }>;
    };
    if (!doc.services) return [];
    return Object.entries(doc.services).map(([name, svc]) => ({
      name,
      image: svc.image,
      ports: svc.ports?.map(String),
    }));
  } catch {
    return [];
  }
}

function countK8sReplicas(files: { path: string; content: string }[]): number | undefined {
  let total = 0;
  let found = false;
  for (const file of files) {
    const matches = file.content.matchAll(/replicas:\s*(\d+)/g);
    for (const match of matches) {
      total += Number(match[1]);
      found = true;
    }
  }
  return found ? total : undefined;
}

interface ServerDeploymentSummary {
  platform?: "docker-compose" | "kubernetes" | "unknown";
  services?: { name: string; image?: string; ports?: string[] }[];
  nodeCount?: number;
}

async function fetchServerDeploymentSummary(
  serverUrl: string,
  projectId: string,
): Promise<ServerDeploymentSummary | null> {
  try {
    const base = serverUrl.replace(/\/$/, "");
    const res = await fetch(
      `${base}/v1/deployment/summary?project=${encodeURIComponent(projectId)}`,
    );
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as ServerDeploymentSummary;
  } catch {
    return null;
  }
}

export async function workspaceDeploymentConfig(
  workspaceRoot: string,
  getResourceServerUrl?: () => string | null,
): Promise<DeploymentConfig> {
  const allFiles = await listFilesRecursive(workspaceRoot, ".", 1000);
  const paths = allFiles.map((f) => f.path);
  const platform = detectPlatform(paths);

  const composeCandidates = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
  ];
  let composeFile: string | undefined;
  let composeContent: string | null = null;
  for (const candidate of composeCandidates) {
    const content = await readIfExists(workspaceRoot, candidate);
    if (content) {
      composeFile = candidate;
      composeContent = content;
      break;
    }
  }

  const k8sFiles: { path: string; content: string }[] = [];
  for (const file of allFiles) {
    if (
      file.path.startsWith("k8s/") ||
      file.path.startsWith("kubernetes/") ||
      file.path.startsWith("manifests/") ||
      file.path.endsWith("deployment.yaml") ||
      file.path.endsWith("deployment.yml")
    ) {
      const content = await readIfExists(workspaceRoot, file.path);
      if (content) k8sFiles.push({ path: file.path, content });
    }
  }

  const services = composeContent ? parseComposeServices(composeContent) : [];
  const hasNginx =
    services.some((s) => /nginx/i.test(s.name)) ||
    paths.some((p) => /nginx/i.test(p)) ||
    k8sFiles.some((f) => /nginx/i.test(f.content));

  const workflowFiles = paths.filter(
    (p) => p.startsWith(".github/workflows/") && (p.endsWith(".yml") || p.endsWith(".yaml")),
  );

  const resourceCtx = await getResourceContext(workspaceRoot, getResourceServerUrl);
  const databases = resourceCtx.resources
    .filter((r) => /mysql|postgres|mongodb|mariadb/i.test(r.type))
    .map((r) => ({
      name: r.name,
      type: r.type,
      host: r.instance?.host,
      port: r.instance?.port,
    }));
  const caches = resourceCtx.resources
    .filter((r) => /redis|memcached/i.test(r.type))
    .map((r) => ({
      name: r.name,
      type: r.type,
      host: r.instance?.host,
      port: r.instance?.port,
    }));

  const serverUrl = getResourceServerUrl?.() ?? undefined;
  const serverSummary =
    serverUrl != null && serverUrl !== ""
      ? await fetchServerDeploymentSummary(serverUrl, projectIdFromRoot(workspaceRoot))
      : null;

  const resolvedPlatform =
    serverSummary?.platform && serverSummary.platform !== "unknown"
      ? serverSummary.platform
      : platform;
  const resolvedServices =
    serverSummary?.services?.length && services.length === 0
      ? serverSummary.services.map((svc) => ({
          name: svc.name,
          image: svc.image,
          ports: svc.ports,
        }))
      : services;
  const resolvedNodeCount =
    serverSummary?.nodeCount ??
    (resolvedPlatform === "kubernetes"
      ? countK8sReplicas(k8sFiles)
      : resolvedPlatform === "docker-compose"
        ? resolvedServices.length || undefined
        : undefined);

  return {
    platform: resolvedPlatform,
    nodeCount: resolvedNodeCount,
    hasNginx,
    services: resolvedServices,
    databases,
    caches,
    composeFile,
    workflowFiles,
  };
}

export async function workspaceOpsConfig(
  getResourceServerUrl?: () => string | null,
): Promise<OpsConfig | null> {
  const serverUrl = getResourceServerUrl?.()?.trim();
  if (!serverUrl) {
    return null;
  }
  return fetchOpsConfig(serverUrl);
}

export async function workspaceOpsSummary(
  workspaceRoot: string,
  getResourceServerUrl?: () => string | null,
): Promise<OpsSummary | null> {
  const serverUrl = getResourceServerUrl?.()?.trim();
  if (!serverUrl) {
    return null;
  }
  return fetchOpsSummary(serverUrl, workspaceRoot);
}

export async function workspaceFileExists(workspaceRoot: string, relPath: string): Promise<boolean> {
  try {
    await fs.access(resolveWorkspacePath(workspaceRoot, relPath));
    return true;
  } catch {
    return false;
  }
}
