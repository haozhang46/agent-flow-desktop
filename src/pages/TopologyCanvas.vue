<script setup lang="ts">
import { onMounted, ref } from "vue";
import TopologyGraph from "../components/topology/TopologyGraph.vue";
import TopologyNodeDrawer from "../components/topology/TopologyNodeDrawer.vue";
import TopologyAuditPanel from "../components/topology/TopologyAuditPanel.vue";
import TopologyNodeForm from "../components/topology/TopologyNodeForm.vue";
import {
  useTopologyOps,
  type OpsConfig,
  type TopologyWithAccess,
  type TopologyNodeWithAccess,
} from "../composables/useTopologyOps";
import {
  ensureOpsPlaceholders,
  removeNodeFromTopology,
  upsertNode,
} from "../utils/topologyNodes";

defineProps<{ workspace: string }>();

const opsApi = useTopologyOps();
const topology = ref<TopologyWithAccess | null>(null);
const ops = ref<OpsConfig | null>(null);
const selectedId = ref<string | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const saveMessage = ref<string | null>(null);
const bootstrapMessage = ref<string | null>(null);

const showDeployAll = ref(false);
const deployAllConfirm = ref(false);
const deployAllLoading = ref(false);
const deployAllOutput = ref("");
const deployAllError = ref<string | null>(null);

const syncing = ref(false);
const syncMessage = ref<string | null>(null);
const auditPanel = ref<InstanceType<typeof TopologyAuditPanel> | null>(null);

const showAddNode = ref(false);
const pendingDeleteId = ref<string | null>(null);

const selectedNode = (): TopologyNodeWithAccess | null => {
  if (!selectedId.value || !topology.value) return null;
  return topology.value.nodes.find((n) => n.id === selectedId.value) ?? null;
};

