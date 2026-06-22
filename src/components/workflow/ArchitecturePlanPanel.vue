<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import MarkdownPreview from "./MarkdownPreview.vue";
import type { PanelApi } from "../../workspace/registryComponents";
import {
  applyLayersToMarkdown,
  buildInitialArchitectureMarkdown,
  extractLayersFromMarkdown,
  mergeLayerLists,
  syncCheckedLayersFromContent,
} from "../../utils/architecturePlanMarkdown";

const props = defineProps<{
  api: PanelApi;
  output: string;
  layers: string[];
  componentId?: string;
  widgetType: "fe-architecture-plan" | "be-architecture-plan";
  title: string;
  editorTestId: string;
}>();

const content = ref("");
const draft = ref("");
const allLayers = ref<string[]>([...props.layers]);
const checkedLayers = ref<string[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const isEditing = ref(false);
const showAddLayer = ref(false);
const newLayerName = ref("");

const isDirty = computed(() => isEditing.value && draft.value !== content.value);

function syncLayersFromContent(md: string) {
  allLayers.value = mergeLayerLists(props.layers, extractLayersFromMarkdown(md));
  checkedLayers.value = syncCheckedLayersFromContent(md, allLayers.value);
}

async function persistLayers() {
  if (!props.api.persistArchitectureLayers || !props.componentId) return;
  await props.api.persistArchitectureLayers(allLayers.value, props.componentId, props.widgetType);
}

async function loadOutput() {
  loading.value = true;
  error.value = null;
  try {
    const file = await props.api.readWorkspaceFile(props.output);
    content.value = file.content;
    draft.value = file.content;
    syncLayersFromContent(file.content);
    isEditing.value = false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ENOENT") || message.includes("not found")) {
      allLayers.value = [...props.layers];
      checkedLayers.value = [...props.layers];
      const initial = buildInitialArchitectureMarkdown(props.title, allLayers.value);
      content.value = initial;
      draft.value = initial;
      isEditing.value = true;
    } else {
      error.value = message;
    }
  } finally {
    loading.value = false;
  }
}

function toggleLayer(layer: string) {
  if (checkedLayers.value.includes(layer)) {
    checkedLayers.value = checkedLayers.value.filter((l) => l !== layer);
  } else {
    checkedLayers.value = [...checkedLayers.value, layer];
  }
  if (isEditing.value) {
    draft.value = applyLayersToMarkdown(draft.value, allLayers.value, checkedLayers.value);
  }
}

function startEdit() {
  draft.value = content.value;
  syncLayersFromContent(content.value);
  isEditing.value = true;
}

