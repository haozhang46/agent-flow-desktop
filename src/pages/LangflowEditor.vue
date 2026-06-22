<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import LangflowFlowSidebar from "../components/LangflowFlowSidebar.vue";
import LangflowWebView from "../components/LangflowWebView.vue";
import {
  useLangflow,
  type LangflowFlowSummary,
  type LangflowStatus,
} from "../composables/useLangflow";

const props = defineProps<{ workspace: string }>();

const { fetchStatus, fetchFlows, createFlow, setActive } = useLangflow();

const loading = ref(true);
const acting = ref(false);
const offline = ref(false);
const status = ref<LangflowStatus | null>(null);
const flows = ref<LangflowFlowSummary[]>([]);
const activeFlowId = ref<string | undefined>();
const selectedId = ref<string | null>(null);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);

onMounted(() => {
  if (props.workspace) {
    void loadAll();
  } else {
    loading.value = false;
  }
});

watch(
  () => props.workspace,
  (ws) => {
    if (ws) void loadAll();
    else {
      flows.value = [];
      selectedId.value = null;
      loading.value = false;
    }
  },
);

async function loadAll() {
  loading.value = true;
  message.value = null;
  try {
    if (offline.value) {
      await window.desktop.restartLangflow();
    }
    status.value = await fetchStatus();
    offline.value = !status.value.ok;
    if (!offline.value) {
      const data = await fetchFlows();
      flows.value = data.flows;
      activeFlowId.value = data.activeFlowId;
      if (!selectedId.value && data.activeFlowId) {
        selectedId.value = data.activeFlowId;
      } else if (!selectedId.value && data.flows[0]) {
        selectedId.value = data.flows[0].id;
      } else if (
        selectedId.value &&
        !data.flows.some((f) => f.id === selectedId.value)
      ) {
        selectedId.value = data.flows[0]?.id ?? null;
      }
    }
  } catch (err) {
    offline.value = true;
    const text = err instanceof Error ? err.message : String(err);
    message.value = { type: "error", text };
  } finally {
    loading.value = false;
  }
}

function selectFlow(flowId: string) {
  selectedId.value = flowId;
  message.value = null;
}

async function onCreate() {
  acting.value = true;
  message.value = null;
  try {
    const flow = await createFlow(`Flow ${flows.value.length + 1}`);
    flows.value = [flow, ...flows.value];
    selectedId.value = flow.id;
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    message.value = { type: "error", text };
  } finally {
    acting.value = false;
  }
}

async function onSetActive() {
  if (!selectedId.value) return;
  acting.value = true;
  message.value = null;
  try {
    await setActive(selectedId.value);
    activeFlowId.value = selectedId.value;
    message.value = {
      type: "success",
      text: `Agent flow saved to .agentflow/langflow/flows/${selectedId.value}.json`,
    };
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    message.value = { type: "error", text };
  } finally {
    acting.value = false;
  }
}

function openInBrowser() {
  if (!status.value?.baseUrl || !selectedId.value) return;
  const url = `${status.value.baseUrl.replace(/\/$/, "")}/flow/${selectedId.value}`;
  window.open(url, "_blank");
}
</script>

<template>
  <div class="flex flex-1 min-h-0 flex-col">
    <div
      v-if="!workspace"
      class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <p class="text-sm text-gray-600">Open a project to design Langflow agent flows.</p>
      <p class="text-xs text-gray-500">Use Home to create or open a project folder.</p>
    </div>

    <template v-else>
      <header
        class="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2"
      >
        <h1 class="text-sm font-semibold text-gray-800">Langflow Editor</h1>
        <span class="text-xs text-gray-500">Agent orchestration — not project pipeline authoring</span>
        <span v-if="status?.baseUrl" class="text-xs text-gray-400 truncate max-w-xs">
          {{ status.baseUrl }}
        </span>
        <div class="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="text-xs px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!selectedId || offline"
            @click="openInBrowser"
          >
            Open in Browser
          </button>
          <button
            type="button"
            class="btn-primary text-xs py-1 px-3"
            :disabled="!selectedId || acting || offline"
            @click="onSetActive"
          >
            {{ acting ? "Saving…" : "Save Active Flow" }}
          </button>
        </div>
      </header>

      <p
        v-if="message"
        class="px-4 py-1 text-xs"
        :class="
          message.type === 'success'
            ? 'text-green-800 bg-green-50'
            : 'text-red-700 bg-red-50'
        "
      >
        {{ message.text }}
      </p>

      <div class="flex flex-1 min-h-0">
        <LangflowFlowSidebar
          :flows="flows"
          :selected-id="selectedId"
          :active-flow-id="activeFlowId"
          :loading="loading || acting"
          :offline="offline"
          :offline-detail="status?.detail"
          @select="selectFlow"
          @refresh="loadAll"
          @create="onCreate"
        />

        <LangflowWebView
          :base-url="status?.baseUrl ?? ''"
          :flow-id="selectedId"
          :offline="offline"
        />
      </div>
    </template>
  </div>
</template>
