<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { type ToolEvent } from "@agent-flow/shared-ui";
import ChatPanel from "../components/chat/ChatPanel.vue";
import ClarificationCard from "../components/chat/ClarificationCard.vue";
import ResizableSplitLayout from "../components/chat/ResizableSplitLayout.vue";
import type { ChatSendPayload } from "../components/chat/ChatInputWithSlash.vue";
import {
  consumeChatStream,
  fetchSkillCatalog,
  openChatStream,
  shouldShowThinking,
} from "../composables/useChatStream";
import {
  useClarification,
  type ClarificationAnswer,
} from "../composables/useClarification";
import { useChatMemory } from "../composables/useChatMemory";
import { useAutoThreadTitle } from "../composables/useAutoThreadTitle";
import { removeThreadSkill, toggleThreadSkill } from "../composables/useChatThreadMeta";
import { useWorkspaceConfig } from "../composables/useWorkspaceConfig";
import { expandChatMessage } from "../utils/expandChatMessage";
import { normalizeWorkspacePath } from "../utils/normalizeWorkspacePath";
import { parseWriteFilePath } from "../utils/parseWriteFilePath";
import WorkflowConfigDrawer from "../components/workflow/WorkflowConfigDrawer.vue";
import WorkspaceDesigner from "../components/workflow/WorkspaceDesigner.vue";
import WorkspaceApprovalCard from "../components/workflow/WorkspaceApprovalCard.vue";
import AgentflowFileApprovalCard from "../components/workflow/AgentflowFileApprovalCard.vue";
import WorkflowSidebar from "../components/workflow/WorkflowSidebar.vue";
import WorkflowTemplatePicker from "../components/workflow/WorkflowTemplatePicker.vue";
import ProjectUnderstandPanel from "../components/ua/ProjectUnderstandPanel.vue";
import { getLegacyWorkspace } from "../workspace/legacyWorkspaces";
import WorkflowPanelRenderer from "../workspace/WorkflowPanelRenderer.vue";
import type { ChatFileAttachment, RuleFileEntry, ArchitecturePlanWidgetType } from "../workspace/registryComponents";
import type { WorkspaceDefinition } from "../workspace/registry";
import { useWorkspaceApproval } from "../composables/useWorkspaceApproval";
import { parsePendingWorkspaceApproval } from "../workspace/workspaceApproval";
import {
  stepReportPath,
  useWorkflow,
  type StepStatus,
  type TemplateSummary,
  type WorkflowDefinition,
  type WorkflowRunState,
  type WorkflowSummary,
} from "../composables/useWorkflow";
import {
  handleCreateChatThread,
  handleSelectChatThread,
  handleWorkflowContextChange,
} from "./workflowRunChatActions";

defineProps<{ workspace: string }>();

const workflowApi = useWorkflow();
const { fetchWorkspace, saveWorkspace } = useWorkspaceConfig();
const {
  fetchWorkflowList,
  fetchTemplates,
  fetchWorkflow,
  fetchState,
  fetchSkills,
  saveWorkflow,
  createFromTemplate,
  initWorkflow,
  activateWorkflow,
  deleteWorkflow,
  advance,
  runStep,
  fetchPhase,
  fetchGates,
  fetchDeploymentConfig,
  fetchResourceContext,
  fetchTopology,
  fetchOpsSummary,
  listWorkspace,
  readWorkspaceFile,
  writeWorkspaceFile,
  deleteWorkspacePath,
} = workflowApi;

const workflows = ref<WorkflowSummary[]>([]);
const selectedWorkflowId = ref<string | null>(null);
const activeWorkflowId = ref<string | null>(null);
const showTemplatePicker = ref(false);
const showUaPanel = ref(false);
const showConfigDrawer = ref(false);
const showWorkspaceDesigner = ref(false);
const configWorkflowId = ref<string | null>(null);
const configDefinition = ref<WorkflowDefinition | null>(null);
const templates = ref<TemplateSummary[]>([]);
const templatesLoading = ref(false);
const configSaving = ref(false);

const chatMode = ref<"step" | "free">("step");
const stepChatFileMode = ref(false);
const lastFileChatPaths = ref<string[]>([]);
const chatPanelRef = ref<InstanceType<typeof ChatPanel> | null>(null);
const skillCatalog = ref<{ name: string; description: string }[]>([]);
const threadMeta = ref<{ skills: string[] }>({ skills: [] });
let syncingThreadMeta = false;

