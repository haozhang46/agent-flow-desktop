import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ensureWorkspaceOpsConfig } from "../resources/opsBootstrap";
import {
  fetchNodeStatus,
  runDeployAll,
  runNodeDeploy,
} from "../resources/opsActions";
import { fetchLogSnapshot } from "../resources/opsLogs";
import { loadWorkspaceOps } from "../resources/opsBootstrap";
import type { OpsConfig } from "../resources/opsTypes";

export type OpsToolContext = {
  workspaceRoot: string;
};

async function loadOpsBundle(ctx: OpsToolContext) {
  await ensureWorkspaceOpsConfig(ctx.workspaceRoot);
  return loadWorkspaceOps(ctx.workspaceRoot);
}

function formatNodeSummary(bundle: Awaited<ReturnType<typeof loadWorkspaceOps>>): string {
  const lines = bundle.topology.nodes.map((n) => {
    const mode = n.access?.mode ?? "unknown";
    return `- ${n.id} (${n.kind}, ${mode})`;
  });
  return [
    `Project: ${bundle.topology.project}`,
    `Nodes (${bundle.topology.nodes.length}):`,
    lines.length ? lines.join("\n") : "  (none)",
    `Hosts: ${bundle.ops.hosts.map((h) => h.id).join(", ") || "(none)"}`,
  ].join("\n");
}

export function buildOpsLangChainTools(ctx: OpsToolContext) {
  return [
    tool(
      async () => {
        const bundle = await loadOpsBundle(ctx);
        return formatNodeSummary(bundle);
      },
      {
        name: "ops_get_config",
        description:
          "Get workspace ops topology summary: nodes, access modes, and configured SSH hosts from .agentflow/topology.yaml and ops.yaml.",
        schema: z.object({}),
      },
    ),
    tool(
      async ({ node_id }) => {
        const bundle = await loadOpsBundle(ctx);
        const node = bundle.topology.nodes.find((n) => n.id === node_id);
        if (!node) {
          return `Unknown node "${node_id}". Available: ${bundle.topology.nodes.map((n) => n.id).join(", ") || "(none)"}`;
        }
        const result = await fetchNodeStatus(ctx.workspaceRoot, node, bundle.ops);
        const parts = [result.output || "(no output)"];
        parts.push(`reachable: ${result.reachable}`);
        if (result.error) parts.push(`error: ${result.error}`);
        return parts.join("\n");
      },
      {
        name: "ops_node_status",
        description:
          "Check runtime status for a topology node (SSH docker compose ps for host-ssh, TCP for managed-instance).",
        schema: z.object({
          node_id: z.string().describe("Topology node id, e.g. api, nginx"),
        }),
      },
    ),
    tool(
      async ({ node_id, lines }) => {
        const bundle = await loadOpsBundle(ctx);
        const node = bundle.topology.nodes.find((n) => n.id === node_id);
        if (!node) {
          return `Unknown node "${node_id}".`;
        }
        const ops: OpsConfig = {
          ...bundle.ops,
          logPolicy: {
            ...bundle.ops.logPolicy,
            defaultTailLines: lines ?? bundle.ops.logPolicy.defaultTailLines,
          },
        };
        const result = await fetchLogSnapshot(ctx.workspaceRoot, node, ops);
        if (result.error && !result.content) {
          return `Error: ${result.error}`;
        }
        const header = result.savedPath ? `Saved to ${result.savedPath}\n\n` : "";
        return `${header}${result.content || "(empty)"}${result.error ? `\n\nstderr: ${result.error}` : ""}`;
      },
      {
        name: "ops_logs_tail",
        description:
          "Fetch recent application/service logs for a host-ssh node via SSH (docker compose logs snapshot). Persists to .agentflow/ops-logs/ when configured.",
        schema: z.object({
          node_id: z.string().describe("Topology node id"),
          lines: z.number().optional().describe("Tail line count (default from ops.yaml logPolicy)"),
        }),
      },
    ),
    tool(
      async ({ node_id, confirm }) => {
        if (!confirm) {
          return 'Deploy refused: set confirm=true after user explicitly approves production deploy.';
        }
        const bundle = await loadOpsBundle(ctx);
        const node = bundle.topology.nodes.find((n) => n.id === node_id);
        if (!node) {
          return `Unknown node "${node_id}".`;
        }
        const result = await runNodeDeploy(ctx.workspaceRoot, node, bundle.ops);
        const parts = [`exitCode: ${result.exitCode}`, result.output || "(no output)"];
        if (result.logFile) parts.push(`logFile: ${result.logFile}`);
        if (result.error) parts.push(`error: ${result.error}`);
        return parts.join("\n");
      },
      {
        name: "ops_deploy_node",
        description:
          "Deploy a single host-ssh node over SSH using ops.yaml deploy profile. Requires confirm=true after explicit user approval.",
        schema: z.object({
          node_id: z.string(),
          confirm: z
            .boolean()
            .describe("Must be true — only set after user explicitly confirms deploy"),
        }),
      },
    ),
    tool(
      async ({ confirm }) => {
        if (!confirm) {
          return 'Deploy refused: set confirm=true after user explicitly approves production deploy.';
        }
        const bundle = await loadOpsBundle(ctx);
        const result = await runDeployAll(ctx.workspaceRoot, bundle.ops);
        const parts = [`exitCode: ${result.exitCode}`, result.output || "(no output)"];
        if (result.error) parts.push(`error: ${result.error}`);
        return parts.join("\n");
      },
      {
        name: "ops_deploy_all",
        description:
          "Deploy all services via ops.yaml deployAll command over SSH. Requires confirm=true after explicit user approval.",
        schema: z.object({
          confirm: z
            .boolean()
            .describe("Must be true — only set after user explicitly confirms deploy"),
        }),
      },
    ),
  ];
}

export function buildReadOnlyOpsTools(ctx: OpsToolContext) {
  return buildOpsLangChainTools(ctx).filter((t) =>
    ["ops_get_config", "ops_node_status", "ops_logs_tail"].includes(t.name),
  );
}
