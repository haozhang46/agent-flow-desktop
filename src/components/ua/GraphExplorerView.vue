<script setup lang="ts">
import { computed, ref } from "vue";
import type { KnowledgeGraph } from "../../types/ua";

const props = defineProps<{
  graph: KnowledgeGraph;
}>();

const selectedId = ref<string | null>(null);
const rootFilter = ref<string | null>(null);

const nodeById = computed(() => {
  const map = new Map(props.graph.nodes.map((n) => [n.id, n]));
  return map;
});

const rootOptions = computed(() => {
  const fromProject = props.graph.project.roots ?? [];
  if (fromProject.length > 0) {
    return fromProject.map((r) => ({ id: r.id, label: r.label || r.id }));
  }
  const ids = [...new Set(props.graph.nodes.map((n) => n.rootId).filter(Boolean))];
  return ids.map((id) => ({ id, label: id }));
});

const selected = computed(() =>
  selectedId.value ? (nodeById.value.get(selectedId.value) ?? null) : null,
);

const connected = computed(() => {
  if (!selectedId.value) return [];
  const id = selectedId.value;
  const targets = new Set<string>();
  for (const edge of props.graph.edges) {
    if (edge.source === id) targets.add(edge.target);
    if (edge.target === id) targets.add(edge.source);
  }
  return [...targets];
});

function selectNode(id: string): void {
  selectedId.value = id;
}

function setRootFilter(id: string | null): void {
  rootFilter.value = id;
}

function nodesForLayer(nodeIds: string[]) {
  return nodeIds
    .map((id) => nodeById.value.get(id))
    .filter((n): n is NonNullable<typeof n> => n != null)
    .filter((n) => rootFilter.value == null || n.rootId === rootFilter.value);
}
</script>

<template>
  <div
    class="flex flex-col gap-3 text-sm"
    data-testid="ua-graph-explorer"
  >
    <div
      v-if="rootOptions.length > 1"
      class="flex flex-wrap gap-1.5"
      data-testid="ua-explorer-root-filters"
    >
      <button
        type="button"
        class="text-[10px] px-1.5 py-0.5 rounded border transition-colors"
        :class="
          rootFilter == null
            ? 'border-blue-300 bg-blue-50 text-blue-800'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        "
        data-testid="ua-explorer-root-all"
        @click="setRootFilter(null)"
      >
        All roots
      </button>
      <button
        v-for="root in rootOptions"
        :key="root.id"
        type="button"
        class="text-[10px] px-1.5 py-0.5 rounded border transition-colors"
        :class="
          rootFilter === root.id
            ? 'border-blue-300 bg-blue-50 text-blue-800'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        "
        :data-testid="`ua-explorer-root-${root.id}`"
        @click="setRootFilter(root.id)"
      >
        {{ root.label }}
      </button>
    </div>

    <div class="flex gap-3 overflow-x-auto pb-1">
      <div
        v-for="layer in graph.layers"
        :key="layer.id"
        class="min-w-[10rem] flex-1 border border-gray-200 rounded-lg bg-gray-50/80"
        data-testid="ua-explorer-layer"
      >
        <div class="px-2.5 py-2 border-b border-gray-200">
          <p class="text-xs font-semibold text-gray-800">{{ layer.name }}</p>
          <p class="text-[10px] text-gray-400 mt-0.5 line-clamp-2">
            {{ layer.description }}
          </p>
        </div>
        <ul class="p-1.5 space-y-1 max-h-48 overflow-y-auto">
          <li
            v-for="node in nodesForLayer(layer.nodeIds)"
            :key="node.id"
            role="button"
            tabindex="0"
            class="text-xs px-2 py-1.5 rounded cursor-pointer border border-transparent hover:bg-white hover:border-gray-200"
            :class="
              selectedId === node.id
                ? 'bg-blue-50 border-blue-200 text-blue-900'
                : 'text-gray-700'
            "
            data-testid="ua-explorer-node"
            :data-node-id="node.id"
            @click="selectNode(node.id)"
            @keydown.enter="selectNode(node.id)"
          >
            <span class="font-medium">{{ node.name }}</span>
            <span class="text-gray-400 ml-1">· {{ node.type }}</span>
            <span
              v-if="node.rootId"
              class="ml-1 text-[10px] text-gray-400"
            >· {{ node.rootId }}</span>
          </li>
        </ul>
      </div>
    </div>

    <div
      v-if="selected"
      class="border border-gray-200 rounded-lg px-3 py-2.5 space-y-2 bg-white"
      data-testid="ua-explorer-detail"
    >
      <div>
        <p class="text-xs font-semibold text-gray-800">{{ selected.name }}</p>
        <p class="text-[10px] text-gray-400 mt-0.5">
          {{ selected.id }} · {{ selected.type }}
          <span v-if="selected.rootId"> · root {{ selected.rootId }}</span>
        </p>
      </div>
      <p class="text-xs text-gray-600">{{ selected.summary }}</p>
      <p v-if="selected.filePath" class="text-xs text-gray-500 font-mono">
        {{ selected.filePath }}
      </p>
      <div v-if="connected.length" class="space-y-1">
        <p class="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
          Connected
        </p>
        <ul class="space-y-0.5">
          <li
            v-for="targetId in connected"
            :key="targetId"
            class="text-xs text-gray-700 font-mono"
            data-testid="ua-explorer-edge-target"
          >
            {{ targetId }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