const clarification = useClarification({
  getResumeExtras: () => {
    const extras: {
      mode?: "agent";
      skills?: string[];
      stepId?: string;
      workflowId?: string;
      paths?: string[];
    } = {
      mode: "agent",
      skills: threadMeta.value.skills.length ? threadMeta.value.skills : undefined,
      workflowId: activeWorkflowId.value ?? undefined,
    };
    if (chatMode.value === "step" && activeStepId.value) {
      extras.stepId = activeStepId.value;
    }
    if (stepChatFileMode.value && lastFileChatPaths.value.length) {
      extras.paths = lastFileChatPaths.value;
    }
    return extras;
  },
});

void fetchSkillCatalog()
  .then((skills) => {
    skillCatalog.value = skills;
  })
  .catch(() => {
    skillCatalog.value = [];
  });

function addFileToChat(item: ChatFileAttachment) {
  stepChatFileMode.value = true;
  chatPanelRef.value?.addAttachment({
    path: item.path,
    label: item.label ?? item.path.split("/").pop() ?? item.path,
  });
}

async function persistRuleFiles(files: RuleFileEntry[], componentId: string) {
  const workflowId = activeWorkflowId.value;
  const stepId = activeStepId.value;
  const workspace = fetchedWorkspace.value;
  if (!workflowId || !stepId || !workspace) {
    throw new Error("Workspace not loaded");
  }

  const updated: WorkspaceDefinition = {
    ...workspace,
    components: workspace.components.map((comp) =>
      comp.id === componentId && comp.type === "agent-rules-editor"
        ? { ...comp, props: { ...comp.props, files } }
        : comp,
    ),
  };
  fetchedWorkspace.value = await saveWorkspace(workflowId, stepId, updated);
}

async function persistArchitectureLayers(
  layers: string[],
  componentId: string,
  widgetType: ArchitecturePlanWidgetType,
) {
  const workflowId = activeWorkflowId.value;
  const stepId = activeStepId.value;
  const workspace = fetchedWorkspace.value;
  if (!workflowId || !stepId || !workspace) {
    throw new Error("Workspace not loaded");
  }

  const updated: WorkspaceDefinition = {
    ...workspace,
    components: workspace.components.map((comp) =>
      comp.id === componentId && comp.type === widgetType
        ? { ...comp, props: { ...comp.props, layers } }
        : comp,
    ),
  };
  fetchedWorkspace.value = await saveWorkspace(workflowId, stepId, updated);
}

const fileWriteListeners = new Set<(path: string) => void>();

function notifyFileWritten(path: string) {
  const normalized = normalizeWorkspacePath(path);
  for (const fn of fileWriteListeners) fn(normalized);
}

function handleWriteFileToolEnd(event: ToolEvent) {
  if (event.name !== "write_file" || event.ok === false) return;
  const path = parseWriteFilePath(event.output);
  if (path) notifyFileWritten(path);
}

const panelApi = {
  fetchPhase,
  fetchGates,
  fetchDeploymentConfig,
  fetchResourceContext,
  fetchTopology,
  fetchOpsSummary,
  listWorkspace,
  readWorkspaceFile,
  writeWorkspaceFile,
  deleteWorkspacePath,
  addToChat: addFileToChat,
  persistRuleFiles,
  persistArchitectureLayers,
  subscribeFileWrites: (fn) => {
    fileWriteListeners.add(fn);
    return () => fileWriteListeners.delete(fn);
  },
};

const loading = ref(true);
const initLoading = ref(false);
const error = ref<string | null>(null);
const workflow = ref<WorkflowDefinition | null>(null);
const state = ref<WorkflowRunState | null>(null);
const allSkills = ref<string[]>([]);
const viewingStepId = ref<string | null>(null);
const liveOutput = ref<Record<string, string>>({});
const running = ref(false);
const advancing = ref(false);
const actionError = ref<string | null>(null);

const WORKSPACE_MUTATING_TOOLS = new Set([
  "workspace_add_component",
  "workspace_update_component",
  "workspace_remove_component",
  "workspace_reorder",
  "workspace_set_layout",
]);

const fetchedWorkspace = ref<WorkspaceDefinition | null>(null);
const workspaceResolved = ref(false);

const {
  pendingWorkspace: pendingWorkspaceApproval,
  pendingFile: pendingAgentflowFileApproval,
  approvalError: workspaceApprovalError,
  approving: workspaceApproving,
  handleToolEndOutput,
  approvePendingWorkspace: onApproveWorkspaceChange,
  approvePendingFile: onApproveAgentflowFileChange,
  cancelPending: onCancelWorkspaceChange,
} = useWorkspaceApproval(
  async (workflowId, stepId) => {
    if (activeWorkflowId.value === workflowId) {
      await refreshWorkspaceForStep(workflowId, stepId);
    }
  },
  (path) => notifyFileWritten(path),
);

const CHAT_PERCENT_KEY = "workflow-chat-percent";
const CHAT_LIST_COLLAPSED_KEY = "workflow-chat-list-collapsed";
const chatPercent = ref(30);
const chatListCollapsed = ref(false);

