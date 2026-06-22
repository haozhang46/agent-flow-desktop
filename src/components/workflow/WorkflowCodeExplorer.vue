<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { WorkspaceEntry } from "../../composables/useWorkflow";
import type { useWorkflow } from "../../composables/useWorkflow";

type WorkflowApi = Pick<
  ReturnType<typeof useWorkflow>,
  "listWorkspace" | "readWorkspaceFile"
>;

const props = defineProps<{
  api: WorkflowApi;
  root: string;
}>();

const files = ref<WorkspaceEntry[]>([]);
const selectedPath = ref<string | null>(null);
const content = ref("");
const loading = ref(false);
const fileLoading = ref(false);
const error = ref<string | null>(null);

const CODE_EXT = /\.(ts|tsx|js|jsx|vue|py|go|rs|java|json|yaml|yml|md|css|html|toml)$/i;

async function loadFiles() {
  loading.value = true;
  error.value = null;
  try {
    const { entries } = await props.api.listWorkspace(props.root, true);
    files.value = entries.filter((e) => CODE_EXT.test(e.name));
    if (!selectedPath.value && files.value.length) {
      await selectFile(files.value[0].path);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function selectFile(path: string) {
  fileLoading.value = true;
  error.value = null;
  try {
    const file = await props.api.readWorkspaceFile(path);
    selectedPath.value = path;
    content.value = file.content;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    fileLoading.value = false;
  }
}

onMounted(() => {
  void loadFiles();
});

watch(
  () => props.root,
  () => {
    selectedPath.value = null;
    content.value = "";
    void loadFiles();
  },
);
</script>

<template>
  <div class="flex flex-1 min-h-0">
    <aside class="w-56 border-r border-gray-200 bg-gray-50 flex flex-col shrink-0">
      <div class="p-2 border-b border-gray-200">
        <span class="text-xs font-medium text-gray-500">{{ root }}/</span>
      </div>
      <div class="flex-1 overflow-y-auto">
        <button
          v-for="file in files"
          :key="file.path"
          class="w-full text-left px-3 py-1.5 text-xs font-mono border-b border-gray-100 hover:bg-gray-100 truncate"
          :class="selectedPath === file.path ? 'bg-blue-50 text-blue-700' : 'text-gray-700'"
          @click="selectFile(file.path)"
        >
          {{ file.path.replace(`${root}/`, "") }}
        </button>
        <p v-if="!files.length && !loading" class="p-3 text-xs text-gray-400">
          No source files yet.
        </p>
      </div>
    </aside>

    <section class="flex-1 flex flex-col min-w-0">
      <div class="px-4 py-2 border-b border-gray-200 bg-white text-xs font-mono text-gray-600 truncate">
        {{ selectedPath ?? `${root}/` }}
      </div>
      <p v-if="error" class="px-4 py-1 text-xs text-red-600 bg-red-50">{{ error }}</p>
      <div
        v-if="loading || fileLoading"
        class="flex-1 flex items-center justify-center text-sm text-gray-400"
      >
        Loading…
      </div>
      <pre
        v-else-if="selectedPath"
        class="flex-1 overflow-auto p-4 text-xs font-mono leading-relaxed bg-gray-900 text-gray-100 m-0"
      ><code>{{ content }}</code></pre>
      <div v-else class="flex-1 flex items-center justify-center text-sm text-gray-400">
        Select a file to view source code.
      </div>
    </section>
  </div>
</template>
