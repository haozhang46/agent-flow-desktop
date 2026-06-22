import fs from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";
import { importComposeToTopology } from "./composeImport";
import {
  defaultOpsConfig,
  defaultTopology,
  parseOpsConfig,
  serializeOpsConfig,
  type OpsConfig,
  type TopologyWithAccess,
  type WorkspaceOpsBundle,
} from "./opsTypes";
import { fetchServerTopology, loadLocalTopology, projectIdFromRoot } from "./topology";

const COMPOSE_CANDIDATES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
];

const AGENTFLOW = ".agentflow";
const TOPOLOGY_FILE = "topology.yaml";
const OPS_FILE = "ops.yaml";
const OPS_LOGS_DIR = "ops-logs";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readComposeFromProject(projectRoot: string): Promise<string | null> {
  for (const name of COMPOSE_CANDIDATES) {
    const full = path.join(projectRoot, name);
    try {
      return await fs.readFile(full, "utf8");
    } catch {
      continue;
    }
  }
  return null;
}

interface ResourceDeclaration {
  type: string;
  name: string;
  optional?: boolean;
}

async function topologyFromResources(projectRoot: string, projectId: string): Promise<TopologyWithAccess | null> {
  const resourcesPath = path.join(projectRoot, AGENTFLOW, "resources.yaml");
  try {
    const raw = await fs.readFile(resourcesPath, "utf8");
    const parsed = yaml.parse(raw) as { resources?: ResourceDeclaration[] };
    const resources = parsed.resources ?? [];
    if (!resources.length) return null;

    const topo = defaultTopology(projectId);
    for (const res of resources) {
      const kind = /redis|memcached/i.test(res.type)
        ? "cache"
        : /mysql|postgres|mongo|mariadb/i.test(res.type)
          ? "database"
          : "service";
      topo.nodes.push({
        id: res.name,
        kind,
        engine: res.type,
        access:
          kind === "database" || kind === "cache"
            ? { mode: "managed-instance", instanceRef: res.name }
            : {
                mode: "host-ssh",
                hostRef: "vps-dev",
                deployRef: "compose-dev",
                service: res.name,
              },
      });
    }
    return topo;
  } catch {
    return null;
  }
}

function opsWithComposePlaceholders(topology: TopologyWithAccess): OpsConfig {
  const ops = defaultOpsConfig();
  const hasHostSsh = topology.nodes.some((n) => n.access?.mode === "host-ssh");
  if (hasHostSsh) {
    ops.hosts.push({ id: "vps-dev", host: "", port: 22, user: "deploy" });
    ops.deployProfiles.push({
      id: "compose-dev",
      type: "docker-compose",
      workdir: "/opt/app",
      commands: {
        status: "docker compose ps {{service}}",
        deploy: "docker compose pull {{service}} && docker compose up -d {{service}}",
        deployAll: "docker compose pull && docker compose up -d",
        logs: "docker compose logs -f --tail={{tailLines}} {{service}}",
        logsSnapshot: "docker compose logs --tail={{tailLines}} {{service}}",
      },
    });
  }
  return ops;
}

async function scaffoldTopology(
  projectRoot: string,
  projectId: string,
  resourceServerUrl?: string | null,
): Promise<TopologyWithAccess> {
  const compose = await readComposeFromProject(projectRoot);
  if (compose) {
    return importComposeToTopology(compose, projectId);
  }
  if (resourceServerUrl?.trim()) {
    const server = await fetchServerTopology(resourceServerUrl, projectId);
    if (server && server.nodes.length) {
      return {
        ...server,
        nodes: server.nodes.map((n) => ({
          ...n,
          access:
            n.kind === "database" || n.kind === "cache"
              ? { mode: "managed-instance" as const, instanceRef: n.id }
              : {
                  mode: "host-ssh" as const,
                  hostRef: "vps-dev",
                  deployRef: "compose-dev",
                  service: n.id,
                },
        })),
      };
    }
  }
  const fromResources = await topologyFromResources(projectRoot, projectId);
  if (fromResources) {
    return fromResources;
  }
  return defaultTopology(projectId);
}

export async function ensureWorkspaceOpsConfig(
  projectRoot: string,
  resourceServerUrl?: string | null,
): Promise<WorkspaceOpsBundle> {
  const agentflowDir = path.join(projectRoot, AGENTFLOW);
  const topologyPath = path.join(agentflowDir, TOPOLOGY_FILE);
  const opsPath = path.join(agentflowDir, OPS_FILE);
  const logsDir = path.join(agentflowDir, OPS_LOGS_DIR);
  const projectId = projectIdFromRoot(projectRoot);

  await fs.mkdir(logsDir, { recursive: true });

  const created = { topology: false, ops: false };
  let topology: TopologyWithAccess;

  if (await fileExists(topologyPath)) {
    const local = await loadLocalTopology(projectRoot);
    topology = (local ?? defaultTopology(projectId)) as TopologyWithAccess;
  } else {
    topology = await scaffoldTopology(projectRoot, projectId, resourceServerUrl);
    await fs.writeFile(topologyPath, yaml.stringify(topology), "utf8");
    created.topology = true;
  }

  let ops: OpsConfig;
  if (await fileExists(opsPath)) {
    const raw = await fs.readFile(opsPath, "utf8");
    ops = parseOpsConfig(raw);
  } else {
    ops = opsWithComposePlaceholders(topology);
    await fs.writeFile(opsPath, serializeOpsConfig(ops), "utf8");
    created.ops = true;
  }

  return { topology, ops, created };
}

export async function loadWorkspaceOps(projectRoot: string): Promise<WorkspaceOpsBundle> {
  const projectId = projectIdFromRoot(projectRoot);
  const topologyPath = path.join(projectRoot, AGENTFLOW, TOPOLOGY_FILE);
  const opsPath = path.join(projectRoot, AGENTFLOW, OPS_FILE);

  let topology: TopologyWithAccess = defaultTopology(projectId);
  if (await fileExists(topologyPath)) {
    const raw = await fs.readFile(topologyPath, "utf8");
    topology = yaml.parse(raw) as TopologyWithAccess;
  }

  let ops = defaultOpsConfig();
  if (await fileExists(opsPath)) {
    ops = parseOpsConfig(await fs.readFile(opsPath, "utf8"));
  }

  return { topology, ops, created: { topology: false, ops: false } };
}

export async function saveWorkspaceOps(
  projectRoot: string,
  topology: TopologyWithAccess,
  ops: OpsConfig,
): Promise<void> {
  const agentflowDir = path.join(projectRoot, AGENTFLOW);
  await fs.mkdir(agentflowDir, { recursive: true });
  await fs.writeFile(path.join(agentflowDir, TOPOLOGY_FILE), yaml.stringify(topology), "utf8");
  await fs.writeFile(path.join(agentflowDir, OPS_FILE), serializeOpsConfig(ops), "utf8");
}

export { OPS_LOGS_DIR, AGENTFLOW };
