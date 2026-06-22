import fs from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";

export interface TopologyPort {
  container: number;
  host?: number;
}

export interface TopologyNode {
  id: string;
  kind: "service" | "database" | "cache" | "gateway" | "worker";
  runtime?: string;
  engine?: string;
  image?: string | null;
  source?: string;
  dockerfile?: string;
  ports?: TopologyPort[];
}

export interface TopologyEdge {
  from: string;
  to: string;
  env?: Record<string, string>;
}

export interface TopologyTarget {
  id: string;
  type: "docker-compose" | "kubernetes" | "paas";
  env?: string;
}

export interface Topology {
  version: 1;
  project: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  targets: TopologyTarget[];
}

export async function fetchServerTopology(
  serverUrl: string,
  projectId?: string,
): Promise<Topology | null> {
  try {
    const base = serverUrl.replace(/\/$/, "");
    const query = projectId ? `?project=${encodeURIComponent(projectId)}` : "";
    const res = await fetch(`${base}/v1/topology${query}`);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as Topology;
  } catch {
    return null;
  }
}

export async function loadLocalTopology(projectRoot: string): Promise<Topology | null> {
  const topologyPath = path.join(projectRoot, ".agentflow/topology.yaml");
  try {
    const raw = await fs.readFile(topologyPath, "utf8");
    return yaml.parse(raw) as Topology;
  } catch {
    return null;
  }
}

export function projectIdFromRoot(projectRoot: string): string {
  return path.basename(projectRoot);
}

export async function resolveTopology(
  projectRoot: string,
  resourceServerUrl?: string,
  projectId?: string,
): Promise<Topology | null> {
  const local = await loadLocalTopology(projectRoot);
  if (local) {
    return local;
  }
  if (!resourceServerUrl) {
    return null;
  }
  const id = projectId ?? projectIdFromRoot(projectRoot);
  return fetchServerTopology(resourceServerUrl, id);
}

export function formatTopologyContextForPrompt(topology: Topology): string {
  if (!topology.nodes.length) {
    return "";
  }

  const lines = ["## Service Topology", ""];
  const adjacency = new Map<string, string[]>();

  for (const edge of topology.edges) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }

  for (const node of topology.nodes) {
    let label = node.id;
    if (node.engine) {
      label += ` (${node.engine})`;
    } else if (node.kind !== "service") {
      label += ` (${node.kind})`;
    }
    if (node.source) {
      label += ` [source: ${node.source}]`;
    }
    const deps = adjacency.get(node.id);
    if (deps?.length) {
      const depLabels = deps.map((depId) => {
        const depNode = topology.nodes.find((n) => n.id === depId);
        if (depNode?.engine) {
          return `${depId} (${depNode.engine})`;
        }
        return depId;
      });
      lines.push(`- ${label} → ${depLabels.join(", ")}`);
    } else {
      lines.push(`- ${label}`);
    }
  }

  if (topology.targets.length) {
    lines.push("");
    lines.push(
      `- targets: ${topology.targets.map((t) => `${t.id}=${t.type}`).join(", ")}`,
    );
  }

  return lines.join("\n");
}

export function combineResourceAndTopologyContext(
  resourceMarkdown: string,
  topologyMarkdown: string,
): string {
  return [resourceMarkdown, topologyMarkdown].filter((part) => part.trim()).join("\n\n");
}