async function saveDoc() {
  saving.value = true;
  error.value = null;
  try {
    const body = isEditing.value
      ? draft.value
      : applyLayersToMarkdown(content.value, allLayers.value, checkedLayers.value);
    await props.api.writeWorkspaceFile(props.output, body);
    content.value = body;
    draft.value = body;
    syncLayersFromContent(body);
    isEditing.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

async function confirmAddLayer() {
  const name = newLayerName.value.trim();
  if (!name) return;
  if (allLayers.value.includes(name)) {
    error.value = `Layer already exists: ${name}`;
    return;
  }
  error.value = null;
  allLayers.value = [...allLayers.value, name];
  checkedLayers.value = [...checkedLayers.value, name];
  const md = applyLayersToMarkdown(
    isEditing.value ? draft.value : content.value,
    allLayers.value,
    checkedLayers.value,
  );
  if (isEditing.value) {
    draft.value = md;
  } else {
    content.value = md;
    draft.value = md;
    await props.api.writeWorkspaceFile(props.output, md);
  }
  showAddLayer.value = false;
  newLayerName.value = "";
  try {
    await persistLayers();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

async function removeLayer(layer: string) {
  if (allLayers.value.length <= 1) {
    error.value = "At least one layer is required";
    return;
  }
  if (!globalThis.confirm?.(`Remove layer "${layer}"?`)) return;
  error.value = null;
  allLayers.value = allLayers.value.filter((l) => l !== layer);
  checkedLayers.value = checkedLayers.value.filter((l) => l !== layer);
  const md = applyLayersToMarkdown(
    isEditing.value ? draft.value : content.value,
    allLayers.value,
    checkedLayers.value,
  );
  if (isEditing.value) {
    draft.value = md;
  } else {
    content.value = md;
    draft.value = md;
    await props.api.writeWorkspaceFile(props.output, md);
  }
  try {
    await persistLayers();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

onMounted(() => {
  void loadOutput();
});

watch(
  () => props.output,
  () => {
    void loadOutput();
  },
);

watch(
  () => props.layers,
  (next) => {
    allLayers.value = mergeLayerLists(next, extractLayersFromMarkdown(content.value));
  },
);
</script>

<template>
  <div class="flex flex-1 min-h-0">
    <aside class="w-52 border-r border-gray-200 bg-gray-50 flex flex-col shrink-0">
      <div class="p-3 border-b border-gray-200 flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Layers</span>
        <button
          type="button"
          class="text-xs px-1.5 py-0.5 rounded border border-gray-300 hover:bg-white"
          data-testid="add-arch-layer"
          @click="showAddLayer = true"
        >
          + Add
        </button>
      </div>

      <div
        v-if="showAddLayer"
        class="p-2 border-b border-gray-200 space-y-2"
        data-testid="add-layer-form"
      >
        <input
          v-model="newLayerName"
          type="text"
          class="w-full text-xs px-2 py-1 border border-gray-300 rounded"
          placeholder="layer/name"
          data-testid="new-layer-name"
          @keydown.enter.prevent="confirmAddLayer"
        />
        <div class="flex gap-1">
          <button
            type="button"
            class="text-xs px-2 py-0.5 rounded bg-blue-600 text-white"
            data-testid="confirm-add-layer"
            @click="confirmAddLayer"
          >
            Add
          </button>
          <button
            type="button"
            class="text-xs px-2 py-0.5 rounded border border-gray-300"
            @click="showAddLayer = false; newLayerName = ''"
          >
            Cancel
          </button>
        </div>
      </div>

      <ul class="flex-1 overflow-y-auto p-2 space-y-1">
        <li v-for="layer in allLayers" :key="layer" class="group flex items-center gap-1">
          <label class="flex flex-1 items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 cursor-pointer text-sm text-gray-700 min-w-0">
            <input
              type="checkbox"
              class="rounded border-gray-300 shrink-0"
              :checked="checkedLayers.includes(layer)"
              @change="toggleLayer(layer)"
            />
            <span class="truncate" :title="layer">{{ layer }}</span>
          </label>
          <button
            type="button"
            class="opacity-0 group-hover:opacity-100 text-xs text-red-500 px-1 shrink-0"
            data-testid="delete-arch-layer"
            :title="`Remove ${layer}`"
            @click="removeLayer(layer)"
          >
            ×
          </button>
        </li>
      </ul>
      <p class="p-3 text-xs text-gray-400 border-t border-gray-200">
        Output: {{ output }}
      </p>
    </aside>

    <section class="flex-1 flex flex-col min-w-0">
      <div class="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
        <span class="text-sm font-medium text-gray-700">{{ title }}</span>
        <div class="ml-auto flex gap-2">
          <button
            v-if="!isEditing"
            class="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
            :disabled="loading"
            @click="startEdit"
          >
            Edit
          </button>
          <button
            v-if="isEditing || checkedLayers.length"
            class="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
            :disabled="saving || (isEditing && !isDirty && !checkedLayers.length)"
            @click="saveDoc"
          >
            Save
          </button>
          <button
            v-if="isEditing"
            class="text-xs px-2 py-1 rounded border border-gray-300"
            @click="isEditing = false; draft = content"
          >
            Cancel
          </button>
        </div>
      </div>

      <p v-if="error" class="px-4 py-1 text-xs text-red-600 bg-red-50">{{ error }}</p>

      <div v-if="loading" class="flex-1 flex items-center justify-center text-sm text-gray-400">
        Loading…
      </div>
      <textarea
        v-else-if="isEditing"
        v-model="draft"
        class="flex-1 p-4 font-mono text-sm resize-none outline-none border-0"
        spellcheck="false"
        :data-testid="editorTestId"
      />
      <div v-else class="flex-1 overflow-y-auto p-6">
        <MarkdownPreview :content="content" />
      </div>
    </section>
  </div>
</template>
