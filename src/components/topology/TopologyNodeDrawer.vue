<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { OpsConfig, OpsHost, TopologyNodeWithAccess } from "../../composables/useTopologyOps";
import { useTopologyOps } from "../../composables/useTopologyOps";
import TopologyNodeForm from "./TopologyNodeForm.vue";

const props = defineProps<{
  node: TopologyNodeWithAccess | null;
  ops: OpsConfig | null;
}>();

const emit = defineEmits<{
  "update:ops": [ops: OpsConfig];
  "update:node": [node: TopologyNodeWithAccess];
  "delete:node": [];
}>();

const opsApi = useTopologyOps();
const activeTab = ref<"config" | "logs" | "status" | "terminal" | "deploy">("config");
const logContent = ref("");
const logError = ref<string | null>(null);
const logLoading = ref(false);
const following = ref(false);
const filter = ref("");
const historyFiles = ref<{ name: string; path: string }[]>([]);
let stopFollow: (() => void) | null = null;

const statusOutput = ref("");
const statusError = ref<string | null>(null);
const statusLoading = ref(false);
const statusReachable = ref<boolean | null>(null);

const terminalHostRef = ref("");
const terminalCommand = ref("");
const terminalOutput = ref("");
const terminalLoading = ref(false);

const deployConfirm = ref(false);
const deployOutput = ref("");
const deployLoading = ref(false);
const deployError = ref<string | null>(null);

const selectedHost = computed((): OpsHost | null => {
  if (!props.node?.access?.hostRef || !props.ops) return null;
  return props.ops.hosts.find((h) => h.id === props.node!.access!.hostRef) ?? null;
});

const externalLogUrl = computed(() => {
  return props.node?.access?.logUrl ?? props.ops?.logPolicy.externalLogUrl ?? null;
});

function patchHost(field: keyof OpsHost, value: string | number) {
  if (!props.ops || !props.node?.access?.hostRef) return;
  const hosts = props.ops.hosts.map((h) =>
    h.id === props.node!.access!.hostRef ? { ...h, [field]: value } : h,
  );
  emit("update:ops", { ...props.ops, hosts });
}

function patchExternalLogUrl(value: string) {
  if (!props.ops) return;
  emit("update:ops", {
    ...props.ops,
    logPolicy: {
      ...props.ops.logPolicy,
      externalLogUrl: value.trim() || null,
    },
  });
}

async function refreshHistory() {
  if (!props.node) {
    historyFiles.value = [];
    return;
  }
  const { files } = await opsApi.listLogFiles(props.node.id);
  historyFiles.value = files;
}

async function loadSnapshot() {
  if (!props.node) return;
  logLoading.value = true;
  logError.value = null;
  try {
    const result = await opsApi.fetchLogSnapshot(props.node.id);
    logContent.value = result.content;
    if (result.error) logError.value = result.error;
    await refreshHistory();
  } catch (err) {
    logError.value = err instanceof Error ? err.message : String(err);
  } finally {
    logLoading.value = false;
  }
}

function startFollow() {
  if (!props.node || following.value) return;
  following.value = true;
  logError.value = null;
  stopFollow = opsApi.followLogs(props.node.id, {
    onChunk: (text) => {
      logContent.value += text;
    },
    onError: (message) => {
      logError.value = message;
    },
    onDone: () => {
      following.value = false;
    },
  });
}

function stopFollowing() {
  stopFollow?.();
  stopFollow = null;
  following.value = false;
}

async function openHistory(path: string) {
  const { content } = await opsApi.readLogFile(path);
  logContent.value = content;
  logError.value = null;
}

async function loadStatus() {
  if (!props.node) return;
  statusLoading.value = true;
  statusError.value = null;
  try {
    const result = await opsApi.fetchNodeStatus(props.node.id);
    statusOutput.value = result.output;
    statusReachable.value = result.reachable;
    if (result.error) statusError.value = result.error;
  } catch (err) {
    statusError.value = err instanceof Error ? err.message : String(err);
  } finally {
    statusLoading.value = false;
  }
}

async function runTerminal() {
  if (!terminalHostRef.value.trim() || !terminalCommand.value.trim()) return;
  terminalLoading.value = true;
  terminalOutput.value = "";
  try {
    const result = await opsApi.sshExec(terminalHostRef.value.trim(), terminalCommand.value.trim());
    terminalOutput.value = result.output;
    if (result.error) terminalOutput.value += `\n[exit ${result.exitCode}] ${result.error}`;
  } catch (err) {
    terminalOutput.value = err instanceof Error ? err.message : String(err);
  } finally {
    terminalLoading.value = false;
  }
}

