import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getActiveWorkflowId } from "../workflow/loader";
import {
  loadWorkspace,
  resolveWorkflowLegacy,
  workspacePath,
} from "../workflow/workspaceLoader";
import {
  COMPONENT_TYPE_PENDING_PREFIX,
  WORKSPACE_PENDING_PREFIX,
} from "../../shared/agentflowApprovalConstants";
import {
  componentTypesDir,
  listComponentTypes,
  mergeWorkspaceRegistry,
  type ComponentTypeScope,
} from "../workflow/componentTypeStore";
import type { CustomComponentType } from "../workflow/customComponentTypeSchema";
import { parseCustomComponentType } from "../workflow/customComponentTypeSchema";
import type { WorkspaceComponent, WorkspaceDefinition } from "../workflow/workspaceSchema";
import { LayoutSchema, validateWorkspace } from "../workflow/workspaceSchema";

export type WorkspaceToolContext = {
  workspaceRoot: string;
  userDataRoot: string;
  workflowId?: string | null;
  stepId?: string | null;
};

const confirmParam = z
  .boolean()
  .optional()
  .describe(
    "Ignored — workspace mutations always return a pending approval payload for the UI confirmation card.",
  );

function formatPendingApproval(
  workflowId: string,
  stepId: string,
  before: WorkspaceDefinition | null,
  after: WorkspaceDefinition,
  customTypes?: CustomComponentType[],
): string {
  validateWorkspace(after, { customTypes });
  const summary = summarizeChange(before, after);
  return (
    WORKSPACE_PENDING_PREFIX +
    JSON.stringify({ workflowId, stepId, summary, before, after })
  );
}

async function finishMutation(
  ctx: WorkspaceToolContext,
  workflowId: string,
  stepId: string,
  _filePath: string,
  before: WorkspaceDefinition | null,
  after: WorkspaceDefinition,
): Promise<string> {
  const customTypes = await listComponentTypes({
    workspaceRoot: ctx.workspaceRoot,
    userDataRoot: ctx.userDataRoot,
    workflowId,
  });
  return formatPendingApproval(workflowId, stepId, before, after, customTypes);
}

const workflowStepParams = {
  workflow_id: z
    .string()
    .optional()
    .describe("Workflow id; defaults to active workflow from context"),
  step_id: z
    .string()
    .optional()
    .describe("Step id; defaults to bound Step Chat context when present"),
};

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function resolveTarget(
  ctx: WorkspaceToolContext,
  params: { workflow_id?: string; step_id?: string },
): Promise<{ workflowId: string; stepId: string; filePath: string }> {
  const workflowId =
    params.workflow_id?.trim() ||
    ctx.workflowId?.trim() ||
    (await getActiveWorkflowId(ctx.workspaceRoot));
  const stepId = params.step_id?.trim() || ctx.stepId?.trim();
  if (!stepId) {
    throw new Error(
      "step_id is required (pass explicitly or bind via Step Chat context).",
    );
  }
  const isLegacy = await resolveWorkflowLegacy(ctx.workspaceRoot, workflowId);
  const filePath = workspacePath(ctx.workspaceRoot, workflowId, stepId, isLegacy);
  return { workflowId, stepId, filePath };
}

