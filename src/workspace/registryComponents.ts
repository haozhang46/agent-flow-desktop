import type { Component } from "vue";
import type { useWorkflow } from "../composables/useWorkflow";

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

export const WIDGET_COMPONENTS: Record<string, () => Promise<{ default: Component }>> = {
  "markdown-doc": () => import("./widgets/MarkdownDocWidget.vue"),
  "architecture-docs": () => import("./widgets/ArchitectureDocsWidget.vue"),
  "code-explorer": () => import("./widgets/CodeExplorerWidget.vue"),
  "agent-run": () => import("./widgets/AgentRunWidget.vue"),
  "cicd-config": () => import("./widgets/CicdConfigWidget.vue"),
  "fe-architecture-plan": () => import("./widgets/FeArchitecturePlanWidget.vue"),
  "be-architecture-plan": () => import("./widgets/BeArchitecturePlanWidget.vue"),
  "schema-migrations": () => import("./widgets/SchemaMigrationsWidget.vue"),
  "topology-panel": () => import("./widgets/TopologyPanelWidget.vue"),
  "topology-context": () => import("./widgets/TopologyContextWidget.vue"),
  "cicd-readiness": () => import("./widgets/CicdReadinessWidget.vue"),
  "component-splitter": () => import("./widgets/ComponentSplitterWidget.vue"),
  "agent-rules-editor": () => import("./widgets/AgentRulesEditorWidget.vue"),
  "style-tokens-editor": () => import("./widgets/StyleTokensEditorWidget.vue"),
  "langflow-panel": () => import("./widgets/LangflowPanelWidget.vue"),
};

/** Fallback renderer for custom / unknown types not in WIDGET_COMPONENTS. */
export const loadDeclarativePanelWidget = (): Promise<{ default: Component }> =>
  import("./widgets/DeclarativePanelWidget.vue");

export function isRegisteredWidgetType(type: string): boolean {
  return type in WIDGET_COMPONENTS;
}

/** Built-in Vue widget if registered; otherwise DeclarativePanelWidget. */
export function resolveWidgetLoader(type: string): () => Promise<{ default: Component }> {
  return WIDGET_COMPONENTS[type] ?? loadDeclarativePanelWidget;
}
