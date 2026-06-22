<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import MarkdownPreview from "./MarkdownPreview.vue";
import type { useWorkflow } from "../../composables/useWorkflow";

type WorkflowApi = Pick<ReturnType<typeof useWorkflow>, "readWorkspaceFile">;

type ArchFile = { path: string; label: string };

const DEFAULT_ARCH_FILES: ArchFile[] = [
  { path: "docs/architecture.md", label: "Architecture" },
  { path: "AGENTS.md", label: "AGENTS.md" },
];

const props = defineProps<{ api: WorkflowApi; files?: ArchFile[] }>();

const archFiles = computed(() =>
  props.files?.length ? props.files : DEFAULT_ARCH_FILES,
);

const selectedPath = ref(archFiles.value[0].path);
const content = ref("");
const loading = ref(false);
const error = ref<string | null>(null);

async function loadFile(path: string) {
  loading.value = true;
  error.value = null;
  try {
    const file = await props.api.readWorkspaceFile(path);
    content.value = file.content;
  } catch {
    content.value = "";
    error.value = `File not found: ${path}`;
  } finally {
    loading.value = false;
  }
}

watch(
  archFiles,
  (files) => {
    if (!files.some((f) => f.path === selectedPath.value)) {
      selectedPath.value = files[0]?.path ?? "";
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (selectedPath.value) void loadFile(selectedPath.value);
});

watch(selectedPath, (path) => {
  if (path) void loadFile(path);
});
</script>

<template>
  <div class="flex flex-1 min-h-0">
    <aside class="w-44 border-r border-gray-200 bg-gray-50 shrink-0">
      <div class="p-2 border-b border-gray-200">
        <span class="text-xs font-medium text-gray-500">Architecture</span>
      </div>
      <button
        v-for="file in archFiles"
        :key="file.path"
        class="w-full text-left px-3 py-2 text-xs border-b border-gray-100 hover:bg-gray-100"
        :class="selectedPath === file.path ? 'bg-blue-50 text-blue-700' : 'text-gray-700'"
        @click="selectedPath = file.path"
      >
        {{ file.label }}
      </button>
    </aside>

    <section class="flex-1 flex flex-col min-w-0">
      <div class="px-4 py-2 border-b border-gray-200 bg-white text-sm font-medium text-gray-700">
        {{ selectedPath }}
      </div>
      <p v-if="error" class="px-4 py-1 text-xs text-amber-700 bg-amber-50">{{ error }}</p>
      <div v-if="loading" class="flex-1 flex items-center justify-center text-sm text-gray-400">
        Loading…
      </div>
      <div v-else-if="content" class="flex-1 overflow-y-auto p-6">
        <MarkdownPreview :content="content" />
      </div>
      <div v-else class="flex-1 flex items-center justify-center text-sm text-gray-400">
        Architecture document not created yet. Use chat to generate docs/architecture.md.
      </div>
    </section>
  </div>
</template>
