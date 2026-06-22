<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { OpsAuditEntry } from "../../composables/useTopologyOps";
import { useTopologyOps } from "../../composables/useTopologyOps";

const opsApi = useTopologyOps();
const entries = ref<OpsAuditEntry[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const open = ref(false);

async function refresh() {
  loading.value = true;
  error.value = null;
  try {
    const { entries: list } = await opsApi.listAudit(30);
    entries.value = list;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void refresh();
});

defineExpose({ refresh });
</script>

<template>
  <div class="border-t border-gray-200 bg-gray-50 shrink-0">
    <button
      class="w-full px-4 py-1.5 text-xs text-gray-600 flex items-center justify-between hover:bg-gray-100"
      @click="open = !open"
    >
      <span>Ops audit ({{ entries.length }})</span>
      <span>{{ open ? "▾" : "▸" }}</span>
    </button>
    <div v-if="open" class="max-h-36 overflow-auto px-4 pb-2">
      <div class="flex justify-end mb-1">
        <button class="text-[10px] text-blue-600 hover:underline" @click="refresh">Refresh</button>
      </div>
      <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
      <p v-else-if="loading" class="text-xs text-gray-400">Loading…</p>
      <p v-else-if="!entries.length" class="text-xs text-gray-400">No audit entries yet.</p>
      <ul v-else class="text-[11px] font-mono space-y-1">
        <li v-for="(entry, idx) in entries" :key="`${entry.ts}-${idx}`" class="text-gray-700">
          <span class="text-gray-400">{{ entry.ts.slice(0, 19) }}</span>
          {{ entry.action }}
          <span v-if="entry.node" class="text-blue-700">{{ entry.node }}</span>
          <span v-if="entry.exitCode != null" :class="entry.exitCode === 0 ? 'text-green-700' : 'text-red-600'">
            exit={{ entry.exitCode }}
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
