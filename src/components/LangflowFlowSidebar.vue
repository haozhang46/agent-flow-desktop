<script setup lang="ts">
import type { LangflowFlowSummary } from "../composables/useLangflow";

defineProps<{
  flows: LangflowFlowSummary[];
  selectedId: string | null;
  activeFlowId?: string;
  loading: boolean;
  offline: boolean;
  offlineDetail?: string;
}>();

const emit = defineEmits<{
  select: [flowId: string];
  refresh: [];
  create: [];
}>();

function formatUpdated(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}
</script>

<template>
  <aside class="w-60 border-r border-gray-200 bg-gray-50 flex flex-col shrink-0">
    <div class="p-3 border-b border-gray-200 flex items-center justify-between gap-2">
      <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Flows</p>
      <button
        type="button"
        class="text-xs text-blue-600 hover:underline disabled:opacity-50"
        :disabled="loading || offline"
        @click="emit('refresh')"
      >
        Refresh
      </button>
    </div>

    <p
      v-if="offline"
      class="mx-3 mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5"
    >
      Langflow offline — check Settings and start the server.
      <span v-if="offlineDetail" class="block mt-1 text-amber-900/80">{{ offlineDetail }}</span>
    </p>

    <div v-if="loading" class="p-3 text-xs text-gray-500">Loading flows…</div>

    <div v-else class="flex-1 overflow-y-auto">
      <button
        v-for="flow in flows"
        :key="flow.id"
        type="button"
        class="w-full text-left px-3 py-2 text-sm border-b border-gray-100 hover:bg-gray-100"
        :class="selectedId === flow.id ? 'bg-blue-50' : ''"
        @click="emit('select', flow.id)"
      >
        <div class="flex items-start justify-between gap-2">
          <span class="truncate font-medium text-gray-800">{{ flow.name }}</span>
          <span
            v-if="activeFlowId === flow.id"
            class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 shrink-0"
          >
            Active
          </span>
        </div>
        <p v-if="flow.updated_at" class="text-[10px] text-gray-400 mt-0.5 truncate">
          {{ formatUpdated(flow.updated_at) }}
        </p>
      </button>

      <p v-if="!flows.length && !offline" class="p-3 text-xs text-gray-400">
        No flows yet. Create one below.
      </p>
    </div>

    <div class="p-3 border-t border-gray-200">
      <button
        type="button"
        class="btn-primary w-full text-xs py-1.5"
        :disabled="loading || offline"
        @click="emit('create')"
      >
        + New Flow
      </button>
    </div>
  </aside>
</template>
