import os from "node:os";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { runDesktopTool, type DesktopToolContext } from "../executor/runTool";
import { buildOpsLangChainTools, buildReadOnlyOpsTools, type OpsToolContext } from "./opsTools";
import {
  buildReadOnlyTopologyTools,
  buildTopologyLangChainTools,
  type TopologyToolContext,
} from "./topologyTools";
import {
  buildReadOnlyWorkspaceTools,
  buildWorkspaceLangChainTools,
  type WorkspaceToolContext,
} from "./workspaceTools";

export type AgentToolContext = DesktopToolContext & {
  resourceServerUrl?: string | null;
  workflowId?: string | null;
  stepId?: string | null;
  userDataRoot?: string | null;
};

function resolveUserDataRoot(explicit?: string | null): string {
  if (explicit?.trim()) return explicit.trim();
  try {
    // Electron main: prefer app userData; tests/Node fall through.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require("electron") as { app?: { getPath?: (name: string) => string } };
    if (typeof app?.getPath === "function") {
      return app.getPath("userData");
    }
  } catch {
    // not running under Electron
  }
  return path.join(os.homedir(), ".agentflow-desktop");
}

function toTopologyContext(ctx: AgentToolContext): TopologyToolContext {
  return {
    workspaceRoot: ctx.workspaceRoot,
    resourceServerUrl: ctx.resourceServerUrl,
  };
}

function toOpsContext(ctx: AgentToolContext): OpsToolContext {
  return { workspaceRoot: ctx.workspaceRoot };
}

function toWorkspaceContext(ctx: AgentToolContext): WorkspaceToolContext {
  return {
    workspaceRoot: ctx.workspaceRoot,
    userDataRoot: resolveUserDataRoot(ctx.userDataRoot),
    workflowId: ctx.workflowId,
    stepId: ctx.stepId,
  };
}

export function buildDesktopLangChainTools(ctx: AgentToolContext) {
  return [
    ...buildBaseDesktopTools(ctx),
    ...buildWorkspaceLangChainTools(toWorkspaceContext(ctx)),
    ...buildOpsLangChainTools(toOpsContext(ctx)),
    ...buildTopologyLangChainTools(toTopologyContext(ctx)),
  ];
}

export function buildReadOnlyDesktopTools(ctx: AgentToolContext) {
  return [
    ...buildBaseDesktopTools(ctx).filter((t) =>
      ["read_file", "list_dir", "git_status", "git_diff"].includes(t.name),
    ),
    ...buildReadOnlyWorkspaceTools(toWorkspaceContext(ctx)),
    ...buildReadOnlyOpsTools(toOpsContext(ctx)),
    ...buildReadOnlyTopologyTools(toTopologyContext(ctx)),
  ];
}

function buildBaseDesktopTools(ctx: DesktopToolContext) {
  return [
    tool(
      async ({ path }) => runDesktopTool(ctx, "read_file", { path }),
      {
        name: "read_file",
        description: "Read a UTF-8 text file relative to the workspace root.",
        schema: z.object({ path: z.string() }),
      },
    ),
    tool(
      async ({ path }) => runDesktopTool(ctx, "list_dir", { path }),
      {
        name: "list_dir",
        description: "List files and directories under a workspace-relative path.",
        schema: z.object({ path: z.string().default(".") }),
      },
    ),
    tool(
      async () => runDesktopTool(ctx, "git_status", {}),
      {
        name: "git_status",
        description: "Show git status for the workspace repository.",
        schema: z.object({}),
      },
    ),
    tool(
      async ({ path }) => runDesktopTool(ctx, "git_diff", { path }),
      {
        name: "git_diff",
        description: "Show git diff for the whole repo or a specific path.",
        schema: z.object({ path: z.string().default("") }),
      },
    ),
    tool(
      async ({ command }) => runDesktopTool(ctx, "run_shell", { command }),
      {
        name: "run_shell",
        description: "Run a shell command in the workspace directory.",
        schema: z.object({ command: z.string() }),
      },
    ),
  ];
}
