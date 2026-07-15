import { resolveRoots } from "./store";

/**
 * Resolve the executor cwd for a workflow step.
 * Missing stepRootId → workspace root; otherwise match a registered root.
 */
export async function resolveStepCwd(
  workspaceRoot: string,
  stepRootId?: string,
): Promise<string> {
  if (stepRootId === undefined || stepRootId === "") {
    return workspaceRoot;
  }
  const roots = await resolveRoots(workspaceRoot);
  const match = roots.find((root) => root.id === stepRootId);
  if (!match) {
    throw new Error(`Unknown rootId: ${stepRootId}`);
  }
  return match.absolutePath;
}
