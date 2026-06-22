<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import MarkdownPreview from "./MarkdownPreview.vue";
import type { GateResult, StepStatus } from "../../composables/useWorkflow";
import type { useWorkflow } from "../../composables/useWorkflow";

type WorkflowApi = Pick<
  ReturnType<typeof useWorkflow>,
  "fetchPhase" | "fetchGates" | "readWorkspaceFile"
>;

const props = defineProps<{
  api: WorkflowApi;
  stepId: string;
  stepTitle: string;
  status: StepStatus;
  reportPath: string | null;
  running: boolean;
  liveOutput: string;
}>();

const phaseContent = ref<string | null>(null);
const gateResults = ref<GateResult[]>([]);
const reportContent = ref<string | null>(null);
const loading = ref(false);

const statusLabel: Record<StepStatus, string> = {
  pending: "Pending",
  running: "Running",
  done: "Done",
  failed: "Failed",
  skipped: "Skipped",
};

const statusClass: Record<StepStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  running: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-yellow-100 text-yellow-800",
};

const gateClass = (status: GateResult["status"]) => {
  if (status === "PASS") return "text-green-700 bg-green-50";
  if (status === "FAIL") return "text-red-700 bg-red-50";
  return "text-gray-600 bg-gray-50";
};

const showLive = computed(() => props.running || props.liveOutput.length > 0);

async function refresh() {
  loading.value = true;
  try {
    const [phase, gates] = await Promise.all([
      props.api.fetchPhase(props.stepId),
      props.api.fetchGates(props.stepId),
    ]);
    phaseContent.value = phase.content;
    gateResults.value = gates.results;

    if (props.reportPath) {
      try {
        const report = await props.api.readWorkspaceFile(props.reportPath);
        reportContent.value = report.content;
      } catch {
        reportContent.value = null;
      }
    } else {
      reportContent.value = null;
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void refresh();
});

watch(
  () => [props.stepId, props.status, props.running] as const,
  () => {
    if (!props.running) void refresh();
  },
);
</script>

<template>
  <div class="flex flex-1 min-h-0 flex-col overflow-y-auto">
    <div class="px-4 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
      <h2 class="text-sm font-semibold text-gray-800">{{ stepTitle }}</h2>
      <span
        class="text-[10px] px-2 py-0.5 rounded-full font-medium"
        :class="statusClass[status]"
      >
        {{ statusLabel[status] }}
      </span>
      <span v-if="running" class="text-xs text-blue-600 animate-pulse">Agent running…</span>
      <button
        class="ml-auto text-xs text-gray-500 hover:text-gray-700"
        :disabled="loading"
        @click="refresh"
      >
        Refresh
      </button>
    </div>

    <div v-if="gateResults.length" class="px-4 py-2 border-b border-gray-100 flex flex-wrap gap-2">
      <span
        v-for="gate in gateResults"
        :key="gate.id"
        class="text-[10px] px-2 py-0.5 rounded-full"
        :class="gateClass(gate.status)"
      >
        {{ gate.id }}: {{ gate.status }}
      </span>
    </div>

    <section v-if="showLive" class="border-b border-gray-200">
      <div class="px-4 py-2 bg-blue-50 text-xs font-medium text-blue-800">Live output</div>
      <pre class="m-0 p-4 text-xs font-mono whitespace-pre-wrap text-gray-800 max-h-64 overflow-y-auto bg-gray-50">{{ liveOutput || "Waiting for agent output…" }}</pre>
    </section>

    <section v-if="phaseContent" class="border-b border-gray-200">
      <div class="px-4 py-2 bg-gray-50 text-xs font-medium text-gray-600">Phase summary</div>
      <div class="p-4">
        <MarkdownPreview :content="phaseContent" />
      </div>
    </section>

    <section v-if="reportContent" class="border-b border-gray-200">
      <div class="px-4 py-2 bg-gray-50 text-xs font-medium text-gray-600">
        Report — {{ reportPath }}
      </div>
      <div class="p-4">
        <MarkdownPreview :content="reportContent" />
      </div>
    </section>

    <div
      v-if="!showLive && !phaseContent && !reportContent && !loading"
      class="flex-1 flex items-center justify-center text-sm text-gray-400 p-8 text-center"
    >
      Run this step via chat to see agent progress and results here.
    </div>
  </div>
</template>
