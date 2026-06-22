import {
  ensureWorkspaceOpsConfig,
  loadWorkspaceOps,
  saveWorkspaceOps,
} from "../resources/opsBootstrap";
import { fetchLogSnapshot, listOpsLogFiles, readOpsLogFile } from "../resources/opsLogs";
import {
  fetchNodeStatus,
  runDeployAll,
  runNodeDeploy,
  runSshExec,
  startLogStream,
} from "../resources/opsActions";
import { readOpsAudit } from "../resources/opsAuditRead";
import { syncTopologyToServer } from "../resources/opsSync";
import type { OpsConfig, TopologyNodeWithAccess, TopologyWithAccess } from "../resources/opsTypes";

function findNode(bundle: Awaited<ReturnType<typeof loadWorkspaceOps>>, nodeId: string) {
  const node = bundle.topology.nodes.find((n) => n.id === nodeId) as
    | TopologyNodeWithAccess
    | undefined;
  if (!node) throw new Error(`Unknown node: ${nodeId}`);
  return { bundle, node };
}

export async function workspaceOpsBootstrap(
  workspaceRoot: string,
  getResourceServerUrl?: () => string | null,
) {
  return ensureWorkspaceOpsConfig(workspaceRoot, getResourceServerUrl?.() ?? null);
}

export async function workspaceOpsLoad(workspaceRoot: string) {
  return loadWorkspaceOps(workspaceRoot);
}

export async function workspaceOpsSave(
  workspaceRoot: string,
  topology: TopologyWithAccess,
  ops: OpsConfig,
) {
  await saveWorkspaceOps(workspaceRoot, topology, ops);
  return { ok: true };
}

export async function workspaceOpsLogFiles(workspaceRoot: string, nodeId?: string) {
  return listOpsLogFiles(workspaceRoot, nodeId);
}

export async function workspaceOpsLogSnapshot(workspaceRoot: string, nodeId: string) {
  const { bundle, node } = findNode(await loadWorkspaceOps(workspaceRoot), nodeId);
  return fetchLogSnapshot(workspaceRoot, node, bundle.ops);
}

export async function workspaceOpsLogRead(_workspaceRoot: string, relPath: string) {
  const content = await readOpsLogFile(relPath);
  return { content };
}

export async function workspaceOpsNodeStatus(workspaceRoot: string, nodeId: string) {
  const { bundle, node } = findNode(await loadWorkspaceOps(workspaceRoot), nodeId);
  return fetchNodeStatus(workspaceRoot, node, bundle.ops);
}

export async function workspaceOpsDeployNode(workspaceRoot: string, nodeId: string) {
  const { bundle, node } = findNode(await loadWorkspaceOps(workspaceRoot), nodeId);
  return runNodeDeploy(workspaceRoot, node, bundle.ops);
}

export async function workspaceOpsDeployAll(workspaceRoot: string) {
  const bundle = await loadWorkspaceOps(workspaceRoot);
  return runDeployAll(workspaceRoot, bundle.ops);
}

export async function workspaceOpsSshExec(
  workspaceRoot: string,
  hostRef: string,
  command: string,
) {
  const bundle = await loadWorkspaceOps(workspaceRoot);
  return runSshExec(bundle.ops, hostRef, command);
}

export function workspaceOpsStartLogStream(
  node: TopologyNodeWithAccess,
  ops: OpsConfig,
  onChunk: (text: string) => void,
) {
  return startLogStream(node, ops, onChunk);
}

export async function workspaceOpsBundleForStream(workspaceRoot: string, nodeId: string) {
  return findNode(await loadWorkspaceOps(workspaceRoot), nodeId);
}

export async function workspaceOpsAudit(workspaceRoot: string, limit?: number) {
  const entries = await readOpsAudit(workspaceRoot, limit ?? 50);
  return { entries };
}

export async function workspaceOpsSyncToServer(
  workspaceRoot: string,
  resourceServerUrl: string | null | undefined,
) {
  const url = resourceServerUrl?.trim();
  if (!url) {
    throw new Error("Resource Server URL is not configured");
  }
  const bundle = await loadWorkspaceOps(workspaceRoot);
  const saved = await syncTopologyToServer(workspaceRoot, url, bundle.topology);
  return { topology: saved };
}
