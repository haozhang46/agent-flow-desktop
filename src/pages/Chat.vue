<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import ChatPanel from "../components/chat/ChatPanel.vue";
import PlanApprovalCard from "../components/chat/PlanApprovalCard.vue";
import WorkspaceApprovalCard from "../components/workflow/WorkspaceApprovalCard.vue";
import AgentflowFileApprovalCard from "../components/workflow/AgentflowFileApprovalCard.vue";
import { shouldShowThinking, useChatStream } from "../composables/useChatStream";
import { useChatMemory } from "../composables/useChatMemory";
import { useAutoThreadTitle } from "../composables/useAutoThreadTitle";
import { migrateLocalChatIfNeeded } from "../composables/migrateLocalChat";
import { useWorkspaceApproval } from "../composables/useWorkspaceApproval";
import {
  removeThreadSkill,
  toggleThreadSkill,
  type ChatMode,
} from "../composables/useChatThreadMeta";
import type { ChatSendPayload } from "../components/chat/ChatInputWithSlash.vue";

const MODES: { id: ChatMode; label: string }[] = [
  { id: "ask", label: "Ask" },
  { id: "plan", label: "Plan" },
  { id: "agent", label: "Agent" },
];

const chatMemory = useChatMemory({ kind: "app" });
const {
  threads,
  activeThreadId,
  messages,
  loadThreads,
  createThread,
  selectThread,
  updateTitle,
  postGenerateTitle,
  updateThreadMeta,
  addUserMessage,
  beginAssistantReply,
} = chatMemory;

const autoTitle = useAutoThreadTitle({
  threads,
  messages,
  updateTitle,
  postGenerateTitle,
});

const { sending, send, fetchSkillCatalog } = useChatStream();

const {
  pendingWorkspace: pendingWorkspaceApproval,
  pendingFile: pendingAgentflowFileApproval,
  approvalError: workspaceApprovalError,
  approving: workspaceApproving,
  handleToolEndOutput,
  approvePendingWorkspace: onApproveWorkspaceChange,
  approvePendingFile: onApproveAgentflowFileChange,
  cancelPending: onCancelWorkspaceChange,
} = useWorkspaceApproval();

const skillCatalog = ref<{ name: string; description: string }[]>([]);
const threadMeta = ref<{ mode: ChatMode; skills: string[] }>({ mode: "agent", skills: [] });
const normalizedSelectedSkills = computed(() => threadMeta.value.skills ?? []);
const sidebarCollapsed = ref(false);
const pendingPlan = ref<string | null>(null);
let syncingMeta = false;

const showThinking = computed(() => shouldShowThinking(messages.value, sending.value));

const workspace = defineModel<string>("workspace", { required: true });

void fetchSkillCatalog()
  .then((skills) => {
    skillCatalog.value = skills;
  })
  .catch(() => {
    skillCatalog.value = [];
  });

function applyThreadMeta(mode?: ChatMode, skills?: string[]) {
  syncingMeta = true;
  threadMeta.value = {
    mode: mode ?? "agent",
    skills: skills ?? [],
  };
  syncingMeta = false;
}

function activeCheckpointThreadId(): string | null {
  const id = activeThreadId.value;
  if (!id) return null;
  return threads.value.find((t) => t.id === id)?.checkpointThreadId ?? null;
}

async function ensureActiveThread() {
  if (activeThreadId.value) return;
  if (threads.value.length > 0) {
    const meta = await selectThread(threads.value[0]!.id);
    if (meta) applyThreadMeta(meta.mode, meta.skills);
    return;
  }
  const id = await createThread("New Chat");
  const thread = threads.value.find((t) => t.id === id);
  applyThreadMeta(thread?.mode, thread?.skills);
}

onMounted(async () => {
  await migrateLocalChatIfNeeded({
    fetchApiBase: async () => {
      const port = await window.desktop.getSidecarPort();
      return `http://127.0.0.1:${port}`;
    },
    loadThreads,
    getServerThreadCount: () => threads.value.length,
    createThread,
  });
  await loadThreads();
  await ensureActiveThread();
});

watch(
  threadMeta,
  (meta) => {
    if (syncingMeta || !activeThreadId.value) return;
    void updateThreadMeta({ mode: meta.mode, skills: meta.skills }).catch(() => {
      // error surfaced via chatMemory.error if needed
    });
  },
  { deep: true },
);

async function onSelectThread(id: string) {
  const meta = await selectThread(id);
  if (meta) applyThreadMeta(meta.mode, meta.skills);
  pendingPlan.value = null;
}

