import { isAgentflowRelativePath } from "../../shared/agentflowPaths";

export function confirmAgentflowWrite(relPath: string, summary?: string): boolean {
  const label = summary?.trim() || `Write to ${relPath}`;
  return window.confirm(
    `${label}\n\nThis will modify a file under .agentflow/. Continue?`,
  );
}

export function confirmAgentflowMutation(summary: string): boolean {
  return window.confirm(`${summary}\n\nThis will modify files under .agentflow/. Continue?`);
}

export function shouldConfirmAgentflowPath(relPath: string): boolean {
  return isAgentflowRelativePath(relPath);
}
