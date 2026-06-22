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

export function useWorkspaceApproval(
  onWorkspaceApplied?: (workflowId: string, stepId: string) => void,
  onFileApplied?: (path: string) => void,
) {
  const { saveWorkspace } = useWorkspaceConfig();
  const { writeWorkspaceFile } = useWorkflow();
  const pendingWorkspace = ref<PendingWorkspaceApproval | null>(null);
  const pendingFile = ref<PendingAgentflowFileApproval | null>(null);
  const approvalError = ref<string | null>(null);
  const approving = ref(false);

  function handleToolEndOutput(output: string | undefined) {
    if (!output) return;
    const workspace = parsePendingWorkspaceApproval(output);
    if (workspace) {
      pendingWorkspace.value = workspace;
      pendingFile.value = null;
      approvalError.value = null;
      return;
    }
    const file = parsePendingAgentflowFileApproval(output);
    if (file) {
      pendingFile.value = file;
      pendingWorkspace.value = null;
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

  function cancelPending() {
    pendingWorkspace.value = null;
    pendingFile.value = null;
    approvalError.value = null;
  }

  return {
    pendingWorkspace,
    pendingFile,
    approvalError,
    approving,
    handleToolEndOutput,
    approvePendingWorkspace,
    approvePendingFile,
    cancelPending,
  };
}
