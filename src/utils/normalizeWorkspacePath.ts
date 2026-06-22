export function normalizeWorkspacePath(relPath: string): string {
  return relPath.replace(/\\/g, "/").replace(/^\.\//, "");
}
