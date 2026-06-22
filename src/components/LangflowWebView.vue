<script setup lang="ts">
import { computed, ref, watch } from "vue";

const props = defineProps<{
  baseUrl: string;
  flowId: string | null;
  offline: boolean;
}>();

const emit = defineEmits<{
  "load-error": [message: string];
}>();

const loadError = ref<string | null>(null);

const editorSrc = computed(() => {
  if (!props.flowId || props.offline) return "";
  const base = props.baseUrl.replace(/\/$/, "");
  return `${base}/flow/${props.flowId}`;
});

watch(
  () => props.flowId,
  () => {
    loadError.value = null;
  },
);

function onFailLoad(event: Event): void {
  const detail = (event as CustomEvent).detail;
  const code = detail?.errorCode ?? "unknown";
  const desc = detail?.errorDescription ?? "Failed to load Langflow editor";
  loadError.value = `${desc} (${code})`;
  emit("load-error", loadError.value);
}
</script>

<template>
  <div class="flex-1 flex flex-col min-w-0 bg-white">
    <div
      v-if="offline"
      class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <p class="text-sm text-gray-600">Langflow server is not reachable.</p>
      <p class="text-xs text-gray-500 max-w-md">
        Install and run Langflow locally (<code class="bg-gray-100 px-1 rounded">langflow run</code>),
        then set the server URL in Settings.
      </p>
    </div>

    <div
      v-else-if="!flowId"
      class="flex flex-1 items-center justify-center text-sm text-gray-400"
    >
      Select a flow from the sidebar or create a new one.
    </div>

    <template v-else>
      <p
        v-if="loadError"
        class="mx-4 mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2"
      >
        {{ loadError }}
      </p>
      <webview
        :src="editorSrc"
        class="flex-1 w-full min-h-0"
        allowpopups
        @did-fail-load="onFailLoad"
      />
    </template>
  </div>
</template>
