import type { StepStatus } from "../composables/useWorkflow";
import type { WorkspaceComponent } from "./registry";
import type { PanelApi } from "./registryComponents";

export interface PanelRuntimeContext {
  stepId?: string;
  stepTitle?: string;
  status?: StepStatus;
  reportPath?: string | null;
  running?: boolean;
  liveOutput?: string;
}

export function bindWidgetProps(
  comp: WorkspaceComponent,
  api: PanelApi,
  runtime?: PanelRuntimeContext,
  workspaceStepId?: string,
): Record<string, unknown> {
  if (comp.type === "agent-run") {
    const reportPath =
      (comp.props.reportPath as string | undefined) ?? runtime?.reportPath ?? null;
    return {
      ...comp.props,
      api,
      stepId: runtime?.stepId ?? workspaceStepId,
      stepTitle: runtime?.stepTitle ?? workspaceStepId,
      status: runtime?.status ?? "pending",
      reportPath,
      running: runtime?.running ?? false,
      liveOutput: runtime?.liveOutput ?? "",
    };
  }
  if (comp.type === "agent-rules-editor") {
    return { api, componentId: comp.id, ...comp.props };
  }
  if (comp.type === "fe-architecture-plan" || comp.type === "be-architecture-plan") {
    return { api, componentId: comp.id, ...comp.props };
  }
  return { api, ...comp.props };
}
