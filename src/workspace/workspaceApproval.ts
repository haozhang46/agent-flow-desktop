import { WORKSPACE_PENDING_PREFIX } from "../../shared/agentflowApprovalConstants";
import type { WorkspaceDefinition } from "./registry";

export type PendingWorkspaceApproval = {
  workflowId: string;
  stepId: string;
  summary: string;
  before: WorkspaceDefinition | null;
  after: WorkspaceDefinition;
};

export function parsePendingWorkspaceApproval(output: string): PendingWorkspaceApproval | null {
  if (!output.startsWith(WORKSPACE_PENDING_PREFIX)) return null;
  try {
    const parsed = JSON.parse(output.slice(WORKSPACE_PENDING_PREFIX.length)) as PendingWorkspaceApproval;
    if (!parsed.workflowId || !parsed.stepId || !parsed.after) return null;
    return parsed;
  } catch {
    return null;
  }
}
