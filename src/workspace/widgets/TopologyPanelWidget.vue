<script setup lang="ts">
import { onMounted, ref } from "vue";
import TopologyGraph from "../../components/topology/TopologyGraph.vue";
import TopologyNodeForm from "../../components/topology/TopologyNodeForm.vue";
import {
  useTopologyOps,
  type OpsConfig,
  type TopologyNodeWithAccess,
  type TopologyWithAccess,
} from "../../composables/useTopologyOps";
import {
  ensureOpsPlaceholders,
  removeNodeFromTopology,
  upsertNode,
} from "../../utils/topologyNodes";

defineProps<{
  mode?: "edit" | "view";
  resourcesFile?: string;
}>();

const opsApi = useTopologyOps();
const topology = ref<TopologyWithAccess | null>(null);
const ops = ref<OpsConfig | null>(null);
const selectedId = ref<string | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const showAddNode = ref(false);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const bundle = await opsApi.bootstrapOps();
    topology.value = bundle.topology;
    ops.value = bundle.ops;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!topology.value || !ops.value) return;
  saving.value = true;
  error.value = null;
  try {
    await opsApi.saveOps(topology.value, ops.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

function onNodeAdd(node: TopologyNodeWithAccess) {
  if (!topology.value || !ops.value) return;
  if (topology.value.nodes.some((n) => n.id === node.id)) {
    error.value = `Node id already exists: ${node.id}`;
    return;
  }
  topology.value = { ...topology.value, nodes: [...topology.value.nodes, node] };
  ops.value = ensureOpsPlaceholders(ops.value, node);
  showAddNode.value = false;
  selectedId.value = node.id;
}

function onNodeUpdate(node: TopologyNodeWithAccess) {
  if (!topology.value || !ops.value || !selectedId.value) return;
  topology.value = {
    ...topology.value,
    nodes: upsertNode(topology.value.nodes, node, selectedId.value),
  };
  ops.value = ensureOpsPlaceholders(ops.value, node);
}

function deleteSelected() {
  if (!topology.value || !selectedId.value) return;
  const { nodes, edges } = removeNodeFromTopology(
    topology.value.nodes,
    topology.value.edges,
    selectedId.value,
  );
  topology.value = { ...topology.value, nodes, edges };
  selectedId.value = null;
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="flex flex-1 min-h-0 flex-col" data-testid="topology-panel">
    <div class="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
      <span class="text-sm font-medium text-gray-700">Topology & Middleware</span>
      <div class="ml-auto flex gap-2">
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-gray-300"
          data-testid="topology-add-node"
          @click="showAddNode = true"
        >
          + Node
        </button>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
          data-testid="topology-save"
          :disabled="saving || !topology"
          @click="save"
        >
          Save
        </button>
      </div>
    </div>

    <p v-if="error" class="px-4 py-1 text-xs text-red-600 bg-red-50">{{ error }}</p>
    <p v-if="loading" class="p-4 text-sm text-gray-400">Loading topology…</p>

    <TopologyGraph
      v-else-if="topology"
      :nodes="topology.nodes"
      :edges="topology.edges"
      :selected-id="selectedId"
      @select="selectedId = $event"
      @add="showAddNode = true"
    />

    <div
      v-if="showAddNode && ops"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      data-testid="topology-add-modal"
    >
      <div class="bg-white rounded-lg shadow-lg p-4 w-full max-w-md">
        <TopologyNodeForm :ops="ops" @submit="onNodeAdd" @cancel="showAddNode = false" />
      </div>
    </div>

    <div
      v-if="selectedId && topology && ops"
      class="border-t border-gray-200 p-4 bg-white max-h-64 overflow-y-auto"
    >
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs font-semibold text-gray-600">Edit: {{ selectedId }}</span>
        <button type="button" class="text-xs text-red-600" @click="deleteSelected">Delete</button>
      </div>
      <TopologyNodeForm
        :node="topology.nodes.find((n) => n.id === selectedId) ?? null"
        :ops="ops"
        @submit="onNodeUpdate"
      />
    </div>
  </div>
</template>
