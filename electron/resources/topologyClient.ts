import fs from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";
import type { ResourceInstance } from "./resolver";
import {
  projectIdFromRoot,
  type Topology,
  type TopologyEdge,
  type TopologyNode,
} from "./topology";

export class TopologyResourceClient {
  readonly projectId: string;

  constructor(
    serverUrl: string,
    projectId: string,
  ) {
    this.serverUrl = serverUrl;
    this.projectId = projectId;
  }

  private serverUrl: string;

  private baseUrl(): string {
    return this.serverUrl.replace(/\/$/, "");
  }

  private projectQuery(): string {
    return `?project=${encodeURIComponent(this.projectId)}`;
  }

  async getTopology(): Promise<Topology | null> {
    const res = await fetch(`${this.baseUrl()}/v1/topology${this.projectQuery()}`);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`topology_get failed (${res.status}): ${detail}`);
    }
    return (await res.json()) as Topology;
  }

  async saveTopology(topology: Topology): Promise<Topology> {
    const body: Topology = {
      version: 1,
      project: this.projectId,
      nodes: topology.nodes,
      edges: topology.edges,
      targets: topology.targets ?? [],
    };
    const res = await fetch(`${this.baseUrl()}/v1/topology${this.projectQuery()}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`topology_save failed (${res.status}): ${detail}`);
    }
    return (await res.json()) as Topology;
  }

  async importCompose(content: string): Promise<Topology> {
    const res = await fetch(`${this.baseUrl()}/v1/topology/import${this.projectQuery()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "compose", content }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`topology_import_compose failed (${res.status}): ${detail}`);
    }
    return (await res.json()) as Topology;
  }

  async exportCompose(): Promise<string> {
    const res = await fetch(`${this.baseUrl()}/v1/topology/export${this.projectQuery()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "compose" }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`topology_export_compose failed (${res.status}): ${detail}`);
    }
    const data = (await res.json()) as { content?: string };
    return data.content ?? "";
  }

  async getInstances(): Promise<Record<string, ResourceInstance>> {
    const res = await fetch(`${this.baseUrl()}/v1/resources/config${this.projectQuery()}`);
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`topology_resources_get failed (${res.status}): ${detail}`);
    }
    const data = (await res.json()) as { instances?: Record<string, ResourceInstance> };
    return data.instances ?? {};
  }
}

export function createTopologyClient(
  serverUrl: string | null | undefined,
  workspaceRoot: string,
  projectId?: string,
): TopologyResourceClient | null {
  const url = serverUrl?.trim();
  if (!url) {
    return null;
  }
  return new TopologyResourceClient(url, projectId ?? projectIdFromRoot(workspaceRoot));
}

export async function emptyTopology(projectId: string): Promise<Topology> {
  return {
    version: 1,
    project: projectId,
    nodes: [],
    edges: [],
    targets: [],
  };
}

export async function loadOrEmpty(client: TopologyResourceClient): Promise<Topology> {
  const existing = await client.getTopology();
  if (existing) {
    return existing;
  }
  return emptyTopology(client.projectId);
}

export async function writeLocalResourceInstances(
  workspaceRoot: string,
  instances: Record<string, ResourceInstance>,
): Promise<void> {
  const filePath = path.join(workspaceRoot, ".agentflow/resource-instances.yaml");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, yaml.stringify({ instances }), "utf8");
}

export type { TopologyNode, TopologyEdge };
