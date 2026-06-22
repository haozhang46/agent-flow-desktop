<script setup lang="ts">
import { onMounted, ref } from "vue";
import { buildReadinessReport, type ReadinessReport } from "../../utils/cicdReadinessChecks";
import type { PanelApi } from "../registryComponents";

const props = defineProps<{
  api: PanelApi;
  gatesStepId?: string;
}>();

const loading = ref(true);
const error = ref<string | null>(null);
const report = ref<ReadinessReport | null>(null);

async function pathExists(path: string): Promise<boolean> {
  try {
    await props.api.readWorkspaceFile(path);
    return true;
  } catch {
    return false;
  }
}

async function dirHasYaml(dir: string): Promise<boolean> {
  try {
    const listing = await props.api.listWorkspace(dir);
    return listing.entries.some(
      (e) => e.type === "file" && (e.name.endsWith(".yml") || e.name.endsWith(".yaml")),
    );
  } catch {
    return false;
  }
}

async function checkSourceDir(source: string): Promise<boolean> {
  try {
    const listing = await props.api.listWorkspace(source);
    return listing.exists !== false;
  } catch {
    return false;
  }
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const stepId = props.gatesStepId ?? "cicd";
    const [dockerfile, workflows, compose, topoResult, gatesResult] = await Promise.all([
      pathExists("Dockerfile"),
      dirHasYaml(".github/workflows"),
      pathExists("docker-compose.yml"),
      props.api.fetchTopology(),
      props.api.fetchGates(stepId),
    ]);

    const topology = topoResult.topology;
    const sourcesExist: Record<string, boolean> = {};
    const sourceDirs = new Set(
      (topology?.nodes ?? [])
        .map((n) => n.source)
        .filter((s): s is string => Boolean(s?.trim())),
    );
    await Promise.all(
      [...sourceDirs].map(async (src) => {
        sourcesExist[src] = await checkSourceDir(src);
      }),
    );

    report.value = buildReadinessReport({
      files: { dockerfile, workflows, compose },
      topology: topology ? { nodes: topology.nodes } : null,
      sourcesExist,
      gates: gatesResult.results,
    });
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
  <div class="flex flex-1 min-h-0 flex-col overflow-y-auto" data-testid="cicd-readiness">
    <div class="px-4 py-3 border-b border-gray-200 bg-white flex items-center gap-2">
      <h2 class="text-sm font-semibold text-gray-800">CI/CD Readiness</h2>
      <button class="ml-auto text-xs text-gray-500 hover:text-gray-700" @click="load">Refresh</button>
    </div>

    <p v-if="error" class="px-4 py-1 text-xs text-red-600 bg-red-50">{{ error }}</p>
    <div v-if="loading" class="flex-1 flex items-center justify-center text-sm text-gray-400">
      Checking readiness…
    </div>

    <template v-else-if="report">
      <div
        class="mx-4 mt-4 px-3 py-2 rounded-lg text-sm font-medium"
        :class="report.ready ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'"
        data-testid="readiness-summary"
      >
        {{ report.ready ? "Ready for deploy artifacts" : "Not ready — fix items below" }}
      </div>

      <ul class="p-4 space-y-2">
        <li
          v-for="item in report.items"
          :key="item.id"
          class="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
          :class="item.pass ? 'bg-green-50' : 'bg-red-50'"
          :data-testid="`readiness-${item.id}`"
        >
          <span :class="item.pass ? 'text-green-700' : 'text-red-700'">
            {{ item.pass ? "✓" : "✗" }}
          </span>
          <div>
            <p class="font-medium text-gray-800">{{ item.label }}</p>
            <p v-if="item.detail" class="text-gray-600 mt-0.5">{{ item.detail }}</p>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
