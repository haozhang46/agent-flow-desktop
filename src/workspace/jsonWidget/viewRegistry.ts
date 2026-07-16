import type { Component } from "vue";

export const VIEW_LOADERS: Record<string, () => Promise<{ default: Component }>> = {
  "markdown-doc": () => import("../widgets/MarkdownDocWidget.vue"),
  "architecture-docs": () => import("../widgets/ArchitectureDocsWidget.vue"),
  "code-explorer": () => import("../widgets/CodeExplorerWidget.vue"),
  "agent-run": () => import("../widgets/AgentRunWidget.vue"),
  "cicd-config": () => import("../widgets/CicdConfigWidget.vue"),
  "fe-architecture-plan": () => import("../widgets/FeArchitecturePlanWidget.vue"),
  "be-architecture-plan": () => import("../widgets/BeArchitecturePlanWidget.vue"),
  "schema-migrations": () => import("../widgets/SchemaMigrationsWidget.vue"),
  "topology-panel": () => import("../widgets/TopologyPanelWidget.vue"),
  "topology-context": () => import("../widgets/TopologyContextWidget.vue"),
  "cicd-readiness": () => import("../widgets/CicdReadinessWidget.vue"),
  "component-splitter": () => import("../widgets/ComponentSplitterWidget.vue"),
  "agent-rules-editor": () => import("../widgets/AgentRulesEditorWidget.vue"),
  "style-tokens-editor": () => import("../widgets/StyleTokensEditorWidget.vue"),
  "langflow-panel": () => import("../widgets/LangflowPanelWidget.vue"),
};
