import { tool } from "@langchain/core/tools";
import { z } from "zod";
import yaml from "yaml";
import { readFileTool, writeFileTool } from "../executor/tools";
import { proposeAgentflowFileWrite } from "./agentflowFileApproval";
import { isAgentflowRelativePath, normalizeWorkspaceRelativePath } from "../../shared/agentflowPaths";
import {
  createTopologyClient,
  loadOrEmpty,
  type TopologyResourceClient,
} from "../resources/topologyClient";
import type { ResourceInstance } from "../resources/resolver";
import type { Topology, TopologyEdge, TopologyNode } from "../resources/topology";

export type TopologyToolContext = {
  workspaceRoot: string;
  resourceServerUrl?: string | null;
};

function requireClient(ctx: TopologyToolContext): TopologyResourceClient {
  const client = createTopologyClient(ctx.resourceServerUrl, ctx.workspaceRoot);
  if (!client) {
    throw new Error(
      "Resource Server URL is not configured. Set it in Settings (e.g. http://localhost:9000).",
    );
  }
  return client;
}

function formatTopology(topology: Topology): string {
  return JSON.stringify(topology, null, 2);
}

export function buildTopologyLangChainTools(ctx: TopologyToolContext) {
  if (!ctx.resourceServerUrl?.trim()) {
    return [];
  }

  return [
    tool(
      async () => {
        const client = requireClient(ctx);
        const topology = await client.getTopology();
        if (!topology) {
          return "No topology stored for this project yet. Use topology_add_node or topology_import_compose.";
        }
        return formatTopology(topology);
      },
      {
        name: "topology_get",
        description:
          "Get the current service topology (nodes, edges, deployment targets) from the Resource Server for this project.",
        schema: z.object({}),
      },
    ),
    tool(
      async ({ id, kind, engine, image, runtime }) => {
        const client = requireClient(ctx);
        const topology = await loadOrEmpty(client);
        if (topology.nodes.some((n) => n.id === id)) {
          return `Node "${id}" already exists.`;
        }
        const node: TopologyNode = { id, kind, engine, image, runtime, ports: [] };
        topology.nodes.push(node);
        const saved = await client.saveTopology(topology);
        return `Added node ${id}. Current topology:\n${formatTopology(saved)}`;
      },
      {
        name: "topology_add_node",
        description:
          "Add a service topology node (service, database, cache, gateway, or worker) on the Resource Server.",
        schema: z.object({
          id: z.string().describe("Unique node id, e.g. api, app-db, cache"),
          kind: z.enum(["service", "database", "cache", "gateway", "worker"]),
          engine: z.string().optional().describe("e.g. mysql, redis, postgres"),
          image: z.string().optional(),
          runtime: z.string().optional().describe("e.g. node, python, go"),
        }),
      },
    ),
    tool(
      async ({ from, to, env_keys }) => {
        const client = requireClient(ctx);
        const topology = await loadOrEmpty(client);
        const nodeIds = new Set(topology.nodes.map((n) => n.id));
        if (!nodeIds.has(from) || !nodeIds.has(to)) {
          return `Unknown node in edge. Existing nodes: ${[...nodeIds].join(", ") || "(none)"}`;
        }
        const env: Record<string, string> = {};
        for (const pair of env_keys ?? []) {
          const idx = pair.indexOf("=");
          if (idx > 0) {
            env[pair.slice(0, idx)] = pair.slice(idx + 1);
          }
        }
        const edge: TopologyEdge = { from, to, env };
        topology.edges.push(edge);
        const saved = await client.saveTopology(topology);
        return `Added edge ${from} → ${to}. Current topology:\n${formatTopology(saved)}`;
      },
      {
        name: "topology_add_edge",
        description: "Connect two topology nodes. Optional env_keys like DATABASE_URL=mysql://...",
        schema: z.object({
          from: z.string(),
          to: z.string(),
          env_keys: z
            .array(z.string())
            .optional()
            .describe('Environment variable assignments, e.g. ["DATABASE_URL=mysql://app-db:3306/myapp"]'),
        }),
      },
    ),
    tool(
      async ({ content, file_path }) => {
        const client = requireClient(ctx);
        let compose = content?.trim() ?? "";
        if (file_path?.trim()) {
          compose = await readFileTool(ctx.workspaceRoot, file_path.trim());
        }
        if (!compose) {
          return "Provide content or file_path for docker-compose YAML.";
        }
        const saved = await client.importCompose(compose);
        return `Imported compose topology:\n${formatTopology(saved)}`;
      },
      {
        name: "topology_import_compose",
        description:
          "Import docker-compose YAML into the Resource Server topology for this project.",
        schema: z.object({
          content: z.string().optional(),
          file_path: z
            .string()
            .optional()
            .describe("Workspace-relative path to docker-compose.yml"),
        }),
      },
    ),
    tool(
      async ({ write_path }) => {
        const client = requireClient(ctx);
        const yamlContent = await client.exportCompose();
        if (write_path?.trim()) {
          const normalized = normalizeWorkspaceRelativePath(write_path.trim());
          if (isAgentflowRelativePath(normalized)) {
            return proposeAgentflowFileWrite(
              ctx.workspaceRoot,
              normalized,
              yamlContent,
              `Export compose to ${normalized}`,
            );
          }
          await writeFileTool(ctx.workspaceRoot, write_path.trim(), yamlContent);
          return `Exported compose to ${write_path.trim()}:\n${yamlContent}`;
        }
        return yamlContent;
      },
      {
        name: "topology_export_compose",
        description:
          "Export current Resource Server topology as docker-compose YAML. Optionally write to a workspace file.",
        schema: z.object({
          write_path: z
            .string()
            .optional()
            .describe('e.g. "docker-compose.yml" to write into the project'),
        }),
      },
    ),
    tool(
      async () => {
        const client = requireClient(ctx);
        const instances = await client.getInstances();
        return JSON.stringify({ instances }, null, 2);
      },
      {
        name: "topology_resources_get",
        description:
          "Get resource connection instances (mysql, redis, etc.) from the Resource Server for this project.",
        schema: z.object({}),
      },
    ),
    tool(
      async ({ name, host, port, database, user, dsn }) => {
        const client = requireClient(ctx);
        const serverInstances = await client.getInstances();
        const next: Record<string, ResourceInstance> = { ...serverInstances };
        next[name] = {
          ...(next[name] ?? {}),
          ...(host != null ? { host } : {}),
          ...(port != null ? { port } : {}),
          ...(database != null ? { database } : {}),
          ...(user != null ? { user } : {}),
          ...(dsn != null ? { dsn } : {}),
        };
        const relPath = ".agentflow/resource-instances.yaml";
        const after = yaml.stringify({ instances: next });
        return proposeAgentflowFileWrite(
          ctx.workspaceRoot,
          relPath,
          after,
          `Update resource instance "${name}"`,
        );
      },
      {
        name: "topology_resources_set_local",
        description:
          "Set connection details for a named resource in local .agentflow/resource-instances.yaml (overrides Resource Server for this project).",
        schema: z.object({
          name: z.string().describe("Instance name matching resources.yaml, e.g. app-db"),
          host: z.string().optional(),
          port: z.number().optional(),
          database: z.string().optional(),
          user: z.string().optional(),
          dsn: z.string().optional(),
        }),
      },
    ),
  ];
}

export function buildReadOnlyTopologyTools(ctx: TopologyToolContext) {
  return buildTopologyLangChainTools(ctx).filter((t) =>
    ["topology_get", "topology_resources_get", "topology_export_compose"].includes(t.name),
  );
}