async function runDeploy() {
  if (!props.node || !deployConfirm.value) return;
  deployLoading.value = true;
  deployError.value = null;
  deployOutput.value = "";
  try {
    const result = await opsApi.deployNode(props.node.id);
    deployOutput.value = result.output;
    if (result.error) deployError.value = result.error;
    if (result.logFile) await refreshHistory();
  } catch (err) {
    deployError.value = err instanceof Error ? err.message : String(err);
  } finally {
    deployLoading.value = false;
  }
}

const filteredLog = () => {
  const text = logContent.value;
  const q = filter.value.trim();
  if (!q) return text;
  return text
    .split("\n")
    .filter((line) => line.includes(q))
    .join("\n");
};

watch(
  () => props.node?.id,
  () => {
    stopFollowing();
    activeTab.value = "config";
    logContent.value = "";
    logError.value = null;
    filter.value = "";
    statusOutput.value = "";
    statusError.value = null;
    statusReachable.value = null;
    deployConfirm.value = false;
    deployOutput.value = "";
    deployError.value = null;
    terminalHostRef.value = props.node?.access?.hostRef ?? "";
    terminalCommand.value = "";
    terminalOutput.value = "";
    void refreshHistory();
  },
  { immediate: true },
);

watch(activeTab, (tab) => {
  if (tab === "status" && props.node) void loadStatus();
});
</script>

