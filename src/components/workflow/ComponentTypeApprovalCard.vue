<script setup lang="ts">
import type { PendingComponentTypeDef } from "../../workspace/componentTypeApproval";

const props = withDefaults(
  defineProps<{
    summary: string;
    scope: string;
    typeDef: PendingComponentTypeDef;
    overwrite?: boolean;
    compact?: boolean;
    approving?: boolean;
  }>(),
  {
    overwrite: false,
    compact: false,
    approving: false,
  },
);

const emit = defineEmits<{
  approve: [];
  cancel: [];
}>();

function formatJson(def: PendingComponentTypeDef): string {
  return JSON.stringify(def, null, 2);
}
</script>

<template>
  <div
    class="rounded-lg border border-amber-200 bg-amber-50 space-y-3"
    :class="compact ? 'px-4 py-3' : 'my-3 p-4'"
  >
    <p class="text-xs font-medium text-amber-900 uppercase tracking-wide">
      Custom component type pending approval
    </p>
    <p class="text-xs text-gray-700">{{ summary }}</p>
    <p class="text-[10px] font-mono text-gray-500">
      scope: {{ scope }}<span v-if="overwrite"> · overwrite</span>
    </p>
    <template v-if="!compact">
      <div>
        <p class="text-[10px] font-medium text-gray-500 mb-1">Type definition</p>
        <pre
          class="text-[10px] whitespace-pre-wrap text-gray-700 max-h-32 overflow-y-auto bg-white border border-gray-200 rounded p-2"
        >{{ formatJson(typeDef) }}</pre>
      </div>
    </template>
    <details v-else class="text-[10px] text-gray-600">
      <summary class="cursor-pointer select-none hover:text-gray-800">View type definition</summary>
      <pre
        class="mt-2 whitespace-pre-wrap text-gray-700 max-h-24 overflow-y-auto bg-white border border-gray-200 rounded p-2"
      >{{ formatJson(typeDef) }}</pre>
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
