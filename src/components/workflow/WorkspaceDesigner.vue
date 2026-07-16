<script setup lang="ts">
import { computed, ref, shallowRef, watch, type Component } from "vue";
import { useWorkspaceConfig } from "../../composables/useWorkspaceConfig";
import {
  WORKSPACE_REGISTRY,
  registryEntry,
  type WorkspaceComponent,
  type WorkspaceDefinition,
  type WorkspaceRegistryEntry,
} from "../../workspace/registry";
import {
  isRegisteredWidgetType,
  WIDGET_COMPONENTS,
  type PanelApi,
} from "../../workspace/registryComponents";
import { bindWidgetProps } from "../../workspace/widgetBindProps";
import DeclarativePanelWidget from "../../workspace/widgets/DeclarativePanelWidget.vue";
import WorkspacePropFields from "./WorkspacePropFields.vue";

const RUNTIME_ONLY_TYPES = new Set(["agent-run", "langflow-panel"]);

const props = defineProps<{
  show: boolean;
  workflowId: string | null;
  steps: { id: string; title: string }[];
  initialStepId?: string | null;
  skills?: string[];
  panelApi?: PanelApi;
}>();

const emit = defineEmits<{
  close: [];
  saved: [definition: WorkspaceDefinition];
}>();

const { fetchWorkspace, saveWorkspace, fetchRegistry } = useWorkspaceConfig();

const selectedStepId = ref("");
const layout = ref<"tabs" | "stack">("tabs");
const components = ref<WorkspaceComponent[]>([]);
const selectedComponentId = ref<string | null>(null);
const registry = ref<WorkspaceRegistryEntry[]>(WORKSPACE_REGISTRY);
const loading = ref(false);
const saving = ref(false);
const loadError = ref<string | null>(null);
const dragIndex = ref<number | null>(null);

const registryByCategory = computed(() => {
  const groups: Record<string, WorkspaceRegistryEntry[]> = {};
  for (const entry of registry.value) {
    if (!groups[entry.category]) {
      groups[entry.category] = [];
    }
    groups[entry.category].push(entry);
  }
  return groups;
});

const selectedComponent = computed(
  () => components.value.find((c) => c.id === selectedComponentId.value) ?? null,
);

const selectedEntry = computed(() => {
  const type = selectedComponent.value?.type;
  if (!type) return undefined;
  return registry.value.find((e) => e.type === type) ?? registryEntry(type);
});

const previewResolved = shallowRef<Component | null>(null);

const previewKey = computed(() => {
  const comp = selectedComponent.value;
  if (!comp) return "";
  return `${comp.id}-${JSON.stringify(comp.props)}`;
});

const previewBindProps = computed(() => {
  const comp = selectedComponent.value;
  if (!comp) return {};
  if (isRegisteredWidgetType(comp.type)) {
    return bindWidgetProps(comp, props.panelApi ?? ({} as PanelApi));
  }
  const entry = selectedEntry.value;
  if (!entry) {
    return {
      propsFields: [],
      modelProps: comp.props,
      missingType: comp.type,
    };
  }
  return {
    propsFields: entry.propsFields,
    modelProps: comp.props,
  };
});

watch(
  () => selectedComponent.value?.type,
  async (type) => {
    previewResolved.value = null;
    if (!type || RUNTIME_ONLY_TYPES.has(type)) return;
    if (isRegisteredWidgetType(type)) {
      const loader = WIDGET_COMPONENTS[type];
      const mod = await loader();
      previewResolved.value = mod.default;
      return;
    }
    previewResolved.value = DeclarativePanelWidget;
  },
  { immediate: true },
);

function isDeclarativePreview(type: string): boolean {
  return !isRegisteredWidgetType(type) && !RUNTIME_ONLY_TYPES.has(type);
}

function isRuntimeOnlyType(type: string): boolean {
  return RUNTIME_ONLY_TYPES.has(type);
}

function runtimePlaceholderMessage(type: string): string | null {
  if (type === "agent-run") {
    return "Runtime widget — configure props here; run step in Workflow Run.";
  }
  if (type === "langflow-panel") {
    return "Langflow panel — run in Workflow Run or Chat.";
  }
  return null;
}

const categoryLabel = (category: string) =>
  category.charAt(0).toUpperCase() + category.slice(1);

watch(
  () => [props.show, props.workflowId, props.initialStepId] as const,
  async ([visible, workflowId, initialStepId]) => {
    if (!visible || !workflowId) return;
    selectedStepId.value =
      initialStepId && props.steps.some((s) => s.id === initialStepId)
        ? initialStepId
        : (props.steps[0]?.id ?? "");
    try {
      const res = await fetchRegistry(workflowId);
      registry.value = res.components;
    } catch {
      registry.value = WORKSPACE_REGISTRY;
    }
    if (selectedStepId.value) {
      await loadStepWorkspace(selectedStepId.value);
    }
  },
  { immediate: true },
);

