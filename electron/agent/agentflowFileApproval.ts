import { readFileTool } from "../executor/tools";
import { AGENTFLOW_FILE_PENDING_PREFIX } from "../../shared/agentflowApprovalConstants";
import { isAgentflowRelativePath } from "../../shared/agentflowPaths";

export type AgentflowFilePendingPayload = {
  path: string;
  summary: string;
  before: string | null;
  after: string;
};

export function formatAgentflowFilePendingApproval(
  payload: AgentflowFilePendingPayload,
): string {
  return AGENTFLOW_FILE_PENDING_PREFIX + JSON.stringify(payload);
}

export async function readAgentflowFileBefore(
  workspaceRoot: string,
  relPath: string,
): Promise<string | null> {
  try {
    return await readFileTool(workspaceRoot, relPath);
  } catch {
    return null;
  }
}

export async function proposeAgentflowFileWrite(
  workspaceRoot: string,
  relPath: string,
  after: string,
  summary?: string,
): Promise<string> {
  if (!isAgentflowRelativePath(relPath)) {
    throw new Error(`proposeAgentflowFileWrite only applies to .agentflow paths: ${relPath}`);
  }
  const before = await readAgentflowFileBefore(workspaceRoot, relPath);
  return formatAgentflowFilePendingApproval({
    path: relPath,
    summary: summary ?? `Write ${relPath}`,
    before,
    after,
  });
}
