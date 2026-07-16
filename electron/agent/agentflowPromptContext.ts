import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { WORKSPACE_REGISTRY } from "../workflow/workspaceRegistry";
import { getActiveWorkflowId, loadWorkflow } from "../workflow/loader";
import {
  loadWorkspace,
  resolveWorkflowLegacy,
  workspacePath,
} from "../workflow/workspaceLoader";
import { renderPromptTemplate } from "../workflow/prompt";
import type { WorkflowStep } from "../workflow/types";
import {
  formatTopologyContextForPrompt,
  loadLocalTopology,
} from "../resources/topology";
import {
  buildDesktopLangChainTools,
  buildReadOnlyDesktopTools,
  type AgentToolContext,
} from "./tools";
import { buildAskQuestionTool } from "./askQuestionTool";
import { clarificationService } from "./clarificationService";

export type ChatMode = "ask" | "plan" | "agent";

export type AgentflowPromptOptions = {
  mode: ChatMode;
  workspaceRoot: string;
  resourceServerUrl?: string | null;
  workflowId?: string;
  stepId?: string;
  userDataRoot?: string;
  /** When set, mounts ask_question closed over this thread id. */
  clarificationThreadId?: string;
};

function resolveUserDataRoot(explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  try {
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

function toolContext(options: AgentflowPromptOptions): AgentToolContext {
  return {
    workspaceRoot: options.workspaceRoot,
    resourceServerUrl: options.resourceServerUrl ?? null,
    workflowId: options.workflowId ?? null,
    stepId: options.stepId ?? null,
    userDataRoot: resolveUserDataRoot(options.userDataRoot),
  };
}

function maybeAskQuestionTool(
  clarificationThreadId: string | undefined,
): StructuredToolInterface[] {
  if (!clarificationThreadId) return [];
  return [
    buildAskQuestionTool({
      threadId: clarificationThreadId,
      service: clarificationService,
    }),
  ];
}

export function getToolsForMode(options: AgentflowPromptOptions): StructuredToolInterface[] {
  const ctx = toolContext(options);
  const askTools = maybeAskQuestionTool(options.clarificationThreadId);

  if (options.mode === "ask") return askTools;
  if (options.mode === "plan") return [...buildReadOnlyDesktopTools(ctx), ...askTools];
  return [...buildDesktopLangChainTools(ctx), ...askTools];
}

export function formatToolsCatalog(tools: StructuredToolInterface[]): string {
  if (!tools.length) return "No tools available in this chat mode.";
  return tools.map((t) => `- **${t.name}**: ${t.description}`).join("\n");
}

function formatWorkspaceSummary(
  components: Array<{ id: string; type: string; label?: string }>,
): string {
  if (!components.length) return "(empty — use workspace_add_component)";
  return components
    .map((c) => {
      const label = c.label ? ` "${c.label}"` : "";
      return `- ${c.id}: ${c.type}${label}`;
    })
    .join("\n");
}

function formatStepGates(step: WorkflowStep): string {
  if (!step.gates?.length) return "";
  return step.gates
    .map((g) => {
      if (g.type === "file") {
        return `- ${g.id}: file \`${g.path}\`${g.min_bytes ? ` (≥${g.min_bytes} bytes)` : ""}`;
      }
      return `- ${g.id}: shell \`${g.command}\`${g.cwd ? ` cwd=${g.cwd}` : ""}`;
    })
    .join("\n");
}

async function loadStepPrompt(
  step: WorkflowStep,
  workspaceRoot: string,
  workflowId?: string,
): Promise<string | null> {
  if (!step.prompt_template) return null;
  try {
    return await renderPromptTemplate(step.prompt_template, workspaceRoot, {}, workflowId);
  } catch {
    return null;
  }
}

async function loadResourcesSummary(workspaceRoot: string): Promise<string | null> {
  const resourcesPath = path.join(workspaceRoot, ".agentflow/resources.yaml");
  try {
    const raw = await fs.readFile(resourcesPath, "utf8");
    const trimmed = raw.trim();
    return trimmed.length > 800 ? `${trimmed.slice(0, 800)}\n…` : trimmed;
  } catch {
    return null;
  }
}

function formatRegistryHint(): string {
  return WORKSPACE_REGISTRY.map((e) => `- ${e.type}: ${e.description}`).join("\n");
}

export async function buildAgentflowChatContext(
  options: AgentflowPromptOptions,
): Promise<string> {
  const parts: string[] = ["## Agent Flow context (.agentflow)"];

  let workflowId = options.workflowId;
  try {
    workflowId = workflowId ?? (await getActiveWorkflowId(options.workspaceRoot));
  } catch {
    workflowId = undefined;
  }

  if (workflowId) {
    try {
      const workflow = await loadWorkflow(options.workspaceRoot, workflowId);
      parts.push(
        "### Workflow",
        `- id: ${workflow.id}`,
        `- title: ${workflow.title}`,
        `- steps: ${workflow.steps.map((s) => s.id).join(" → ")}`,
      );

      const step = options.stepId
        ? workflow.steps.find((s) => s.id === options.stepId)
        : undefined;

      if (step) {
        parts.push(
          "",
          "### Current step",
          `- id: ${step.id}`,
          `- title: ${step.title}`,
          `- executor: ${step.executor}`,
          `- outputs: ${step.outputs.join(", ") || "(none)"}`,
          `- skills: ${step.skills.join(", ") || "(none)"}`,
        );

        const gates = formatStepGates(step);
        if (gates) {
          parts.push("- gates:", gates);
        }

        if (options.workflowId && options.stepId) {
          parts.push(
            "",
            "When calling workspace_* tools from Step Chat, omit workflow_id/step_id to use this step.",
          );
        }

        const stepPrompt = await loadStepPrompt(step, options.workspaceRoot, workflowId);
        if (stepPrompt?.trim()) {
          parts.push("", "### Step instructions", stepPrompt.trim());
        }

        try {
          const isLegacy = await resolveWorkflowLegacy(options.workspaceRoot, workflow.id);
          const filePath = workspacePath(
            options.workspaceRoot,
            workflow.id,
            step.id,
            isLegacy,
          );
          const workspace = await loadWorkspace(filePath, {
            workspaceRoot: options.workspaceRoot,
            userDataRoot: resolveUserDataRoot(options.userDataRoot),
            workflowId: workflow.id,
          });
          parts.push(
            "",
            "### Step workspace UI",
            `File: ${path.relative(options.workspaceRoot, filePath)}`,
            `Layout: ${workspace.layout}`,
            formatWorkspaceSummary(workspace.components),
          );
        } catch {
          // workspace file optional
        }
      }
    } catch {
      // workflow optional for free chat
    }
  }

  const topology = await loadLocalTopology(options.workspaceRoot);
  if (topology) {
    const topoMd = formatTopologyContextForPrompt(topology);
    if (topoMd.trim()) {
      parts.push("", topoMd);
    }
  }

  const resources = await loadResourcesSummary(options.workspaceRoot);
  if (resources) {
    parts.push("", "### Resources (.agentflow/resources.yaml)", "```yaml", resources, "```");
  }

  const tools = getToolsForMode(options);
  parts.push(
    "",
    `### Available tools (mode=${options.mode})`,
    "Use tools to act; read files before editing; prefer step outputs and gates above.",
    formatToolsCatalog(tools),
  );

  if (options.mode === "agent" || options.mode === "plan") {
    parts.push(
      "",
      "### Workspace component registry (for workspace_* tools)",
      "Built-in types (always available):",
      formatRegistryHint(),
    );
  }

  if (options.mode === "agent") {
    parts.push(
      "",
      "### Custom workspace component types",
      "You can register **new declarative component types** (not Vue SFCs) when the user needs a panel that builtins do not cover.",
      "- Tool: `workspace_register_component_type` — proposes a type JSON; returns pending approval; **does not write disk** until the user confirms the Desktop approval card.",
      "- Schema (Phase 1): `{ type, label, description, category, defaultProps, propsFields }` where `propsFields` are form fields (`string` | `boolean` | `select` | `string[]` | …).",
      "- Scope (user chooses via `ask_question` before register): `project` (`.agentflow/component-types/`), `workflow` (under that workflow), or `global` (app userData).",
      "- After approval: call `workspace_list_registry` / `workspace_add_component` to use the new type on a step.",
      "- Prefer builtins when they fit; do not reuse built-in type ids (they are reserved).",
    );
  }

  if (options.resourceServerUrl?.trim()) {
    parts.push(
      "",
      `Resource Server: ${options.resourceServerUrl.trim()} (topology_* syncs to server; local .agentflow/topology.yaml is SSOT when present).`,
    );
  }

  return parts.filter(Boolean).join("\n");
}
