<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useUa } from "../../composables/useUa";
import type {
  AnalyzeProgress,
  GraphSummary,
  UaStatus,
  WorkflowDraft,
} from "../../types/ua";
import GoalField from "./GoalField.vue";
import GraphSummaryView from "./GraphSummaryView.vue";

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  close: [];
  "open-preview": [];
  applied: [workflowId: string];
}>();

const {
  fetchStatus,
  startAnalyze,
  cancelAnalyze,
  pollProgress,
  generateWorkflow,
  applyWorkflow,
} = useUa();

const status = ref<UaStatus | null>(null);
const progress = ref<AnalyzeProgress | null>(null);
const goal = ref("");
const draft = ref<WorkflowDraft | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);
const generating = ref(false);
const applying = ref(false);
const showExplorerStub = ref(false);

let pollTimer: ReturnType<typeof setInterval> | null = null;

const summary = computed<GraphSummary | null>(
  () => status.value?.summary ?? null,
);
const hasGraph = computed(() => status.value?.hasGraph === true);
const busy = computed(() => status.value?.busy === true || generating.value);
const generateDisabled = computed(() => !hasGraph.value || busy.value);

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function refreshStatus(): Promise<void> {
  status.value = await fetchStatus();
  if (!status.value.busy) {
    stopPolling();
  }
}

async function tickProgress(): Promise<void> {
  try {
    progress.value = await pollProgress();
    await refreshStatus();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    stopPolling();
  }
}

function startPolling(): void {
  stopPolling();
  pollTimer = setInterval(() => {
    void tickProgress();
  }, 1000);
  void tickProgress();
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  showExplorerStub.value = false;
  try {
    await refreshStatus();
    if (status.value?.busy) {
      startPolling();
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function onAnalyze(): Promise<void> {
  error.value = null;
  if (!hasGraph.value) {
    const ok = window.confirm(
      "Analyzing this project may consume a significant number of LLM tokens. Continue?",
    );
    if (!ok) return;
  }
  try {
    await startAnalyze();
    await refreshStatus();
    startPolling();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

async function onCancel(): Promise<void> {
  error.value = null;
  try {
    await cancelAnalyze();
    await refreshStatus();
    stopPolling();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

async function onGenerate(): Promise<void> {
  if (generateDisabled.value) return;
  error.value = null;
  generating.value = true;
  draft.value = null;
  try {
    const res = await generateWorkflow(goal.value || null);
    draft.value = res.draft;
    await refreshStatus();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    generating.value = false;
  }
}

async function onApply(): Promise<void> {
  if (!draft.value) return;
  error.value = null;
  applying.value = true;
  try {
    const res = await applyWorkflow(draft.value, { activate: true });
    emit("applied", res.workflowId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    applying.value = false;
  }
}

function onPreview(): void {
  showExplorerStub.value = true;
  emit("open-preview");
}

function onClose(): void {
  stopPolling();
  emit("close");
}

watch(
  () => props.show,
  (show) => {
    if (show) {
      void load();
    } else {
      stopPolling();
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
    data-testid="ua-panel-overlay"
    @click.self="onClose"
  >
    <div
      class="bg-white rounded-lg shadow-lg w-[28rem] max-h-[80vh] flex flex-col"
      data-testid="ua-project-understand-panel"
    >
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 class="text-sm font-semibold text-gray-800">Understand project</h2>
        <button
          type="button"
          class="text-gray-500 hover:text-gray-800"
          data-testid="ua-panel-close"
          @click="onClose"
        >
          ×
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <div v-if="loading" class="text-xs text-gray-500" data-testid="ua-panel-loading">
          Loading status…
        </div>

        <p v-if="error" class="text-xs text-red-600" data-testid="ua-panel-error">
          {{ error }}
        </p>

        <div
          v-if="status"
          class="text-xs text-gray-600 space-y-1"
          data-testid="ua-panel-status"
        >
          <p>
            Graph:
            <span class="font-medium text-gray-800">
              {{ hasGraph ? "ready" : "none" }}
            </span>
          </p>
          <p v-if="busy">
            Busy:
            <span class="font-medium text-blue-700">
              {{ status.busyKind ?? (generating ? "generate" : "…") }}
            </span>
          </p>
          <p
            v-if="progress"
            class="text-gray-500"
            data-testid="ua-panel-progress"
          >
            {{ progress.phase }} — {{ progress.message }}
            <span v-if="progress.percent != null"> ({{ progress.percent }}%)</span>
          </p>
        </div>

        <GraphSummaryView v-if="hasGraph && summary" :summary="summary" />

        <p
          v-else-if="!loading && status && !hasGraph"
          class="text-xs text-gray-500"
          data-testid="ua-panel-no-graph"
        >
          No knowledge graph yet. Run Analyze to build one from this project.
        </p>

        <div
          v-if="showExplorerStub"
          class="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-3 py-2"
          data-testid="ua-explorer-stub"
        >
          Graph explorer coming in Task 9. Summary above is available now.
        </div>

        <GoalField v-model="goal" />

        <div
          v-if="draft"
          class="text-xs border border-gray-100 rounded px-3 py-2 space-y-1"
          data-testid="ua-draft-stub"
        >
          <p class="font-medium text-gray-800">
            Draft ready: {{ draft.workflow.title }}
          </p>
          <p class="text-gray-500">
            {{ draft.workflow.steps.length }} steps — full review UI in Task 9.
          </p>
          <button
            type="button"
            class="text-blue-600 hover:underline"
            data-testid="ua-apply-draft"
            :disabled="applying"
            @click="onApply"
          >
            {{ applying ? "Applying…" : "Apply draft" }}
          </button>
        </div>
      </div>

      <div
        class="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-gray-200"
      >
        <button
          type="button"
          class="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          data-testid="ua-analyze"
          :disabled="busy && status?.busyKind === 'analyze'"
          @click="onAnalyze"
        >
          Analyze
        </button>
        <button
          v-if="status?.busyKind === 'analyze'"
          type="button"
          class="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"
          data-testid="ua-cancel-analyze"
          @click="onCancel"
        >
          Cancel
        </button>
        <button
          type="button"
          class="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          data-testid="ua-preview"
          :disabled="!hasGraph"
          @click="onPreview"
        >
          Preview
        </button>
        <button
          type="button"
          class="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 ml-auto"
          data-testid="ua-generate"
          :disabled="generateDisabled"
          @click="onGenerate"
        >
          {{ generating ? "Generating…" : "Generate workflow" }}
        </button>
      </div>
    </div>
  </div>
</template>