function loadChatListCollapsed() {
  chatListCollapsed.value = localStorage.getItem(CHAT_LIST_COLLAPSED_KEY) === "true";
}

function saveChatListCollapsed() {
  localStorage.setItem(CHAT_LIST_COLLAPSED_KEY, String(chatListCollapsed.value));
}

const activeStepId = computed(() => viewingStepId.value ?? state.value?.currentStepId ?? null);

const stepChatMemory = useChatMemory({
  kind: "step",
  workflowId: activeWorkflowId,
  stepId: activeStepId,
});

const freeChatMemory = useChatMemory({
  kind: "free",
  workflowId: activeWorkflowId,
});

const stepAutoTitle = useAutoThreadTitle({
  threads: stepChatMemory.threads,
  messages: stepChatMemory.messages,
  updateTitle: stepChatMemory.updateTitle,
  postGenerateTitle: stepChatMemory.postGenerateTitle,
});

const freeAutoTitle = useAutoThreadTitle({
  threads: freeChatMemory.threads,
  messages: freeChatMemory.messages,
  updateTitle: freeChatMemory.updateTitle,
  postGenerateTitle: freeChatMemory.postGenerateTitle,
});

const freeSending = ref(false);

const activeChatMemory = computed(() =>
  chatMode.value === "step" ? stepChatMemory : freeChatMemory,
);

const activeChatThreads = computed(() => activeChatMemory.value.threads.value);
const activeChatThreadId = computed(() => activeChatMemory.value.activeThreadId.value);
const activeChatMessages = computed(() => activeChatMemory.value.messages.value);
const activeChatLoading = computed(() =>
  chatMode.value === "step" ? running.value : freeSending.value,
);
const activeShowThinking = computed(() =>
  shouldShowThinking(activeChatMessages.value, activeChatLoading.value),
);
const normalizedSelectedSkills = computed(() => threadMeta.value.skills ?? []);

function applyThreadSkills(skills?: string[]) {
  syncingThreadMeta = true;
  threadMeta.value = { skills: skills ?? [] };
  syncingThreadMeta = false;
}

function syncThreadSkillsFromActiveThread() {
  const memory = activeChatMemory.value;
  const activeId = memory.activeThreadId.value;
  if (!activeId) {
    applyThreadSkills([]);
    return;
  }
  const thread = memory.threads.value.find((t) => t.id === activeId);
  applyThreadSkills(thread?.skills);
}

async function ensureActiveChatThread() {
  const memory = activeChatMemory.value;
  if (memory.loading.value) return;
  if (memory.activeThreadId.value) {
    syncThreadSkillsFromActiveThread();
    return;
  }
  if (memory.threads.value.length > 0) {
    const meta = await memory.selectThread(memory.threads.value[0]!.id);
    applyThreadSkills(meta?.skills);
    return;
  }
  const query =
    chatMode.value === "step"
      ? activeWorkflowId.value && activeStepId.value
      : activeWorkflowId.value;
  if (!query) return;
  try {
    await memory.createThread("New Chat");
    syncThreadSkillsFromActiveThread();
  } catch {
    // scope not ready
  }
}

async function onSelectChatThread(id: string) {
  await handleSelectChatThread(id, {
    cancelPending: clarification.cancelPending,
    selectThread: (threadId) => activeChatMemory.value.selectThread(threadId),
    applyThreadSkills,
  });
}

function onCreateChatThread() {
  handleCreateChatThread({
    cancelPending: clarification.cancelPending,
    createThread: (title) => activeChatMemory.value.createThread(title),
    syncThreadSkills: syncThreadSkillsFromActiveThread,
  });
}

function onRenameChatThread(id: string, title: string) {
  void activeChatMemory.value.updateTitle(id, title, { titleSource: "user" });
}

function onToggleSkill(name: string) {
  threadMeta.value = toggleThreadSkill({ mode: "agent", skills: threadMeta.value.skills }, name);
}

function onRemoveSkill(name: string) {
  threadMeta.value = removeThreadSkill({ mode: "agent", skills: threadMeta.value.skills }, name);
}

function activeMessageKey(index: number): string | number {
  if (chatMode.value === "step" && activeStepId.value) {
    return `${activeStepId.value}-${index}`;
  }
  return index;
}

function activeMessageStreaming(index: number): boolean {
  const msgs = activeChatMessages.value;
  return (
    activeChatLoading.value &&
    index === msgs.length - 1 &&
    msgs[index]?.role === "assistant"
  );
}

function activeThreadCheckpointId(): string | null {
  const memory = activeChatMemory.value;
  const id = memory.activeThreadId.value;
  if (!id) return null;
  return memory.threads.value.find((t) => t.id === id)?.checkpointThreadId ?? null;
}