watch(selectedStepId, async (stepId, prev) => {
  if (!props.show || !stepId || stepId === prev) return;
  await loadStepWorkspace(stepId);
});

async function loadStepWorkspace(stepId: string) {
  if (!props.workflowId) return;
  loading.value = true;
  loadError.value = null;
  try {
    const ws = await fetchWorkspace(props.workflowId, stepId);
    layout.value = ws.layout;
    components.value = JSON.parse(JSON.stringify(ws.components)) as WorkspaceComponent[];
    selectedComponentId.value = components.value[0]?.id ?? null;
  } catch {
    layout.value = "tabs";
    components.value = [];
    selectedComponentId.value = null;
  } finally {
    loading.value = false;
  }
}

function addComponent(entry: WorkspaceRegistryEntry) {
  const id = `${entry.type}-${Date.now()}`;
  const comp: WorkspaceComponent = {
    id,
    type: entry.type,
    label: entry.label,
    props: JSON.parse(JSON.stringify(entry.defaultProps)) as Record<string, unknown>,
  };
  components.value = [...components.value, comp];
  selectedComponentId.value = id;
}

function removeComponent(index: number) {
  const removed = components.value[index];
  components.value = components.value.filter((_, i) => i !== index);
  if (selectedComponentId.value === removed?.id) {
    selectedComponentId.value = components.value[0]?.id ?? null;
  }
}

function moveComponent(index: number, delta: number) {
  const next = index + delta;
  if (next < 0 || next >= components.value.length) return;
  const items = [...components.value];
  const [item] = items.splice(index, 1);
  items.splice(next, 0, item);
  components.value = items;
}

function onDragStart(index: number) {
  dragIndex.value = index;
}

function onDragOver(event: DragEvent) {
  event.preventDefault();
}

function onDrop(index: number) {
  if (dragIndex.value === null || dragIndex.value === index) return;
  const items = [...components.value];
  const [item] = items.splice(dragIndex.value, 1);
  items.splice(index, 0, item);
  components.value = items;
  dragIndex.value = null;
}

function updateSelectedComponent(patch: Partial<WorkspaceComponent>) {
  const idx = components.value.findIndex((c) => c.id === selectedComponentId.value);
  if (idx < 0) return;
  components.value[idx] = { ...components.value[idx], ...patch };
}

function updateSelectedProp(key: string, value: unknown) {
  const idx = components.value.findIndex((c) => c.id === selectedComponentId.value);
  if (idx < 0) return;
  const comp = components.value[idx];
  components.value[idx] = {
    ...comp,
    props: { ...comp.props, [key]: value },
  };
}

function onPropUpdate({ key, value }: { key: string; value: unknown }) {
  updateSelectedProp(key, value);
}

