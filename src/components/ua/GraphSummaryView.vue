<script setup lang="ts">
import type { GraphSummary } from "../../types/ua";

defineProps<{
  summary: GraphSummary;
}>();
</script>

<template>
  <div class="space-y-3 text-sm" data-testid="ua-graph-summary">
    <div>
      <h3 class="font-semibold text-gray-800">{{ summary.projectName }}</h3>
      <p class="text-xs text-gray-500 mt-0.5">{{ summary.description }}</p>
      <p v-if="summary.analyzedAt" class="text-[10px] text-gray-400 mt-1">
        Analyzed {{ summary.analyzedAt }}
      </p>
    </div>

    <div class="flex flex-wrap gap-3 text-xs text-gray-600">
      <span data-testid="ua-summary-nodes">{{ summary.nodeCount }} nodes</span>
      <span data-testid="ua-summary-edges">{{ summary.edgeCount }} edges</span>
      <span data-testid="ua-summary-layers">{{ summary.layers.length }} layers</span>
    </div>

    <div v-if="summary.layers.length" class="space-y-1">
      <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Layers</p>
      <ul class="space-y-0.5">
        <li
          v-for="layer in summary.layers"
          :key="layer.id"
          class="text-xs text-gray-700 flex justify-between gap-2"
        >
          <span>{{ layer.name }}</span>
          <span class="text-gray-400 shrink-0">{{ layer.nodeCount }}</span>
        </li>
      </ul>
    </div>

    <div v-if="summary.sampleNodes.length" class="space-y-1">
      <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Sample nodes</p>
      <ul class="space-y-1">
        <li
          v-for="node in summary.sampleNodes"
          :key="node.id"
          class="text-xs border border-gray-100 rounded px-2 py-1.5"
        >
          <div class="font-medium text-gray-800">
            {{ node.name }}
            <span class="text-gray-400 font-normal">· {{ node.type }}</span>
          </div>
          <p class="text-gray-500 mt-0.5 line-clamp-2">{{ node.summary }}</p>
        </li>
      </ul>
    </div>
  </div>
</template>