const canOperateActive = computed(
  () =>
    selectedWorkflowId.value != null &&
    activeWorkflowId.value != null &&
    selectedWorkflowId.value === activeWorkflowId.value,
);

const sidebarSteps = computed(() => {
  if (!workflow.value || !state.value) return [];
  return workflow.value.steps.map((step) => ({
    id: step.id,
    title: step.title,
    status: (state.value!.stepStatuses[step.id] ?? "pending") as StepStatus,
  }));
});

const configWorkflowSummary = computed(
  () => workflows.value.find((w) => w.id === configWorkflowId.value) ?? null,
);

const activeWorkflowTitle = computed(() => {
  const active = workflows.value.find((w) => w.id === activeWorkflowId.value);
  return active?.title ?? workflow.value?.title ?? "Workflow";
});

const needsWorkflowInit = computed(
  () => !loading.value && !error.value && workflows.value.length === 0,
);

function isWorkflowSetupError(message: string): boolean {
  return (
    message.includes("Workflow not found") ||
    message.includes("No workflows configured") ||
    message.includes("/v1/workflow/state") ||
    message.includes("/v1/workflows/current")
  );
}

const showInitWorkflowAction = computed(
  () => needsWorkflowInit.value || (error.value != null && isWorkflowSetupError(error.value)),
);

const currentStep = computed(() => {
  const id = activeStepId.value;
  return workflow.value?.steps.find((s) => s.id === id) ?? null;
});

const resolvedWorkspace = computed(() => fetchedWorkspace.value);

const panelRuntime = computed(() => ({
  stepId: activeStepId.value ?? undefined,
  stepTitle: currentStep.value?.title,
  status: currentStepStatus.value,
  reportPath: activeStepId.value ? stepReportPath(activeStepId.value) : null,
  running: running.value && state.value?.currentStepId === activeStepId.value,
  liveOutput: currentLiveOutput.value,
}));

const currentLiveOutput = computed(() => {
  const id = activeStepId.value;
  if (!id) return "";
  return liveOutput.value[id] ?? "";
});

const currentStepStatus = computed((): StepStatus => {
  const id = activeStepId.value;
  if (!id || !state.value) return "pending";
  return state.value.stepStatuses[id] ?? "pending";
});

onMounted(() => {
  loadChatListCollapsed();
  void loadData();
});

watch(chatListCollapsed, saveChatListCollapsed);

watch(
  threadMeta,
  (meta) => {
    if (syncingThreadMeta || !activeChatMemory.value.activeThreadId.value) return;
    void activeChatMemory.value.updateThreadMeta({ skills: meta.skills }).catch(() => {
      // error surfaced via chatMemory.error if needed
    });
  },
  { deep: true },
);

watch(chatMode, () => {
  clarification.cancelPending();
  void ensureActiveChatThread();
});

watch(
  () => [chatMode.value, stepChatMemory.threads.value.length, freeChatMemory.threads.value.length] as const,
  () => {
    void ensureActiveChatThread();
  },
);

watch(
  () => stepChatMemory.loading.value || freeChatMemory.loading.value,
  (loading) => {
    if (!loading) void ensureActiveChatThread();
  },
);

watch(
  () => state.value?.currentStepId,
  (id) => {
    if (id && !viewingStepId.value) {
      viewingStepId.value = id;
    }
  },
);

watch(
  () => [selectedWorkflowId.value, activeStepId.value] as const,
  async ([workflowId, stepId]) => {
    handleWorkflowContextChange(clarification.cancelPending);
    fetchedWorkspace.value = null;
    workspaceResolved.value = false;
    if (!workflowId || !stepId) {
      workspaceResolved.value = true;
      return;
    }
    try {
      fetchedWorkspace.value = await fetchWorkspace(workflowId, stepId);
    } catch {
      fetchedWorkspace.value = getLegacyWorkspace(stepId) ?? null;
    } finally {
      workspaceResolved.value = true;
    }
  },
  { immediate: true },
);

async function loadSelectedWorkflow() {
  const id = selectedWorkflowId.value;
  if (!id) return;
  const [wf, st] = await Promise.all([fetchWorkflow(id), fetchState(id)]);
  workflow.value = wf;
  state.value = st;
  if (!viewingStepId.value || !wf.steps.some((s) => s.id === viewingStepId.value)) {
    viewingStepId.value = st.currentStepId;
  }
}