async function onRenameThread(id: string, title: string) {
  await updateTitle(id, title, { titleSource: "user" });
}

async function onNewChat() {
  const id = await createThread("New Chat");
  const thread = threads.value.find((t) => t.id === id);
  applyThreadMeta(thread?.mode, thread?.skills);
  pendingPlan.value = null;
}

function setMode(mode: ChatMode) {
  threadMeta.value = { ...threadMeta.value, mode };
  pendingPlan.value = null;
}

function onToggleSkill(name: string) {
  threadMeta.value = toggleThreadSkill(threadMeta.value, name);
}

function onRemoveSkill(name: string) {
  threadMeta.value = removeThreadSkill(threadMeta.value, name);
}

function messageStreaming(index: number): boolean {
  return (
    sending.value &&
    threadMeta.value.mode !== "plan" &&
    index === messages.value.length - 1 &&
    messages.value[index]?.role === "assistant"
  );
}

async function onSend(payload: ChatSendPayload) {
  const text = payload.text;
  let threadId = activeThreadId.value;
  if (!threadId) {
    threadId = await createThread("New Chat");
    const thread = threads.value.find((t) => t.id === threadId);
    applyThreadMeta(thread?.mode, thread?.skills);
  }

  const checkpointThreadId = activeCheckpointThreadId();
  if (!checkpointThreadId) return;

  addUserMessage(text);
  beginAssistantReply();
  await autoTitle.setPreviewTitle(threadId, text);

  pendingPlan.value = null;
  const result = await send({
    request: {
      kind: "agent",
      message: text,
      checkpointThreadId,
      mode: threadMeta.value.mode,
      skills: threadMeta.value.skills,
    },
    memory: chatMemory,
    mode: threadMeta.value.mode,
    onPlanReady: (content) => {
      pendingPlan.value = content;
    },
    onToolEnd: (event) => {
      handleToolEndOutput(event.output);
    },
  });
  await autoTitle.maybeGenerateTitle(threadId);
  void result;
}

async function onApprovePlan() {
  if (!pendingPlan.value) return;
  const plan = pendingPlan.value;
  pendingPlan.value = null;
  threadMeta.value = { ...threadMeta.value, mode: "agent" };
  await onSend({
    text: `Execute the following approved plan step by step. Confirm before destructive changes.\n\n${plan}`,
    attachments: [],
  });
}

function onEditPlan() {
  pendingPlan.value = null;
}

function onCancelPlan() {
  pendingPlan.value = null;
}
</script>

<template>
  <ChatPanel
    class="flex flex-1 min-h-0"
    :threads="threads"
    :active-thread-id="activeThreadId"
    v-model:sidebar-collapsed="sidebarCollapsed"
    :messages="messages"
    :loading="sending"
    :skills="skillCatalog"
    :selected-skills="normalizedSelectedSkills"
    :streaming="messageStreaming"
    @select-thread="onSelectThread"
    @create-thread="onNewChat"
    @rename-thread="onRenameThread"
    @send="onSend"
    @toggle-skill="onToggleSkill"
    @remove-skill="onRemoveSkill"
  >
    <template #sidebar-footer>
      <p class="p-2 text-xs text-gray-400 truncate border-t border-gray-200 bg-gray-50" :title="workspace">
        {{ workspace }}
      </p>
    </template>

    <template #header>
      <div class="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
        <button
          v-for="m in MODES"
          :key="m.id"
          type="button"
          class="text-xs px-3 py-1 rounded-full border transition-colors"
          :class="
            threadMeta.mode === m.id
              ? 'bg-blue-600 text-white border-blue-600'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          "
          @click="setMode(m.id)"
        >
          {{ m.label }}
        </button>
        <span class="ml-auto text-[10px] text-gray-400">
          {{ threadMeta.mode === "ask" ? "No tools" : threadMeta.mode === "plan" ? "Read-only" : "Full agent" }}
        </span>
      </div>
    </template>

    <template #messages-extra>
      <p v-if="sending && threadMeta.mode === 'plan'" class="text-gray-400 text-xs">
        Exploring workspace and drafting plan…
      </p>
      <p v-else-if="showThinking" class="text-gray-400 text-xs">Thinking…</p>
      <PlanApprovalCard
        v-if="pendingPlan && threadMeta.mode === 'plan'"
        :plan-content="pendingPlan"
        @approve="onApprovePlan"
        @edit="onEditPlan"
        @cancel="onCancelPlan"
      />
    </template>

    <template #approval>
      <div
        v-if="(pendingWorkspaceApproval || pendingAgentflowFileApproval) && threadMeta.mode === 'agent'"
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
