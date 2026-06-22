<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { PanelApi } from "../registryComponents";

type TopologyNodeRow = {
  id: string;
  kind: string;
  source?: string;
  dockerfile?: string;
  envKeys: string[];
};

const props = defineProps<{
  api: PanelApi;
  focusNodes?: string[];
  envKeys?: string[];
}>();

const loading = ref(true);
const error = ref<string | null>(null);
const nodes = ref<TopologyNodeRow[]>([]);

const displayNodes = computed(() => {
  const focus = props.focusNodes?.map((id) => id.trim()).filter(Boolean) ?? [];
  if (!focus.length) return nodes.value;
  return nodes.value.filter((n) => focus.includes(n.id));
});

const envKeyList = computed(() => props.envKeys ?? ["NUXT_PUBLIC_API_BASE"]);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const { topology } = await props.api.fetchTopology();
    if (topology?.nodes?.length) {
      nodes.value = topology.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        source: node.source,
        dockerfile: node.dockerfile,
        envKeys: envKeysForNode(node.id, topology.edges),
      }));
      return;
    }

    try {
      const file = await props.api.readWorkspaceFile(".agentflow/topology.yaml");
      nodes.value = parseYamlNodes(file.content);
    } catch {
      nodes.value = [];
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function envKeysForNode(
  nodeId: string,
  edges: { from: string; to: string; env?: Record<string, string> }[],
): string[] {
  const keys = new Set<string>();
  for (const edge of edges) {
    if (edge.from !== nodeId || !edge.env) continue;
    for (const key of Object.keys(edge.env)) keys.add(key);
  }
  return [...keys];
}

function parseYamlNodes(raw: string): TopologyNodeRow[] {
  const rows: TopologyNodeRow[] = [];
  let current: TopologyNodeRow | null = null;
  let inEnv = false;

  for (const line of raw.split("\n")) {
    const nodeMatch = line.match(/^\s{2}-\s+id:\s*(.+)$/);
    if (nodeMatch) {
      if (current) rows.push(current);
      current = { id: nodeMatch[1].trim(), kind: "service", envKeys: [] };
      inEnv = false;
      continue;
    }
    if (!current) continue;

    const kindMatch = line.match(/^\s{4}kind:\s*(.+)$/);
    if (kindMatch) {
      current.kind = kindMatch[1].trim();
      continue;
    }
    const sourceMatch = line.match(/^\s{4}source:\s*(.+)$/);
    if (sourceMatch) {
      current.source = sourceMatch[1].trim();
      continue;
    }
    const dockerfileMatch = line.match(/^\s{4}dockerfile:\s*(.+)$/);
    if (dockerfileMatch) {
      current.dockerfile = dockerfileMatch[1].trim();
      continue;
    }
    if (/^\s{4}env:\s*$/.test(line)) {
      inEnv = true;
      continue;
    }
    const envMatch = line.match(/^\s{6}([A-Z0-9_]+):/);
    if (inEnv && envMatch) {
      current.envKeys.push(envMatch[1]);
    } else if (inEnv && !/^\s{6}/.test(line)) {
      inEnv = false;
    }
  }
  if (current) rows.push(current);
  return rows;
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="flex flex-1 min-h-0 flex-col overflow-y-auto" data-testid="topology-context">
    <div class="px-4 py-3 border-b border-gray-200 bg-white flex items-center gap-2">
      <h2 class="text-sm font-semibold text-gray-800">API &amp; Service Context</h2>
      <span class="text-xs text-gray-500">Read-only — edit in be-dev Topology</span>
      <button class="ml-auto text-xs text-gray-500 hover:text-gray-700" @click="load">Refresh</button>
    </div>

    <p v-if="error" class="px-4 py-1 text-xs text-red-600 bg-red-50">{{ error }}</p>
    <div v-if="loading" class="flex-1 flex items-center justify-center text-sm text-gray-400">
      Loading topology…
    </div>

    <template v-else>
      <section v-if="envKeyList.length" class="p-4 border-b border-gray-100">
        <h3 class="text-xs font-semibold text-gray-600 mb-2">Frontend env keys</h3>
        <ul class="text-xs font-mono text-gray-700 space-y-1">
          <li v-for="key in envKeyList" :key="key">{{ key }}</li>
        </ul>
      </section>

      <section class="p-4">
        <h3 class="text-xs font-semibold text-gray-600 mb-2">Service nodes</h3>
        <p v-if="!displayNodes.length" class="text-xs text-gray-500">
          No topology nodes found. Configure in be-dev → 拓扑&amp;中间件.
        </p>
        <table v-else class="w-full text-xs">
          <thead>
            <tr class="text-left text-gray-500 border-b">
              <th class="py-1 pr-2">Node</th>
              <th class="py-1 pr-2">Kind</th>
              <th class="py-1 pr-2">Source</th>
              <th class="py-1 pr-2">Dockerfile</th>
              <th class="py-1">Env keys</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="node in displayNodes"
              :key="node.id"
              class="border-b border-gray-50"
              :data-testid="`topology-node-${node.id}`"
            >
              <td class="py-1.5 font-medium font-mono">{{ node.id }}</td>
              <td class="py-1.5 text-gray-600">{{ node.kind }}</td>
              <td class="py-1.5 font-mono text-gray-700">
                <span v-if="node.source">source: {{ node.source }}</span>
                <span v-else class="text-gray-400">—</span>
              </td>
              <td class="py-1.5 font-mono text-gray-600">{{ node.dockerfile ?? "—" }}</td>
              <td class="py-1.5 font-mono text-gray-600">
                {{ node.envKeys.length ? node.envKeys.join(", ") : "—" }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