async function load() {
  loading.value = true;
  error.value = null;
  bootstrapMessage.value = null;
  saveMessage.value = null;
  try {
    const bundle = await opsApi.bootstrapOps();
    topology.value = bundle.topology;
    ops.value = bundle.ops;
    if (bundle.created.topology || bundle.created.ops) {
      const parts: string[] = [];
      if (bundle.created.topology) parts.push("topology.yaml");
      if (bundle.created.ops) parts.push("ops.yaml");
      bootstrapMessage.value = `已创建 .agentflow/${parts.join("、")}`;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!topology.value || !ops.value) return;
  saving.value = true;
  saveMessage.value = null;
  error.value = null;
  try {
    await opsApi.saveOps(topology.value, ops.value);
    saveMessage.value = "Saved topology.yaml & ops.yaml";
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

function onOpsUpdate(next: OpsConfig) {
  ops.value = next;
}

function onNodeAdd(node: TopologyNodeWithAccess) {
  if (!topology.value || !ops.value) return;
  if (topology.value.nodes.some((n) => n.id === node.id)) {
    error.value = `Node "${node.id}" already exists`;
    return;
  }
  topology.value = {
    ...topology.value,
    nodes: [...topology.value.nodes, node],
  };
  ops.value = ensureOpsPlaceholders(ops.value, node);
  selectedId.value = node.id;
  showAddNode.value = false;
  error.value = null;
  saveMessage.value = null;
}

function onNodeUpdate(node: TopologyNodeWithAccess) {
  if (!topology.value || !ops.value || !selectedId.value) return;
  topology.value = {
    ...topology.value,
    nodes: upsertNode(topology.value.nodes, node, selectedId.value),
  };
  ops.value = ensureOpsPlaceholders(ops.value, node);
  selectedId.value = node.id;
  error.value = null;
  saveMessage.value = null;
}

function requestDeleteNode(nodeId: string) {
  pendingDeleteId.value = nodeId;
}

function confirmDeleteNode() {
  if (!topology.value || !pendingDeleteId.value) return;
  const nodeId = pendingDeleteId.value;
  const { nodes, edges } = removeNodeFromTopology(
    topology.value.nodes,
    topology.value.edges,
    nodeId,
  );
  topology.value = { ...topology.value, nodes, edges };
  if (selectedId.value === nodeId) selectedId.value = null;
  pendingDeleteId.value = null;
  error.value = null;
  saveMessage.value = null;
}

async function runDeployAll() {
  if (!deployAllConfirm.value) return;
  deployAllLoading.value = true;
  deployAllError.value = null;
  deployAllOutput.value = "";
  try {
    const result = await opsApi.deployAll();
    deployAllOutput.value = result.output;
    if (result.error) deployAllError.value = result.error;
    else showDeployAll.value = false;
    void auditPanel.value?.refresh();
  } catch (err) {
    deployAllError.value = err instanceof Error ? err.message : String(err);
  } finally {
    deployAllLoading.value = false;
  }
}

async function syncToServer() {
  syncing.value = true;
  syncMessage.value = null;
  error.value = null;
  try {
    await opsApi.syncToServer();
    syncMessage.value = "Synced topology to Resource Server (access fields stripped)";
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    syncing.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="flex flex-1 min-h-0 flex-col">
    <div class="px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-3">
      <h2 class="text-sm font-semibold text-gray-800">Topology</h2>
      <button
        class="text-xs py-1 px-2 border border-blue-400 text-blue-700 rounded hover:bg-blue-50"
        :disabled="!topology"
        @click="showAddNode = true"
      >
        + Add node
      </button>
      <button
        class="text-xs py-1 px-2 border border-gray-300 rounded hover:bg-gray-50"
        :disabled="saving || !topology"
        @click="save"
      >
        {{ saving ? "Saving…" : "Save" }}
      </button>
      <button
        class="text-xs py-1 px-2 border border-gray-300 rounded hover:bg-gray-50"
        :disabled="syncing || !topology"
        @click="syncToServer"
      >
        {{ syncing ? "Syncing…" : "Sync to Server" }}
      </button>
      <button
        class="text-xs py-1 px-2 border border-amber-400 text-amber-800 rounded hover:bg-amber-50"
        @click="showDeployAll = true"
      >
        Deploy All
      </button>
      <button class="text-xs text-gray-500 hover:text-gray-700 ml-auto" @click="load">Refresh</button>
    </div>
    <p v-if="bootstrapMessage" class="text-xs text-green-700 bg-green-50 px-4 py-1">
      {{ bootstrapMessage }}
    </p>
    <p v-if="saveMessage" class="text-xs text-green-700 bg-green-50 px-4 py-1">{{ saveMessage }}</p>
    <p v-if="syncMessage" class="text-xs text-green-700 bg-green-50 px-4 py-1">{{ syncMessage }}</p>
    <p v-if="error" class="text-xs text-red-600 bg-red-50 px-4 py-1">{{ error }}</p>
    <div v-if="loading" class="flex-1 flex items-center justify-center text-sm text-gray-400">
      Loading topology…
    </div>
    <div v-else class="flex flex-1 min-h-0 flex-col">
      <div class="flex flex-1 min-h-0">
        <TopologyGraph
          v-if="topology"
          :nodes="topology.nodes"
          :edges="topology.edges"
          :selected-id="selectedId"
          @select="selectedId = $event"
          @add="showAddNode = true"
        />
        <TopologyNodeDrawer
          :node="selectedNode()"
          :ops="ops"
          @update:ops="onOpsUpdate"
          @update:node="onNodeUpdate"
          @delete:node="() => { if (selectedId) requestDeleteNode(selectedId); }"
        />
      </div>
      <TopologyAuditPanel ref="auditPanel" />
    </div>

    <div
      v-if="showAddNode"
      class="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      @click.self="showAddNode = false"
    >
      <div class="bg-white rounded-lg shadow-lg p-4 w-full max-w-md mx-4 max-h-[90vh] overflow-auto">
        <h3 class="text-sm font-semibold text-gray-800 mb-3">Add node</h3>
        <TopologyNodeForm
          mode="create"
          :ops="ops"
          @submit="onNodeAdd"
          @cancel="showAddNode = false"
        />
      </div>
    </div>

    <div
      v-if="pendingDeleteId"
      class="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      @click.self="pendingDeleteId = null"
    >
      <div class="bg-white rounded-lg shadow-lg p-4 w-full max-w-sm mx-4">
        <h3 class="text-sm font-semibold text-gray-800 mb-2">Delete node</h3>
        <p class="text-xs text-gray-600 mb-3">
          Remove <code class="font-mono">{{ pendingDeleteId }}</code> and any edges connected to it?
          Click Save to persist to topology.yaml.
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="text-xs py-1 px-3 border border-gray-300 rounded"
            @click="pendingDeleteId = null"
          >
            Cancel
          </button>
          <button
            class="text-xs py-1 px-3 border border-red-400 text-red-700 rounded hover:bg-red-50"
            @click="confirmDeleteNode"
          >
            Delete
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="showDeployAll"
      class="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      @click.self="showDeployAll = false"
    >
      <div class="bg-white rounded-lg shadow-lg p-4 w-full max-w-md mx-4">
        <h3 class="text-sm font-semibold text-gray-800 mb-2">Deploy All</h3>
        <p class="text-xs text-gray-600 mb-3">
          Runs <code class="text-gray-800">deployAll</code> from ops.yaml over SSH.
        </p>
        <label class="flex items-center gap-2 text-xs text-gray-700 mb-3">
          <input v-model="deployAllConfirm" type="checkbox" />
          I confirm deploy to all services
        </label>
        <p v-if="deployAllError" class="text-xs text-red-600 mb-2">{{ deployAllError }}</p>
        <pre
          v-if="deployAllOutput"
          class="text-xs font-mono bg-gray-50 border p-2 rounded max-h-32 overflow-auto mb-3"
        >{{ deployAllOutput }}</pre>
        <div class="flex justify-end gap-2">
          <button
            class="text-xs py-1 px-3 border border-gray-300 rounded"
            @click="showDeployAll = false"
          >
            Cancel
          </button>
          <button
            class="btn-primary text-xs py-1 px-3"
            :disabled="!deployAllConfirm || deployAllLoading"
            @click="runDeployAll"
          >
            {{ deployAllLoading ? "Deploying…" : "Deploy" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
