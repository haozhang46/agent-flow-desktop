import type { Component } from "vue";
import { getBuiltinTypeDocument } from "../../shared/jsonWidget/builtinTypeDefs";
import type { useWorkflow } from "../composables/useWorkflow";
import { VIEW_LOADERS } from "./jsonWidget/viewRegistry";

export type ChatFileAttachment = {
  path: string;
  label?: string;
};

export type RuleFileEntry = { path: string; label: string };

export type ArchitecturePlanWidgetType = "fe-architecture-plan" | "be-architecture-plan";

export type PanelApi = Pick<
  ReturnType<typeof useWorkflow>,
  | "fetchPhase"
  | "fetchGates"
  | "fetchDeploymentConfig"
  | "fetchResourceContext"
  | "fetchTopology"
  | "fetchOpsSummary"
  | "listWorkspace"
  | "readWorkspaceFile"
  | "writeWorkspaceFile"
  | "deleteWorkspacePath"
> & {
  addToChat?: (item: ChatFileAttachment) => void | Promise<void>;
  persistRuleFiles?: (files: RuleFileEntry[], componentId: string) => Promise<void>;
  persistArchitectureLayers?: (
    layers: string[],
    componentId: string,
    widgetType: ArchitecturePlanWidgetType,
  ) => Promise<void>;
  subscribeFileWrites?: (handler: (path: string) => void) => () => void;
};

/** @deprecated Prefer VIEW_LOADERS from jsonWidget/viewRegistry. Compat alias of VIEW_LOADERS. */
export const WIDGET_COMPONENTS: Record<string, () => Promise<{ default: Component }>> = VIEW_LOADERS;

export function isRegisteredWidgetType(type: string): boolean {
  return getBuiltinTypeDocument(type) != null;
}
