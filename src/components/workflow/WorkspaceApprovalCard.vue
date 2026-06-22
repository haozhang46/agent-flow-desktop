<script setup lang="ts">
import type { WorkspaceDefinition } from "../../workspace/registry";

const props = withDefaults(
  defineProps<{
    summary: string;
    before: WorkspaceDefinition | null;
    after: WorkspaceDefinition;
    compact?: boolean;
    approving?: boolean;
  }>(),
  {
    compact: false,
    approving: false,
  },
);

const emit = defineEmits<{
  approve: [];
  cancel: [];
}>();

function formatJson(def: WorkspaceDefinition | null): string {
  if (!def) return "(empty)";
  return JSON.stringify(def, null, 2);
}
</script>

<template>
  <div
    class="rounded-lg border border-amber-200 bg-amber-50 space-y-3"
    :class="compact ? 'px-4 py-3' : 'my-3 p-4'"
  >
    <p class="text-xs font-medium text-amber-900 uppercase tracking-wide">
      Workspace change pending approval
    </p>
    <p class="text-xs text-gray-700">{{ summary }}</p>
    <template v-if="!compact">
      <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div>
          <p class="text-[10px] font-medium text-gray-500 mb-1">Before</p>
          <pre class="text-[10px] whitespace-pre-wrap text-gray-700 max-h-32 overflow-y-auto bg-white border border-gray-200 rounded p-2">{{ formatJson(before) }}</pre>
        </div>
        <div>
          <p class="text-[10px] font-medium text-gray-500 mb-1">After</p>
          <pre class="text-[10px] whitespace-pre-wrap text-gray-700 max-h-32 overflow-y-auto bg-white border border-gray-200 rounded p-2">{{ formatJson(after) }}</pre>
        </div>
      </div>
    </template>
    <details v-else class="text-[10px] text-gray-600">
      <summary class="cursor-pointer select-none hover:text-gray-800">View diff</summary>
      <div class="grid grid-cols-1 gap-2 mt-2 md:grid-cols-2">
        <pre class="whitespace-pre-wrap text-gray-700 max-h-24 overflow-y-auto bg-white border border-gray-200 rounded p-2">{{ formatJson(before) }}</pre>
        <pre class="whitespace-pre-wrap text-gray-700 max-h-24 overflow-y-auto bg-white border border-gray-200 rounded p-2">{{ formatJson(after) }}</pre>
      </div>
    </details>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="btn-primary text-xs py-1 px-3 disabled:opacity-50"
        :disabled="approving"
        @click="emit('approve')"
      >
        {{ approving ? "Applying…" : "Confirm & Apply" }}
      </button>
      <button
        type="button"
        class="text-xs px-3 py-1 rounded-lg border border-gray-300 hover:bg-white disabled:opacity-50"
        :disabled="approving"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </div>
</template>
