import yaml from "yaml";
import type { Topology, TopologyNode } from "./topology";

export type NodeAccessMode = "host-ssh" | "managed-instance";

export interface NodeAccess {
  mode: NodeAccessMode;
  hostRef?: string;
  deployRef?: string;
  service?: string;
  instanceRef?: string;
  logUrl?: string;
}

export interface TopologyNodeWithAccess extends TopologyNode {
  access?: NodeAccess;
}

export interface TopologyWithAccess extends Omit<Topology, "nodes"> {
  nodes: TopologyNodeWithAccess[];
}

export interface OpsHost {
  id: string;
  host?: string;
  port?: number;
  user?: string;
  identityRef?: string;
}

export interface DeployProfile {
  id: string;
  type: "docker-compose" | "kubernetes";
  workdir?: string;
  commands?: {
    status?: string;
    deploy?: string;
    deployAll?: string;
    logs?: string;
    logsSnapshot?: string;
  };
}

export interface LogPolicy {
  strategy: "A1";
  persist: boolean;
  defaultTailLines: number;
  maxFilesPerNode: number;
  clientFilter: boolean;
  externalLogUrl?: string | null;
}

export interface OpsConfig {
  version: 1;
  hosts: OpsHost[];
  deployProfiles: DeployProfile[];
  logPolicy: LogPolicy;
}

export interface WorkspaceOpsBundle {
  topology: TopologyWithAccess;
  ops: OpsConfig;
  created: {
    topology: boolean;
    ops: boolean;
  };
}

export function defaultOpsConfig(): OpsConfig {
  return {
    version: 1,
    hosts: [],
    deployProfiles: [],
    logPolicy: {
      strategy: "A1",
      persist: true,
      defaultTailLines: 200,
      maxFilesPerNode: 30,
      clientFilter: true,
      externalLogUrl: null,
    },
  };
}

export function defaultTopology(projectId: string): TopologyWithAccess {
  return {
    version: 1,
    project: projectId,
    nodes: [],
    edges: [],
    targets: [{ id: "dev", type: "docker-compose", env: "dev" }],
  };
}

export function serializeOpsConfig(ops: OpsConfig): string {
  return yaml.stringify(ops);
}

export function parseOpsConfig(raw: string): OpsConfig {
  const parsed = yaml.parse(raw) as Partial<OpsConfig>;
  return {
    version: 1,
    hosts: parsed.hosts ?? [],
    deployProfiles: parsed.deployProfiles ?? [],
    logPolicy: {
      ...defaultOpsConfig().logPolicy,
      ...(parsed.logPolicy ?? {}),
    },
  };
}