async function loadData() {
  loading.value = true;
  error.value = null;
  try {
    const [list, skills] = await Promise.all([fetchWorkflowList(), fetchSkills()]);
    workflows.value = list.workflows;
    activeWorkflowId.value = list.activeWorkflowId;
    allSkills.value = skills;
    if (list.workflows.length === 0) {
      workflow.value = null;
      state.value = null;
      selectedWorkflowId.value = null;
      return;
    }
    selectedWorkflowId.value = list.activeWorkflowId ?? list.workflows[0].id;
    await loadSelectedWorkflow();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function initWorkflowConfig() {
  initLoading.value = true;
  error.value = null;
  try {
    await initWorkflow("default-dev-cicd");
    await loadData();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    initLoading.value = false;
  }
}

async function onSelectWorkflow(workflowId: string) {
  selectedWorkflowId.value = workflowId;
  try {
    await loadSelectedWorkflow();
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}

async function openTemplatePicker() {
  showTemplatePicker.value = true;
  templatesLoading.value = true;
  try {
    const res = await fetchTemplates();
    templates.value = res.templates;
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    templatesLoading.value = false;
  }
}

function openUaPanel() {
  showUaPanel.value = true;
}

async function onUaWorkflowApplied(workflowId: string) {
  showUaPanel.value = false;
  try {
    const list = await fetchWorkflowList();
    workflows.value = list.workflows;
    activeWorkflowId.value = list.activeWorkflowId;
    selectedWorkflowId.value = workflowId;
    await loadSelectedWorkflow();
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}

async function onTemplateSelect(templateId: string) {
  showTemplatePicker.value = false;
  try {
    const { workflowId } = await createFromTemplate(templateId);
    const list = await fetchWorkflowList();
    workflows.value = list.workflows;
    activeWorkflowId.value = list.activeWorkflowId;
    selectedWorkflowId.value = workflowId;
    await loadSelectedWorkflow();
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}

async function openConfigDrawer(workflowId: string) {
  configWorkflowId.value = workflowId;
  showConfigDrawer.value = true;
  try {
    configDefinition.value = await fetchWorkflow(workflowId);
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}

async function onConfigSave(definition: WorkflowDefinition) {
  if (!configWorkflowId.value) return;
  configSaving.value = true;
  actionError.value = null;
  try {
    await saveWorkflow(configWorkflowId.value, definition);
    const list = await fetchWorkflowList();
    workflows.value = list.workflows;
    if (selectedWorkflowId.value === configWorkflowId.value) {
      await loadSelectedWorkflow();
    }
    showConfigDrawer.value = false;
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    configSaving.value = false;
  }
}

async function onConfigActivate() {
  if (!configWorkflowId.value) return;
  try {
    await activateWorkflow(configWorkflowId.value);
    const list = await fetchWorkflowList();
    workflows.value = list.workflows;
    activeWorkflowId.value = list.activeWorkflowId;
    selectedWorkflowId.value = configWorkflowId.value;
    await loadSelectedWorkflow();
    showConfigDrawer.value = false;
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}

async function onConfigDelete() {
  if (!configWorkflowId.value) return;
  try {
    await deleteWorkflow(configWorkflowId.value);
    const list = await fetchWorkflowList();
    workflows.value = list.workflows;
    activeWorkflowId.value = list.activeWorkflowId;
    selectedWorkflowId.value = list.activeWorkflowId;
    showConfigDrawer.value = false;
    await loadSelectedWorkflow();
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}

function selectStep(stepId: string) {
  viewingStepId.value = stepId;
}

function openWorkspaceDesigner() {
  if (!selectedWorkflowId.value) return;
  showWorkspaceDesigner.value = true;
}

async function onWorkspaceSaved(definition: WorkspaceDefinition) {
  if (
    selectedWorkflowId.value &&
    activeStepId.value === definition.stepId
  ) {
    fetchedWorkspace.value = definition;
  }
  showWorkspaceDesigner.value = false;
}

async function refreshWorkspaceForStep(workflowId: string, stepId: string) {
  try {
    fetchedWorkspace.value = await fetchWorkspace(workflowId, stepId);
  } catch {
    fetchedWorkspace.value = getLegacyWorkspace(stepId) ?? null;
  }
}

async function onChatSend(payload: ChatSendPayload) {
  if (chatMode.value === "step") {
    await onStepSend(payload);
  } else {
    await onFreeSend(payload);
  }
}

async function onStepSend(payload: ChatSendPayload) {
  if (!canOperateActive.value || !activeWorkflowId.value) {
    actionError.value = "Switch to the active workflow to run steps.";
    return;
  }
  const stepId = activeStepId.value;
  if (!stepId) return;

  if (!stepChatMemory.activeThreadId.value) {
    await ensureActiveChatThread();
  }
  const threadId = stepChatMemory.activeThreadId.value;
  if (!threadId) return;
  const checkpointThreadId = stepChatMemory.threads.value.find((t) => t.id === threadId)?.checkpointThreadId;
  if (!checkpointThreadId) return;

  let expanded: string;
  try {
    expanded = await expandChatMessage(payload.text, payload.attachments, readWorkspaceFile);
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
    return;
  }
  clarification.cancelPending();
  stepChatMemory.addUserMessage(
    payload.text,
    payload.attachments.map((a) => a.path),
  );
  stepChatMemory.beginAssistantReply();
  await stepAutoTitle.setPreviewTitle(threadId, payload.text);
  liveOutput.value[stepId] = "";

  running.value = true;
  actionError.value = null;
  try {
    const skills = threadMeta.value.skills.length ? threadMeta.value.skills : undefined;
    const useFileChat = payload.attachments.length > 0;
    stepChatFileMode.value = useFileChat;
    lastFileChatPaths.value = useFileChat
      ? payload.attachments.map((a) => a.path)
      : [];

    const stream = await openChatStream(
      useFileChat
        ? {
            kind: "file",
            message: expanded,
            paths: payload.attachments.map((a) => a.path),
            skills,
            stepId,
            uiThreadId: threadId,
            workflowId: activeWorkflowId.value,
          }
        : {
            kind: "agent",
            message: expanded,
            checkpointThreadId,
            mode: "agent",
            skills,
            workflowId: activeWorkflowId.value,
            stepId,
          },
    );

    await consumeChatStream(stream, {
      memory: stepChatMemory,
      mode: "agent",
      onClarification: clarification.applyClarificationEvent,
      onMessageChunk: (content) => {
        liveOutput.value[stepId] = (liveOutput.value[stepId] ?? "") + content;
      },
      onToolEnd: async (event) => {
        handleWriteFileToolEnd(event);
        if (event.output) {
          handleToolEndOutput(event.output);
        }
        const toolName = event.name;
        if (
          toolName &&
          WORKSPACE_MUTATING_TOOLS.has(toolName) &&
          event.ok !== false &&
          activeWorkflowId.value &&
          event.output &&
          !parsePendingWorkspaceApproval(event.output)
        ) {
          await refreshWorkspaceForStep(activeWorkflowId.value, stepId);
        }
      },
    });
    await stepAutoTitle.maybeGenerateTitle(threadId);
    state.value = await fetchState(activeWorkflowId.value);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stepChatMemory.addAssistantChunk(`\n\nError: ${message}`);
    actionError.value = message;
  } finally {
    running.value = false;
  }
}

async function onAdvance(action: "continue" | "skip" | "retry") {
  if (!canOperateActive.value || !activeWorkflowId.value) {
    actionError.value = "Switch to the active workflow to run pipeline actions.";
    return;
  }
  advancing.value = true;
  actionError.value = null;
  try {
    state.value = await advance(action, activeWorkflowId.value);
    viewingStepId.value = state.value.currentStepId;
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    advancing.value = false;
  }
}

async function onFreeSend(payload: ChatSendPayload) {
  if (!activeWorkflowId.value) {
    actionError.value = "Switch to the active workflow to use free chat.";
    return;
  }

  if (!freeChatMemory.activeThreadId.value) {
    await ensureActiveChatThread();
  }
  const threadId = freeChatMemory.activeThreadId.value;
  if (!threadId) return;
  const checkpointThreadId = freeChatMemory.threads.value.find((t) => t.id === threadId)?.checkpointThreadId;
  if (!checkpointThreadId) return;

  let expanded: string;
  try {
    expanded = await expandChatMessage(payload.text, payload.attachments, readWorkspaceFile);
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
    return;
  }

  clarification.cancelPending();
  stepChatFileMode.value = false;
  lastFileChatPaths.value = [];
  freeChatMemory.addUserMessage(payload.text, payload.attachments.map((a) => a.path));
  freeChatMemory.beginAssistantReply();
  await freeAutoTitle.setPreviewTitle(threadId, payload.text);
  freeSending.value = true;
  actionError.value = null;
  try {
    const skills = threadMeta.value.skills.length ? threadMeta.value.skills : undefined;
    const stream = await openChatStream({
      kind: "agent",
      message: expanded,
      checkpointThreadId,
      mode: "agent",
      skills,
      workflowId: activeWorkflowId.value,
    });
    await consumeChatStream(stream, {
      memory: freeChatMemory,
      mode: "agent",
      onClarification: clarification.applyClarificationEvent,
      onToolEnd: (event) => {
        handleWriteFileToolEnd(event);
        handleToolEndOutput(event.output);
      },
    });
    await freeAutoTitle.maybeGenerateTitle(threadId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    freeChatMemory.addAssistantChunk(`Error: ${message}`);
    actionError.value = message;
  } finally {
    freeSending.value = false;
  }
}

async function onClarificationSubmit(answer: ClarificationAnswer) {
  const memory = chatMode.value === "step" ? stepChatMemory : freeChatMemory;
  const stepId = activeStepId.value;
  const isStep = chatMode.value === "step";

  if (isStep) {
    running.value = true;
  } else {
    freeSending.value = true;
  }
  actionError.value = null;

  try {
    const stream = await clarification.submit(answer);
    const result = await consumeChatStream(stream, {
      memory,
      mode: "agent",
      onClarification: clarification.applyClarificationEvent,
      onMessageChunk: isStep && stepId
        ? (content) => {
            liveOutput.value[stepId] = (liveOutput.value[stepId] ?? "") + content;
          }
        : undefined,
      onToolEnd: async (event) => {
        handleWriteFileToolEnd(event);
        if (event.output) {
          handleToolEndOutput(event.output);
        }
        if (
          isStep &&
          stepId &&
          event.name &&
          WORKSPACE_MUTATING_TOOLS.has(event.name) &&
          event.ok !== false &&
          activeWorkflowId.value &&
          event.output &&
          !parsePendingWorkspaceApproval(event.output)
        ) {
          await refreshWorkspaceForStep(activeWorkflowId.value, stepId);
        }
      },
    });
    if (!result.awaitingClarification) {
      clarification.markAnswered();
    }
    if (isStep && activeWorkflowId.value) {
      state.value = await fetchState(activeWorkflowId.value);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    actionError.value = message;
  } finally {
    if (isStep) {
      running.value = false;
    } else {
      freeSending.value = false;
    }
  }
}
</script>

<template>
  <div class="flex flex-1 min-h-0 flex-col">
    <div
      v-if="loading"
      class="flex flex-1 items-center justify-center text-gray-500"
    >
      Loading workflow…
    </div>

    <div
      v-else-if="error || needsWorkflowInit"
      class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <p v-if="needsWorkflowInit && !error" class="text-gray-600">
        This project has no workflow configuration yet.
      </p>
      <p v-if="error" class="text-red-600">{{ error }}</p>
      <div class="flex flex-wrap items-center justify-center gap-2">
        <button
          v-if="showInitWorkflowAction"
          class="btn-primary text-sm"
          :disabled="initLoading"
          @click="initWorkflowConfig"
        >
          {{ initLoading ? "Initializing…" : "Initialize workflow config" }}
        </button>
        <button
          v-if="error"
          class="btn-primary text-sm bg-gray-600 hover:bg-gray-700"
          :disabled="initLoading"
          @click="loadData"
        >
          Retry
        </button>
      </div>
    </div>

    <template v-else-if="workflow && state">
      <header
        class="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2"
      >
        <h1 class="text-sm font-semibold text-gray-800">{{ workflow.title }}</h1>
        <span
          v-if="!canOperateActive"
          class="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded"
        >
          View only — active: {{ activeWorkflowTitle }}
        </span>
        <div class="ml-auto flex flex-wrap items-center gap-2">
          <button
            class="btn-primary text-xs py-1 px-3"
            :disabled="advancing || running || !canOperateActive"
            @click="onAdvance('continue')"
          >
            Continue
          </button>
          <button
            class="text-xs px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            :disabled="advancing || running || !canOperateActive"
            @click="onAdvance('skip')"
          >
            Skip
          </button>
          <button
            class="text-xs px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            :disabled="advancing || running || !canOperateActive"
            @click="onAdvance('retry')"
          >
            Retry
          </button>
        </div>
      </header>

      <p v-if="actionError" class="px-4 py-1 text-xs text-red-600 bg-red-50">
        {{ actionError }}
      </p>

      <div class="flex flex-1 min-h-0">
        <WorkflowSidebar
          :workflows="workflows"
          :steps="sidebarSteps"
          :selected-workflow-id="selectedWorkflowId"
          :active-workflow-id="activeWorkflowId"
          :viewing-step-id="activeStepId"
          @select-workflow="onSelectWorkflow"
          @config-workflow="openConfigDrawer"
          @design-workspace="openWorkspaceDesigner"
          @select-step="selectStep"
          @add-workflow="openTemplatePicker"
          @from-project="openUaPanel"
        />

        <ResizableSplitLayout
          v-model:panel-percent="chatPercent"
          :storage-key="CHAT_PERCENT_KEY"
          class="flex flex-1 min-w-0 min-h-0"
        >
          <template #main>
            <WorkflowPanelRenderer
              v-if="workspaceResolved && resolvedWorkspace"
              :workspace="resolvedWorkspace"
              :api="panelApi"
              :runtime="panelRuntime"
            />
            <p
              v-else-if="workspaceResolved"
              class="flex flex-1 items-center justify-center text-sm text-gray-500"
            >
              No workspace configured for this step.
            </p>
          </template>

          <template #panel>
            <ChatPanel
              ref="chatPanelRef"
              :threads="activeChatThreads"
              :active-thread-id="activeChatThreadId"
              v-model:sidebar-collapsed="chatListCollapsed"
              :messages="activeChatMessages"
              :loading="activeChatLoading"
              :disabled="chatMode === 'step' && !canOperateActive"
              :skills="skillCatalog"
              :selected-skills="normalizedSelectedSkills"
              :message-key="activeMessageKey"
              :streaming="activeMessageStreaming"
              @select-thread="onSelectChatThread"
              @create-thread="onCreateChatThread"
              @rename-thread="onRenameChatThread"
              @send="onChatSend"
              @toggle-skill="onToggleSkill"
              @remove-skill="onRemoveSkill"
            >
              <template #header>
                <div class="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
                  <button
                    class="text-xs px-2 py-1 rounded"
                    :class="
                      chatMode === 'step'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    "
                    @click="chatMode = 'step'"
                  >
                    Step Chat
                  </button>
                  <button
                    class="text-xs px-2 py-1 rounded"
                    :class="
                      chatMode === 'free'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    "
                    @click="chatMode = 'free'"
                  >
                    Free Chat
                  </button>
                  <span
                    v-if="chatMode === 'step' && currentStep"
                    class="ml-auto text-[10px] text-gray-400 truncate max-w-[40%]"
                  >
                    <span
                      v-if="stepChatFileMode"
                      class="mr-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200"
                    >
                      File mode
                    </span>
                    {{ currentStep.title }}
                  </span>
                </div>
              </template>

              <template #messages-extra>
                <div
                  v-if="chatMode === 'step' && !running && !activeChatMessages.length"
                  class="text-gray-400 text-xs"
                >
                  Chat with agent to run {{ currentStep?.title ?? "this step" }}.
                </div>
                <div v-if="activeShowThinking" class="text-gray-400 text-xs">Thinking…</div>
                <ClarificationCard
                  v-if="clarification.pending.value"
                  :question="clarification.pending.value.question"
                  :options="clarification.pending.value.options"
                  :allow-multiple="clarification.pending.value.allow_multiple"
                  :allow-free-text="clarification.pending.value.allow_free_text"
                  :status="clarification.cardStatus.value"
                  :error="clarification.error.value"
                  @submit="onClarificationSubmit"
                />
              </template>

              <template #approval>
                <div
                  v-if="pendingWorkspaceApproval || pendingAgentflowFileApproval"
                  class="shrink-0 px-4 py-2 border-t border-amber-100 bg-white space-y-1"
                >
                  <WorkspaceApprovalCard
                    v-if="pendingWorkspaceApproval"
                    compact
                    :summary="pendingWorkspaceApproval.summary"
                    :before="pendingWorkspaceApproval.before"
                    :after="pendingWorkspaceApproval.after"
                    :approving="workspaceApproving"
                    @approve="onApproveWorkspaceChange"
                    @cancel="onCancelWorkspaceChange"
                  />
                  <AgentflowFileApprovalCard
                    v-if="pendingAgentflowFileApproval"
                    compact
                    :path="pendingAgentflowFileApproval.path"
                    :summary="pendingAgentflowFileApproval.summary"
                    :before="pendingAgentflowFileApproval.before"
                    :after="pendingAgentflowFileApproval.after"
                    :approving="workspaceApproving"
                    @approve="onApproveAgentflowFileChange"
                    @cancel="onCancelWorkspaceChange"
                  />
                  <p v-if="workspaceApprovalError" class="text-xs text-red-600">
                    {{ workspaceApprovalError }}
                  </p>
                </div>
              </template>
            </ChatPanel>
          </template>
        </ResizableSplitLayout>
      </div>

      <WorkflowTemplatePicker
        :show="showTemplatePicker"
        :templates="templates"
        :loading="templatesLoading"
        @close="showTemplatePicker = false"
        @select="onTemplateSelect"
      />

      <ProjectUnderstandPanel
        :show="showUaPanel"
        @close="showUaPanel = false"
        @applied="onUaWorkflowApplied"
      />

      <WorkflowConfigDrawer
        :show="showConfigDrawer"
        :workflow="configWorkflowSummary"
        :definition="configDefinition"
        :saving="configSaving"
        @close="showConfigDrawer = false"
        @save="onConfigSave"
        @activate="onConfigActivate"
        @delete="onConfigDelete"
      />

      <WorkspaceDesigner
        :show="showWorkspaceDesigner"
        :workflow-id="selectedWorkflowId"
        :steps="workflow.steps.map((s) => ({ id: s.id, title: s.title }))"
        :initial-step-id="activeStepId"
        :skills="allSkills"
        :panel-api="panelApi"
        @close="showWorkspaceDesigner = false"
        @saved="onWorkspaceSaved"
      />
    </template>
  </div>
</template>
