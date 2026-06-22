<script setup lang="ts">
import type { TopologyWithAccess } from "../../composables/useTopologyOps";

defineProps<{
  nodes: TopologyWithAccess["nodes"];
  edges: TopologyWithAccess["edges"];
  selectedId?: string | null;
}>();

defineEmits<{ select: [id: string]; add: [] }>();
</script>

<template>
  <div class="flex-1 min-h-0 overflow-auto p-6 bg-gray-50">
    <div v-if="!nodes.length" class="text-center text-sm text-gray-500 py-16">
      <p>暂无节点。</p>
      <button
        type="button"
        class="mt-3 text-xs py-1 px-3 border border-blue-400 text-blue-700 rounded hover:bg-blue-50"
        @click="$emit('add')"
      >
        + Add node
      </button>
    </div>
    <div v-else class="flex flex-wrap gap-4 justify-center items-start">
      <button
        v-for="node in nodes"
        :key="node.id"
        type="button"
        class="card px-4 py-3 min-w-28 text-left transition-shadow"
        :class="selectedId === node.id ? 'ring-2 ring-blue-500 shadow-md' : 'hover:shadow'"
        @click="$emit('select', node.id)"
      >
        <p class="text-sm font-semibold text-gray-800">{{ node.id }}</p>
        <p class="text-xs text-gray-500">{{ node.engine ?? node.kind }}</p>
      </button>
    </div>
    <div v-if="edges.length" class="mt-8 max-w-xl mx-auto">
      <p class="text-xs font-semibold text-gray-500 mb-2">Connections</p>
      <ul class="text-xs text-gray-700 space-y-1 font-mono">
        <li v-for="(edge, idx) in edges" :key="`${edge.from}-${edge.to}-${idx}`">
          {{ edge.from }} → {{ edge.to }}
        </li>
      </ul>
    </div>
  </div>
</template>