async function onSave() {
  if (!props.workflowId || !selectedStepId.value) return;
  saving.value = true;
  loadError.value = null;
  try {
    const definition: WorkspaceDefinition = {
      version: 1,
      stepId: selectedStepId.value,
      layout: layout.value,
      components: components.value,
    };
    const saved = await saveWorkspace(props.workflowId, selectedStepId.value, definition);
    emit("saved", saved);
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
    data-testid="workspace-designer"
    @click.self="emit('close')"
  >
    <div class="w-[95vw] max-w-7xl h-[85vh] bg-white shadow-xl rounded-lg flex flex-col">
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-200">
        <h2 class="text-sm font-semibold text-gray-800">Design workspace</h2>
        <label class="flex items-center gap-2 text-xs text-gray-600">
          <span>Step</span>
          <select
            v-model="selectedStepId"
            data-testid="step-selector"
            class="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option v-for="step in steps" :key="step.id" :value="step.id">
              {{ step.title }}
            </option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-xs text-gray-600 ml-auto">
          <span>Layout</span>
          <select
            v-model="layout"
            data-testid="layout-selector"
            class="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="tabs">tabs</option>
            <option value="stack">stack</option>
          </select>
        </label>
        <button type="button" class="text-gray-500 hover:text-gray-800 text-lg leading-none" @click="emit('close')">
          ×
        </button>
      </div>

      <p v-if="loadError" class="px-4 py-1 text-xs text-red-600 bg-red-50">{{ loadError }}</p>

      <div v-if="loading" class="flex-1 flex items-center justify-center text-xs text-gray-500">
        Loading workspace…
      </div>

      <div v-else class="flex flex-1 min-h-0">
        <section class="w-52 shrink-0 border-r border-gray-200 overflow-y-auto p-3">
          <p class="text-[10px] font-medium text-gray-500 uppercase mb-2">Component library</p>
          <div v-for="(entries, category) in registryByCategory" :key="category" class="mb-3">
            <p class="text-[10px] text-gray-400 uppercase mb-1">{{ categoryLabel(category) }}</p>
            <button
              v-for="entry in entries"
              :key="entry.type"
              type="button"
              class="w-full text-left px-2 py-1.5 mb-1 rounded border border-gray-200 hover:bg-blue-50 hover:border-blue-200 text-xs"
              :data-testid="`library-${entry.type}`"
              @dblclick="addComponent(entry)"
              @click="addComponent(entry)"
            >
              <span class="font-medium text-gray-800">{{ entry.label }}</span>
              <span class="block text-[10px] text-gray-400 truncate">{{ entry.description }}</span>
            </button>
          </div>
        </section>

        <section class="flex-1 min-w-0 border-r border-gray-200 overflow-y-auto p-3">
          <p class="text-[10px] font-medium text-gray-500 uppercase mb-2">Selected components</p>
          <p v-if="!components.length" class="text-xs text-gray-400">Add components from the library.</p>
          <ul data-testid="selected-list">
            <li
              v-for="(comp, index) in components"
              :key="comp.id"
              draggable="true"
              class="flex items-center gap-2 px-2 py-2 mb-1 rounded border cursor-move"
              :class="
                selectedComponentId === comp.id
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200 hover:bg-gray-50'
              "
              :data-testid="`selected-${comp.id}`"
              @click="selectedComponentId = comp.id"
              @dragstart="onDragStart(index)"
              @dragover="onDragOver"
              @drop="onDrop(index)"
            >
              <span class="flex-1 min-w-0 truncate text-xs text-gray-800">
                {{ index + 1 }}. {{ comp.label || comp.type }}
              </span>
              <button
                type="button"
                class="text-[10px] px-1.5 py-0.5 border rounded disabled:opacity-40"
                :disabled="index === 0"
                :data-testid="`move-up-${comp.id}`"
                @click.stop="moveComponent(index, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="text-[10px] px-1.5 py-0.5 border rounded disabled:opacity-40"
                :disabled="index === components.length - 1"
                :data-testid="`move-down-${comp.id}`"
                @click.stop="moveComponent(index, 1)"
              >
                ↓
              </button>
              <button
                type="button"
                class="text-[10px] px-1.5 py-0.5 border rounded text-red-600"
                :data-testid="`remove-${comp.id}`"
                @click.stop="removeComponent(index)"
              >
                ✕
              </button>
            </li>
          </ul>
        </section>

        <section class="w-64 shrink-0 border-r border-gray-200 overflow-y-auto p-3">
          <p class="text-[10px] font-medium text-gray-500 uppercase mb-2">Properties</p>
          <div v-if="!selectedComponent" class="text-xs text-gray-400">Select a component.</div>
          <div v-else class="space-y-3">
            <label class="block text-xs">
              <span class="text-gray-500">Label</span>
              <input
                :value="selectedComponent.label ?? ''"
                type="text"
                class="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-xs"
                @input="updateSelectedComponent({ label: ($event.target as HTMLInputElement).value })"
              />
            </label>
            <WorkspacePropFields
              :fields="selectedEntry?.propsFields ?? []"
              :values="selectedComponent.props"
              :skills="skills"
              @update:prop="onPropUpdate"
            />
          </div>
        </section>

        <section class="w-[40%] min-w-0 shrink-0 overflow-y-auto p-3" data-testid="preview-column">
          <p class="text-[10px] font-medium text-gray-500 uppercase mb-2">Preview</p>
          <div v-if="!selectedComponent" class="text-xs text-gray-400">
            Select a component to preview.
          </div>
          <template v-else>
            <div
              v-if="isRuntimeOnlyType(selectedComponent.type)"
              class="rounded border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600"
              data-testid="preview-runtime-placeholder"
            >
              {{ runtimePlaceholderMessage(selectedComponent.type) }}
            </div>
            <component
              :is="previewResolved"
              v-else-if="previewResolved && (isRegisteredWidgetType(selectedComponent.type) || isDeclarativePreview(selectedComponent.type))"
              :key="previewKey"
              data-testid="preview-mount"
              :data-preview-key="previewKey"
              v-bind="previewBindProps"
            />
          </template>
        </section>
      </div>

      <div class="flex gap-2 p-4 border-t border-gray-200">
        <button
          type="button"
          class="btn-primary text-xs py-1 px-3 disabled:opacity-50"
          data-testid="save-workspace"
          :disabled="saving || !workflowId || !selectedStepId"
          @click="onSave"
        >
          {{ saving ? "Saving…" : "Save" }}
        </button>
        <button
          type="button"
          class="text-xs px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 ml-auto"
          @click="emit('close')"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>
