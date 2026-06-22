import type { OpsConfig, TopologyNodeWithAccess } from "../composables/useTopologyOps";
import type { TopologyEdge, TopologyNode } from "../../electron/resources/topology";

export const NODE_KINDS: TopologyNode["kind"][] = [
  "service",
  "database",
  "cache",
  "gateway",
  "worker",
];

export function isValidNodeId(id: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id.trim());
}

export function defaultAccessForKind(
  kind: TopologyNode["kind"],
  nodeId: string,
): TopologyNodeWithAccess["access"] {
  if (kind === "database" || kind === "cache") {
    return { mode: "managed-instance", instanceRef: nodeId };
  }
  return {
    mode: "host-ssh",
    hostRef: "vps-dev",
    deployRef: "compose-dev",
    service: nodeId,
  };
}

export function ensureOpsPlaceholders(ops: OpsConfig, node: TopologyNodeWithAccess): OpsConfig {
  if (node.access?.mode !== "host-ssh") {
    return ops;
  }
  const next = {
    ...ops,
    hosts: [...ops.hosts],
    deployProfiles: [...ops.deployProfiles],
  };
  const hostRef = node.access.hostRef ?? "vps-dev";
  if (!next.hosts.some((h) => h.id === hostRef)) {
    next.hosts.push({ id: hostRef, host: "", port: 22, user: "deploy" });
  }
  const deployRef = node.access.deployRef ?? "compose-dev";
  if (!next.deployProfiles.some((p) => p.id === deployRef)) {
    next.deployProfiles.push({
      id: deployRef,
      type: "docker-compose",
      workdir: "/opt/app",
      commands: {
        status: "docker compose ps",
        deploy: "docker compose up -d --build {{service}}",
        deployAll: "docker compose up -d --build",
        logs: "docker compose logs -f --tail=200 {{service}}",
        logsSnapshot: "docker compose logs --tail=500 {{service}}",
      },
    });
  }
  return next;
}

export function removeNodeFromTopology(
  nodes: TopologyNodeWithAccess[],
  edges: TopologyEdge[],
  nodeId: string,
): { nodes: TopologyNodeWithAccess[]; edges: TopologyEdge[] } {
  return {
    nodes: nodes.filter((n) => n.id !== nodeId),
    edges: edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
  };
}

export function upsertNode(
  nodes: TopologyNodeWithAccess[],
  node: TopologyNodeWithAccess,
  previousId?: string,
): TopologyNodeWithAccess[] {
  const id = previousId ?? node.id;
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx >= 0) {
    const next = [...nodes];
    next[idx] = node;
    return next;
  }
  return [...nodes, node];
}
