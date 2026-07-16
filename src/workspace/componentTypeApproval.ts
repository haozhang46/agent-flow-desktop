import { COMPONENT_TYPE_PENDING_PREFIX } from "../../shared/agentflowApprovalConstants";

export type ComponentTypeScope = "project" | "workflow" | "global";

export type PendingComponentTypeDef = {
  type: string;
  label: string;
  description: string;
  category: string;
  defaultProps: Record<string, unknown>;
  propsFields: unknown[];
};

export type PendingComponentTypeApproval = {
  scope: ComponentTypeScope;
  workflowId?: string | null;
  typeDef: PendingComponentTypeDef;
  overwrite: boolean;
  summary: string;
};

export function parsePendingComponentTypeApproval(
  output: string,
): PendingComponentTypeApproval | null {
  if (!output.startsWith(COMPONENT_TYPE_PENDING_PREFIX)) return null;
  try {
    const parsed = JSON.parse(
      output.slice(COMPONENT_TYPE_PENDING_PREFIX.length),
    ) as PendingComponentTypeApproval;
    if (!parsed.scope || !parsed.typeDef?.type || !parsed.summary) return null;
    return parsed;
  } catch {
    return null;
  }
}
