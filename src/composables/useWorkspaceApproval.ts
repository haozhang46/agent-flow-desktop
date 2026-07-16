import { ref } from "vue";
import { useWorkspaceConfig } from "./useWorkspaceConfig";
import { useWorkflow } from "./useWorkflow";
import {
  parsePendingWorkspaceApproval,
  type PendingWorkspaceApproval,
} from "../workspace/workspaceApproval";
import {
  parsePendingAgentflowFileApproval,
  type PendingAgentflowFileApproval,
} from "../workspace/agentflowFileApproval";
import {
  parsePendingComponentTypeApproval,
  type PendingComponentTypeApproval,
} from "../workspace/componentTypeApproval";

async function apiBase(): Promise<string> {
  const port = await window.desktop.getSidecarPort();
  return `http://127.0.0.1:${port}`;
}

async function applyComponentType(body: {
  scope: string;
  workflowId?: string;
  typeDef: PendingComponentTypeApproval["typeDef"];
}): Promise<{ ok: true; path: string }> {
  const res = await fetch(`${await apiBase()}/v1/workspace/component-types/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, confirmed: true }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`/v1/workspace/component-types/apply failed (${res.status}): ${detail}`);
  }
  return res.json() as Promise<{ ok: true; path: string }>;
}

export function useWorkspaceApproval(
  onWorkspaceApplied?: (workflowId: string, stepId: string) => void,
  onFileApplied?: (path: string) => void,
  onComponentTypeApplied?: (path: string) => void,
) {
  const { saveWorkspace } = useWorkspaceConfig();
  const { writeWorkspaceFile } = useWorkflow();
  const pendingWorkspace = ref<PendingWorkspaceApproval | null>(null);
  const pendingFile = ref<PendingAgentflowFileApproval | null>(null);
  const pendingComponentType = ref<PendingComponentTypeApproval | null>(null);
  const approvalError = ref<string | null>(null);
  const approving = ref(false);

  function handleToolEndOutput(output: string | undefined) {
    if (!output) return;
    const workspace = parsePendingWorkspaceApproval(output);
    if (workspace) {
      pendingWorkspace.value = workspace;
      pendingFile.value = null;
      pendingComponentType.value = null;
      approvalError.value = null;
      return;
    }
    const file = parsePendingAgentflowFileApproval(output);
    if (file) {
      pendingFile.value = file;
      pendingWorkspace.value = null;
      pendingComponentType.value = null;
      approvalError.value = null;
      return;
    }
    const componentType = parsePendingComponentTypeApproval(output);
    if (componentType) {
      pendingComponentType.value = componentType;
      pendingWorkspace.value = null;
      pendingFile.value = null;
      approvalError.value = null;
    }
  }

  async function approvePendingWorkspace() {
    const item = pendingWorkspace.value;
    if (!item) return;
    approving.value = true;
    approvalError.value = null;
    try {
      await saveWorkspace(item.workflowId, item.stepId, item.after, { confirmed: true });
      pendingWorkspace.value = null;
      onWorkspaceApplied?.(item.workflowId, item.stepId);
    } catch (err) {
      approvalError.value = err instanceof Error ? err.message : String(err);
    } finally {
      approving.value = false;
    }
  }

  async function approvePendingFile() {
    const item = pendingFile.value;
    if (!item) return;
    approving.value = true;
    approvalError.value = null;
    try {
      await writeWorkspaceFile(item.path, item.after, { confirmed: true });
      pendingFile.value = null;
      onFileApplied?.(item.path);
    } catch (err) {
      approvalError.value = err instanceof Error ? err.message : String(err);
    } finally {
      approving.value = false;
    }
  }

  async function approvePendingComponentType() {
    const item = pendingComponentType.value;
    if (!item) return;
    approving.value = true;
    approvalError.value = null;
    try {
      const result = await applyComponentType({
        scope: item.scope,
        ...(item.workflowId ? { workflowId: item.workflowId } : {}),
        typeDef: item.typeDef,
      });
      pendingComponentType.value = null;
      onComponentTypeApplied?.(result.path);
    } catch (err) {
      approvalError.value = err instanceof Error ? err.message : String(err);
    } finally {
      approving.value = false;
    }
  }

  function cancelPending() {
    pendingWorkspace.value = null;
    pendingFile.value = null;
    pendingComponentType.value = null;
    approvalError.value = null;
  }

  return {
    pendingWorkspace,
    pendingFile,
    pendingComponentType,
    approvalError,
    approving,
    handleToolEndOutput,
    approvePendingWorkspace,
    approvePendingFile,
    approvePendingComponentType,
    cancelPending,
  };
}