<template>
  <aside
    v-if="node"
    class="w-96 border-l border-gray-200 bg-white flex flex-col min-h-0 shrink-0"
  >
    <div class="px-4 py-3 border-b border-gray-100">
      <h3 class="text-sm font-semibold text-gray-800">{{ node.id }}</h3>
      <p class="text-xs text-gray-500">{{ node.access?.mode ?? node.kind }}</p>
    </div>

    <div class="flex border-b border-gray-100 text-xs overflow-x-auto">
      <button
        v-for="tab in (['config', 'logs', 'status', 'terminal', 'deploy'] as const)"
        :key="tab"
        class="px-3 py-2 whitespace-nowrap capitalize"
        :class="activeTab === tab ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-500'"
        @click="activeTab = tab"
      >
        {{ tab }}
      </button>
    </div>

    <div v-if="activeTab === 'config'" class="flex-1 min-h-0 overflow-auto p-3">
      <TopologyNodeForm
        mode="edit"
        :node="node"
        :ops="ops"
        @submit="(n) => emit('update:node', n)"
        @delete="emit('delete:node')"
      />
    </div>

    <div v-else-if="activeTab === 'logs'" class="flex-1 flex flex-col min-h-0 p-3 gap-2">
      <template v-if="node.access?.mode === 'host-ssh'">
        <div class="flex flex-wrap gap-2">
          <button
            class="btn-primary text-xs py-1 px-2"
            :disabled="logLoading || following"
            @click="loadSnapshot"
          >
            {{ logLoading ? "Fetching…" : "Snapshot" }}
          </button>
          <button
            v-if="!following"
            class="text-xs py-1 px-2 border border-gray-300 rounded hover:bg-gray-50"
            @click="startFollow"
          >
            Follow
          </button>
          <button
            v-else
            class="text-xs py-1 px-2 border border-red-300 text-red-700 rounded hover:bg-red-50"
            @click="stopFollowing"
          >
            Stop
          </button>
          <input
            v-model="filter"
            class="input-field text-xs flex-1 min-w-24 py-1"
            placeholder="Filter lines…"
          />
        </div>
        <p v-if="logError" class="text-xs text-amber-700">{{ logError }}</p>
        <pre
          class="flex-1 text-xs font-mono bg-gray-900 text-gray-100 p-2 rounded overflow-auto m-0 min-h-32"
        >{{ filteredLog() || "No log content yet." }}</pre>
        <div v-if="historyFiles.length">
          <p class="text-[10px] uppercase text-gray-500 mb-1">History</p>
          <ul class="text-xs space-y-1 max-h-24 overflow-auto">
            <li v-for="file in historyFiles" :key="file.path">
              <button class="text-blue-600 hover:underline text-left" @click="openHistory(file.path)">
                {{ file.name }}
              </button>
            </li>
          </ul>
        </div>
      </template>
      <template v-else>
        <p class="text-sm text-gray-600">
          Managed instance — use resource-instances.yaml for connection details.
        </p>
        <p v-if="node.access?.instanceRef" class="text-xs font-mono text-gray-500">
          instanceRef: {{ node.access.instanceRef }}
        </p>
        <a
          v-if="externalLogUrl"
          :href="externalLogUrl"
          target="_blank"
          rel="noopener"
          class="text-xs text-blue-600 hover:underline"
        >
          Open external logs (Grafana/Loki)
        </a>
      </template>
    </div>

    <div v-else-if="activeTab === 'status'" class="flex-1 flex flex-col min-h-0 p-3 gap-2">
      <div class="flex items-center gap-2">
        <button
          class="btn-primary text-xs py-1 px-2"
          :disabled="statusLoading"
          @click="loadStatus"
        >
          {{ statusLoading ? "Checking…" : "Refresh" }}
        </button>
        <span
          v-if="statusReachable !== null"
          class="text-xs px-2 py-0.5 rounded"
          :class="statusReachable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
        >
          {{ statusReachable ? "Reachable" : "Unreachable" }}
        </span>
      </div>
      <p v-if="statusError" class="text-xs text-amber-700">{{ statusError }}</p>
      <pre
        class="flex-1 text-xs font-mono bg-gray-50 border border-gray-200 p-2 rounded overflow-auto m-0 min-h-24"
      >{{ statusOutput || "No status yet." }}</pre>

      <div v-if="node.access?.mode === 'host-ssh' && selectedHost && ops" class="border-t pt-2 mt-1">
        <p class="text-[10px] uppercase text-gray-500 mb-1">Host (ops.yaml)</p>
        <label class="block text-xs text-gray-600 mb-1">
          Host
          <input
            class="input-field w-full text-xs mt-0.5"
            :value="selectedHost.host ?? ''"
            @input="patchHost('host', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="block text-xs text-gray-600 mb-1">
          User
          <input
            class="input-field w-full text-xs mt-0.5"
            :value="selectedHost.user ?? ''"
            @input="patchHost('user', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="block text-xs text-gray-600">
          Port
          <input
            type="number"
            class="input-field w-full text-xs mt-0.5"
            :value="selectedHost.port ?? 22"
            @input="patchHost('port', Number(($event.target as HTMLInputElement).value))"
          />
        </label>
      </div>

      <a
        v-if="externalLogUrl"
        :href="externalLogUrl"
        target="_blank"
        rel="noopener"
        class="text-xs text-blue-600 hover:underline mt-auto"
      >
        Open external logs
      </a>

      <div v-if="ops" class="border-t pt-2 mt-1">
        <label class="block text-xs text-gray-600">
          Global externalLogUrl (ops.yaml)
          <input
            class="input-field w-full text-xs mt-0.5 font-mono"
            :value="ops.logPolicy.externalLogUrl ?? ''"
            placeholder="https://grafana.example.com/..."
            @input="patchExternalLogUrl(($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </div>

    <div v-else-if="activeTab === 'terminal'" class="flex-1 flex flex-col min-h-0 p-3 gap-2">
      <template v-if="node.access?.mode === 'host-ssh'">
        <label class="text-xs text-gray-600">
          Host ref
          <select v-model="terminalHostRef" class="input-field w-full text-xs mt-0.5">
            <option v-for="h in ops?.hosts ?? []" :key="h.id" :value="h.id">{{ h.id }}</option>
          </select>
        </label>
        <label class="text-xs text-gray-600">
          Command
          <input
            v-model="terminalCommand"
            class="input-field w-full text-xs mt-0.5 font-mono"
            placeholder="docker ps"
            @keyup.enter="runTerminal"
          />
        </label>
        <button
          class="btn-primary text-xs py-1 px-2 self-start"
          :disabled="terminalLoading || !terminalCommand.trim()"
          @click="runTerminal"
        >
          {{ terminalLoading ? "Running…" : "Run" }}
        </button>
        <pre
          class="flex-1 text-xs font-mono bg-gray-900 text-gray-100 p-2 rounded overflow-auto m-0 min-h-24"
        >{{ terminalOutput || "Output will appear here." }}</pre>
      </template>
      <p v-else class="text-sm text-gray-600">Terminal available for host-ssh nodes only.</p>
    </div>

    <div v-else class="flex-1 flex flex-col min-h-0 p-3 gap-2">
      <template v-if="node.access?.mode === 'host-ssh'">
        <label class="flex items-center gap-2 text-xs text-gray-700">
          <input v-model="deployConfirm" type="checkbox" />
          I confirm deploy to this node
        </label>
        <button
          class="btn-primary text-xs py-1 px-2 self-start"
          :disabled="!deployConfirm || deployLoading"
          @click="runDeploy"
        >
          {{ deployLoading ? "Deploying…" : "Deploy node" }}
        </button>
        <p v-if="deployError" class="text-xs text-red-600">{{ deployError }}</p>
        <pre
          class="flex-1 text-xs font-mono bg-gray-50 border border-gray-200 p-2 rounded overflow-auto m-0 min-h-24"
        >{{ deployOutput || "Deploy output will appear here." }}</pre>
      </template>
      <p v-else class="text-sm text-gray-600">Deploy available for host-ssh nodes only.</p>
    </div>
  </aside>
</template>
