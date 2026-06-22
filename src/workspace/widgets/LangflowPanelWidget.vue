<script setup lang="ts">
import { onMounted, ref } from "vue";
import LangflowWebView from "../../components/LangflowWebView.vue";
import { useLangflow } from "../../composables/useLangflow";
import type { PanelApi } from "../registryComponents";

defineProps<{
  api: PanelApi;
  flowId: string;
  mode: "run";
}>();

const { fetchStatus } = useLangflow();

const loading = ref(true);
const offline = ref(false);
const baseUrl = ref("");

async function loadStatus() {
  loading.value = true;
  try {
    const status = await fetchStatus();
    offline.value = !status.ok;
    baseUrl.value = status.baseUrl;
  } catch {
    offline.value = true;
    baseUrl.value = "";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadStatus();
});
</script>

<template>
  <div class="flex flex-1 min-h-0 flex-col">
    <div
      v-if="!flowId"
      class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center"
      data-testid="langflow-missing-flow"
    >
      <p class="text-sm text-gray-600">No Langflow flow configured.</p>
      <p class="text-xs text-gray-500">
        Set a flow in workspace properties (langflow-flow picker).
      </p>
    </div>

    <template v-else>
      <header class="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <span class="text-sm font-medium text-gray-700">Langflow</span>
        <span class="text-xs text-gray-400 font-mono">{{ flowId }}</span>
        <span class="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{{ mode }}</span>
        <button
          v-if="offline"
          type="button"
          class="ml-auto text-xs text-blue-600 hover:underline"
          @click="loadStatus"
        >
          Retry connection
        </button>
      </header>

      <div v-if="loading" class="flex-1 flex items-center justify-center text-sm text-gray-400">
        Connecting to Langflow…
      </div>
      <LangflowWebView
        v-else
        :base-url="baseUrl"
        :flow-id="flowId"
        :offline="offline"
        data-testid="langflow-webview"
      />
    </template>
  </div>
</template>
