import { AGENTFLOW_FILE_PENDING_PREFIX } from "../../shared/agentflowApprovalConstants";

export type PendingAgentflowFileApproval = {
  path: string;
  summary: string;
  before: string | null;
  after: string;
};

export function parsePendingAgentflowFileApproval(
  output: string,
): PendingAgentflowFileApproval | null {
  if (!output.startsWith(AGENTFLOW_FILE_PENDING_PREFIX)) return null;
  try {
    const parsed = JSON.parse(output.slice(AGENTFLOW_FILE_PENDING_PREFIX.length)) as PendingAgentflowFileApproval;
    if (!parsed.path || parsed.after === undefined) return null;
    return parsed;
  } catch {
    return null;
  }
}
