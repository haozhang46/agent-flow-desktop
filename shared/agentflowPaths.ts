export function normalizeWorkspaceRelativePath(relPath: string): string {
  return relPath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isAgentflowRelativePath(relPath: string): boolean {
  const normalized = normalizeWorkspaceRelativePath(relPath);
  return normalized === ".agentflow" || normalized.startsWith(".agentflow/");
}
