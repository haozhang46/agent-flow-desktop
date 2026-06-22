import path from "node:path";
import type { ThreadScope } from "./types";

export function chatMemoryRoot(projectRoot: string): string {
  return path.join(projectRoot, ".agentflow", "chatMemory");
}

export function checkpointsDbPath(projectRoot: string): string {
  return path.join(chatMemoryRoot(projectRoot), "checkpoints.db");
}

export function threadsRoot(projectRoot: string, scope: ThreadScope): string {
  const root = chatMemoryRoot(projectRoot);
  switch (scope.scope) {
    case "app":
      return path.join(root, "_app", "threads");
    case "free":
      return path.join(root, "workflows", scope.workflowId, "free", "threads");
    case "step":
      return path.join(root, "workflows", scope.workflowId, "steps", scope.stepId, "threads");
  }
}

export function threadDir(
  projectRoot: string,
  scope: ThreadScope,
  threadId: string,
): string {
  return path.join(threadsRoot(projectRoot, scope), threadId);
}

export function metaPath(
  projectRoot: string,
  scope: ThreadScope,
  threadId: string,
): string {
  return path.join(threadDir(projectRoot, scope, threadId), "meta.json");
}

export function messagesPath(
  projectRoot: string,
  scope: ThreadScope,
  threadId: string,
): string {
  return path.join(threadDir(projectRoot, scope, threadId), "messages.json");
}