async function tryLoadWorkspace(
  filePath: string,
  ctx: WorkspaceToolContext,
  workflowId: string,
): Promise<WorkspaceDefinition | null> {
  try {
    return await loadWorkspace(filePath, {
      workspaceRoot: ctx.workspaceRoot,
      userDataRoot: ctx.userDataRoot,
      workflowId,
    });
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

function emptyWorkspace(stepId: string): WorkspaceDefinition {
  return { version: 1, stepId, layout: "tabs", components: [] };
}

function formatWorkspace(def: WorkspaceDefinition): string {
  return JSON.stringify(def, null, 2);
}

function uniqueComponentId(type: string, components: WorkspaceComponent[]): string {
  const base = type.replace(/[^a-z0-9-]/gi, "-");
  let id = base;
  let n = 1;
  const ids = new Set(components.map((c) => c.id));
  while (ids.has(id)) {
    id = `${base}-${n++}`;
  }
  return id;
}

function summarizeChange(before: WorkspaceDefinition | null, after: WorkspaceDefinition): string {
  const beforeIds = new Set((before?.components ?? []).map((c) => c.id));
  const afterIds = new Set(after.components.map((c) => c.id));
  const added = after.components.filter((c) => !beforeIds.has(c.id)).map((c) => c.id);
  const removed = (before?.components ?? []).filter((c) => !afterIds.has(c.id)).map((c) => c.id);
  const parts: string[] = [];
  if (before?.layout !== after.layout) {
    parts.push(`layout: ${before?.layout ?? "(new)"} → ${after.layout}`);
  }
  if (added.length) parts.push(`added: ${added.join(", ")}`);
  if (removed.length) parts.push(`removed: ${removed.join(", ")}`);
  if (!parts.length) parts.push("updated existing components");
  return parts.join("; ");
}

export function buildWorkspaceLangChainTools(ctx: WorkspaceToolContext) {
  return [
    tool(
      async ({ workflow_id, step_id }) => {
        const { workflowId, stepId, filePath } = await resolveTarget(ctx, {
          workflow_id,
          step_id,
        });
        const workspace = await tryLoadWorkspace(filePath, ctx, workflowId);
        if (!workspace) {
          return `No workspace file for workflow "${workflowId}" step "${stepId}". Use workspace_add_component to create one.`;
        }
        return formatWorkspace(workspace);
      },
      {
        name: "workspace_get",
        description:
          "Read the low-code workspace JSON for a workflow step (*.workspace.json): layout and registered UI components.",
        schema: z.object(workflowStepParams),
      },
    ),
    tool(
      async () => {
        const entries = await mergeWorkspaceRegistry({
          workspaceRoot: ctx.workspaceRoot,
          userDataRoot: ctx.userDataRoot,
          workflowId: ctx.workflowId,
        });
        return JSON.stringify(
          {
            components: entries.map((entry) => ({
              type: entry.type,
              label: entry.label,
              description: entry.description,
              category: entry.category,
              defaultProps: entry.defaultProps,
              propsFields: entry.propsFields,
            })),
          },
          null,
          2,
        );
      },
      {
        name: "workspace_list_registry",
        description:
          "List valid workspace component types and prop field hints from the registry (built-in + custom). Call before workspace_add_component.",
        schema: z.object({}),
      },
    ),
    tool(
      async ({ type_def, scope, workflow_id, confirm: _confirm }) => {
        try {
          const typeDef = parseCustomComponentType(type_def);
          const scopeValue = scope as ComponentTypeScope;
          const workflowId =
            scopeValue === "workflow"
              ? workflow_id?.trim() || ctx.workflowId?.trim() || undefined
              : workflow_id?.trim() || undefined;
          if (scopeValue === "workflow" && !workflowId) {
            return "workflow_id is required for workflow scope (pass explicitly or bind via context).";
          }

          const filePath = path.join(
            componentTypesDir(
              ctx.workspaceRoot,
              scopeValue,
              workflowId,
              ctx.userDataRoot,
            ),
            `${typeDef.type}.json`,
          );
          let overwrite = false;
          try {
            await fs.access(filePath);
            overwrite = true;
          } catch (err) {
            if (!isEnoent(err)) throw err;
          }

          const summary = overwrite
            ? `Overwrite custom component type "${typeDef.type}" (${scopeValue})`
            : `Register custom component type "${typeDef.type}" (${scopeValue})`;

          return (
            COMPONENT_TYPE_PENDING_PREFIX +
            JSON.stringify({
              scope: scopeValue,
              ...(workflowId ? { workflowId } : {}),
              typeDef,
              overwrite,
              summary,
            })
          );
        } catch (err) {
          return err instanceof Error ? err.message : String(err);
        }
      },
      {
        name: "workspace_register_component_type",
        description:
          "Propose registering a custom workspace component type (project, workflow, or global scope). Returns a pending approval payload; user must confirm in the UI before the type is saved. Does not write files.",
        schema: z.object({
          type_def: z
            .record(z.unknown())
            .describe(
              "Custom component type definition: type, label, description, category, defaultProps, propsFields",
            ),
          scope: z
            .enum(["project", "workflow", "global"])
            .describe("Where to store the type definition"),
          workflow_id: z
            .string()
            .optional()
            .describe("Required when scope is workflow; defaults to context workflow"),
          confirm: confirmParam,
        }),
      },
    ),
    tool(
      async ({ workflow_id, step_id, type, label, props, component_id, confirm: _confirm }) => {
        const { workflowId, stepId, filePath } = await resolveTarget(ctx, { workflow_id, step_id });
        const entries = await mergeWorkspaceRegistry({
          workspaceRoot: ctx.workspaceRoot,
          userDataRoot: ctx.userDataRoot,
          workflowId,
        });
        const entry = entries.find((e) => e.type === type);
        if (!entry) {
          const valid = entries.map((e) => e.type).join(", ");
          return `Unknown component type "${type}". Valid types: ${valid}. Call workspace_list_registry first.`;
        }

        const before = await tryLoadWorkspace(filePath, ctx, workflowId);
        const workspace = before ?? emptyWorkspace(stepId);
        const id = component_id?.trim() || uniqueComponentId(type, workspace.components);
        if (workspace.components.some((c) => c.id === id)) {
          return `Component id "${id}" already exists.`;
        }

        const component: WorkspaceComponent = {
          id,
          type,
          ...(label?.trim() ? { label: label.trim() } : {}),
          props: { ...entry.defaultProps, ...(props ?? {}) },
        };
        workspace.components.push(component);
        return finishMutation(ctx, workflowId, stepId, filePath, before, workspace);
      },
      {
        name: "workspace_add_component",
        description:
          "Add a registry component to a step workspace. Returns a pending approval payload; user must confirm in the UI before changes apply.",
        schema: z.object({
          ...workflowStepParams,
          type: z.string().describe("Registry component type, e.g. code-explorer"),
          label: z.string().optional().describe("Optional tab/panel label"),
          props: z
            .record(z.unknown())
            .optional()
            .describe("Component props merged over registry defaults"),
          component_id: z.string().optional().describe("Optional unique component id"),
          confirm: confirmParam,
        }),
      },
    ),
    tool(
      async ({ workflow_id, step_id, component_id, label, props, confirm: _confirm }) => {
        const { workflowId, stepId, filePath } = await resolveTarget(ctx, { workflow_id, step_id });
        const before = await tryLoadWorkspace(filePath, ctx, workflowId);
        if (!before) {
          return `No workspace file for step "${stepId}".`;
        }
        const idx = before.components.findIndex((c) => c.id === component_id);
        if (idx < 0) {
          return `Unknown component id "${component_id}". Existing: ${before.components.map((c) => c.id).join(", ") || "(none)"}`;
        }

        const next = structuredClone(before);
        const comp = next.components[idx];
        if (label !== undefined) comp.label = label.trim() || undefined;
        if (props !== undefined) comp.props = { ...comp.props, ...props };
        return finishMutation(ctx, workflowId, stepId, filePath, before, next);
      },
      {
        name: "workspace_update_component",
        description:
          "Update label or props for a workspace component by id. Returns pending approval for UI confirmation.",
        schema: z.object({
          ...workflowStepParams,
          component_id: z.string(),
          label: z.string().optional(),
          props: z.record(z.unknown()).optional(),
          confirm: confirmParam,
        }),
      },
    ),
    tool(
      async ({ workflow_id, step_id, component_id, confirm: _confirm }) => {
        const { workflowId, stepId, filePath } = await resolveTarget(ctx, { workflow_id, step_id });
        const before = await tryLoadWorkspace(filePath, ctx, workflowId);
        if (!before) {
          return `No workspace file for step "${stepId}".`;
        }
        if (!before.components.some((c) => c.id === component_id)) {
          return `Unknown component id "${component_id}".`;
        }
        const next = {
          ...before,
          components: before.components.filter((c) => c.id !== component_id),
        };
        return finishMutation(ctx, workflowId, stepId, filePath, before, next);
      },
      {
        name: "workspace_remove_component",
        description:
          "Remove a workspace component by id. Returns pending approval for UI confirmation.",
        schema: z.object({
          ...workflowStepParams,
          component_id: z.string(),
          confirm: confirmParam,
        }),
      },
    ),
    tool(
      async ({ workflow_id, step_id, component_ids, confirm: _confirm }) => {
        const { workflowId, stepId, filePath } = await resolveTarget(ctx, { workflow_id, step_id });
        const before = await tryLoadWorkspace(filePath, ctx, workflowId);
        if (!before) {
          return `No workspace file for step "${stepId}".`;
        }
        const byId = new Map(before.components.map((c) => [c.id, c]));
        const missing = component_ids.filter((id) => !byId.has(id));
        if (missing.length) {
          return `Unknown component ids: ${missing.join(", ")}`;
        }
        if (component_ids.length !== before.components.length) {
          return `component_ids must include all ${before.components.length} components exactly once.`;
        }
        const next = {
          ...before,
          components: component_ids.map((id) => byId.get(id)!),
        };
        return finishMutation(ctx, workflowId, stepId, filePath, before, next);
      },
      {
        name: "workspace_reorder",
        description:
          "Reorder workspace components by providing the full ordered id list. Returns pending approval for UI confirmation.",
        schema: z.object({
          ...workflowStepParams,
          component_ids: z.array(z.string()).min(1),
          confirm: confirmParam,
        }),
      },
    ),
    tool(
      async ({ workflow_id, step_id, layout, confirm: _confirm }) => {
        const { workflowId, stepId, filePath } = await resolveTarget(ctx, { workflow_id, step_id });
        const before = await tryLoadWorkspace(filePath, ctx, workflowId);
        const workspace = before ?? emptyWorkspace(stepId);
        workspace.layout = layout;
        return finishMutation(ctx, workflowId, stepId, filePath, before, workspace);
      },
      {
        name: "workspace_set_layout",
        description:
          'Set workspace layout to "tabs" or "stack". Returns pending approval for UI confirmation.',
        schema: z.object({
          ...workflowStepParams,
          layout: LayoutSchema,
          confirm: confirmParam,
        }),
      },
    ),
  ];
}

export function buildReadOnlyWorkspaceTools(ctx: WorkspaceToolContext) {
  return buildWorkspaceLangChainTools(ctx).filter((t) =>
    ["workspace_get", "workspace_list_registry"].includes(t.name),
  );
}
