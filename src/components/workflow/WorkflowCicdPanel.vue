<script setup lang="ts">
import { onMounted, ref } from "vue";
import type {
  DeploymentConfig,
  OpsSummary,
  Topology,
  useWorkflow,
} from "../../composables/useWorkflow";

type WorkflowApi = Pick<
  ReturnType<typeof useWorkflow>,
  "fetchDeploymentConfig" | "fetchResourceContext" | "fetchTopology" | "fetchOpsSummary" | "readWorkspaceFile"
>;

const props = defineProps<{ api: WorkflowApi }>();

const config = ref<DeploymentConfig | null>(null);
const resourceMarkdown = ref("");
const topology = ref<Topology | null>(null);
const opsSummary = ref<OpsSummary | null>(null);
const composeContent = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const platformLabel: Record<DeploymentConfig["platform"], string> = {
  "docker-compose": "Docker Compose",
  kubernetes: "Kubernetes",
  unknown: "Not configured",
};

function openTopologyCanvas() {
  window.dispatchEvent(new CustomEvent("agentflow:open-topology"));
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [deploy, resources, topo, ops] = await Promise.all([
      props.api.fetchDeploymentConfig(),
      props.api.fetchResourceContext(),
      props.api.fetchTopology(),
      props.api.fetchOpsSummary(),
    ]);
    config.value = deploy;
    resourceMarkdown.value = resources.markdown;
    topology.value = topo.topology;
    opsSummary.value = ops;

    if (deploy.composeFile) {
      try {
        const file = await props.api.readWorkspaceFile(deploy.composeFile);
        composeContent.value = file.content;
      } catch {
        composeContent.value = null;
      }
    } else {
      composeContent.value = null;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="flex flex-1 min-h-0 flex-col overflow-y-auto">
    <div class="px-4 py-3 border-b border-gray-200 bg-white flex items-center gap-2">
      <h2 class="text-sm font-semibold text-gray-800">CI/CD Deployment</h2>
      <button
        type="button"
        class="text-xs text-blue-600 hover:text-blue-800"
        data-testid="open-topology-canvas"
        @click="openTopologyCanvas"
      >
        Open Topology Canvas
      </button>
      <button class="ml-auto text-xs text-gray-500 hover:text-gray-700" @click="load">
        Refresh
      </button>
    </div>

    <p v-if="error" class="px-4 py-1 text-xs text-red-600 bg-red-50">{{ error }}</p>
    <div v-if="loading" class="flex-1 flex items-center justify-center text-sm text-gray-400">
      Loading deployment config…
    </div>

    <template v-else-if="config">
      <section
        v-if="opsSummary && (opsSummary.docker.configured || opsSummary.kubernetes.configured)"
        class="p-4 border-b border-gray-100"
      >
        <h3 class="text-xs font-semibold text-gray-600 mb-2">Runtime Ops</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div v-if="opsSummary.docker.configured" class="card p-3">
            <p class="text-[10px] uppercase text-gray-500 mb-1">Docker VPS (Portainer)</p>
            <p
              class="text-sm font-medium"
              :class="opsSummary.docker.reachable ? 'text-green-700' : 'text-amber-700'"
            >
              {{ opsSummary.docker.reachable ? "Connected" : "Unreachable" }}
            </p>
            <p v-if="opsSummary.docker.stackCount != null" class="text-xs text-gray-600 mt-1">
              Stacks: {{ opsSummary.docker.stackCount }}
            </p>
            <p
              v-if="opsSummary.docker.runningContainers != null"
              class="text-xs text-gray-600"
            >
              Running containers: {{ opsSummary.docker.runningContainers }}
            </p>
            <p v-if="opsSummary.docker.error" class="text-xs text-red-600 mt-1">
              {{ opsSummary.docker.error }}
            </p>
          </div>
          <div v-if="opsSummary.kubernetes.configured" class="card p-3">
            <p class="text-[10px] uppercase text-gray-500 mb-1">Kubernetes (Meshery)</p>
            <p
              class="text-sm font-medium"
              :class="opsSummary.kubernetes.reachable ? 'text-green-700' : 'text-amber-700'"
            >
              {{ opsSummary.kubernetes.reachable ? "Connected" : "Unreachable" }}
            </p>
            <p v-if="opsSummary.kubernetes.version" class="text-xs text-gray-600 mt-1">
              Version: {{ opsSummary.kubernetes.version }}
            </p>
            <p
              v-if="opsSummary.kubernetes.connectionCount != null"
              class="text-xs text-gray-600"
            >
              Connections: {{ opsSummary.kubernetes.connectionCount }}
            </p>
            <p v-if="opsSummary.kubernetes.error" class="text-xs text-red-600 mt-1">
              {{ opsSummary.kubernetes.error }}
            </p>
          </div>
        </div>
        <p v-if="opsSummary.intentNodeCount != null" class="text-xs text-gray-500 mt-2">
          Intent topology nodes: {{ opsSummary.intentNodeCount }}
        </p>
      </section>

      <section class="p-4 border-b border-gray-100 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="card p-3">
          <p class="text-[10px] uppercase text-gray-500 mb-1">Platform</p>
          <p class="text-sm font-medium text-gray-800">{{ platformLabel[config.platform] }}</p>
        </div>
        <div class="card p-3">
          <p class="text-[10px] uppercase text-gray-500 mb-1">Nodes / Services</p>
          <p class="text-sm font-medium text-gray-800">
            {{ config.nodeCount ?? config.services.length ?? "—" }}
          </p>
        </div>
        <div class="card p-3">
          <p class="text-[10px] uppercase text-gray-500 mb-1">Nginx</p>
          <p class="text-sm font-medium" :class="config.hasNginx ? 'text-green-700' : 'text-gray-500'">
            {{ config.hasNginx ? "Yes" : "No" }}
          </p>
        </div>
        <div class="card p-3">
          <p class="text-[10px] uppercase text-gray-500 mb-1">Workflows</p>
          <p class="text-sm font-medium text-gray-800">{{ config.workflowFiles.length }}</p>
        </div>
      </section>

      <section v-if="topology?.nodes?.length" class="p-4 border-b border-gray-100">
        <h3 class="text-xs font-semibold text-gray-600 mb-2">Service Topology</h3>
        <div class="space-y-1 text-xs">
          <div v-for="node in topology.nodes" :key="node.id" class="bg-gray-50 rounded-lg px-3 py-2 font-mono">
            <span class="font-medium text-gray-800">{{ node.id }}</span>
            <span class="text-gray-500"> ({{ node.engine ?? node.kind }})</span>
          </div>
          <div
            v-for="(edge, idx) in topology.edges"
            :key="`${edge.from}-${edge.to}-${idx}`"
            class="text-gray-600 px-3"
          >
            {{ edge.from }} → {{ edge.to }}
          </div>
        </div>
      </section>

      <section v-if="config.databases.length" class="p-4 border-b border-gray-100">
        <h3 class="text-xs font-semibold text-gray-600 mb-2">Databases</h3>
        <div class="space-y-2">
          <div
            v-for="db in config.databases"
            :key="db.name"
            class="text-xs bg-gray-50 rounded-lg px-3 py-2 font-mono"
          >
            <span class="font-medium text-gray-800">{{ db.type }}/{{ db.name }}</span>
            <span v-if="db.host" class="text-gray-500">
              — {{ db.host }}{{ db.port ? `:${db.port}` : "" }}
            </span>
            <span v-else class="text-amber-600"> — host not configured</span>
          </div>
        </div>
      </section>

      <section v-if="config.caches.length" class="p-4 border-b border-gray-100">
        <h3 class="text-xs font-semibold text-gray-600 mb-2">Cache (Redis)</h3>
        <div class="space-y-2">
          <div
            v-for="cache in config.caches"
            :key="cache.name"
            class="text-xs bg-gray-50 rounded-lg px-3 py-2 font-mono"
          >
            <span class="font-medium text-gray-800">{{ cache.type }}/{{ cache.name }}</span>
            <span v-if="cache.host" class="text-gray-500">
              — {{ cache.host }}{{ cache.port ? `:${cache.port}` : "" }}
            </span>
            <span v-else class="text-amber-600"> — host not configured</span>
          </div>
        </div>
      </section>

      <section v-if="config.services.length" class="p-4 border-b border-gray-100">
        <h3 class="text-xs font-semibold text-gray-600 mb-2">Compose services</h3>
        <table class="w-full text-xs">
          <thead>
            <tr class="text-left text-gray-500 border-b">
              <th class="py-1 pr-2">Service</th>
              <th class="py-1 pr-2">Image</th>
              <th class="py-1">Ports</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="svc in config.services" :key="svc.name" class="border-b border-gray-50">
              <td class="py-1.5 font-medium">{{ svc.name }}</td>
              <td class="py-1.5 text-gray-600 font-mono">{{ svc.image ?? "—" }}</td>
              <td class="py-1.5 text-gray-600 font-mono">{{ svc.ports?.join(", ") ?? "—" }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="config.workflowFiles.length" class="p-4 border-b border-gray-100">
        <h3 class="text-xs font-semibold text-gray-600 mb-2">GitHub Actions</h3>
        <ul class="text-xs text-gray-700 space-y-1 font-mono">
          <li v-for="wf in config.workflowFiles" :key="wf">{{ wf }}</li>
        </ul>
      </section>

      <section v-if="composeContent" class="p-4 border-b border-gray-100">
        <h3 class="text-xs font-semibold text-gray-600 mb-2">{{ config.composeFile }}</h3>
        <pre class="text-xs font-mono bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto m-0"><code>{{ composeContent }}</code></pre>
      </section>

      <section v-if="resourceMarkdown" class="p-4">
        <h3 class="text-xs font-semibold text-gray-600 mb-2">Resource declarations</h3>
        <pre class="text-xs font-mono bg-gray-50 p-3 rounded-lg whitespace-pre-wrap m-0 text-gray-700">{{ resourceMarkdown }}</pre>
      </section>
    </template>
  </div>
</template>
