<script setup lang="ts">
import { ref, watch } from "vue";
import type { WorkflowDefinition, WorkflowSummary } from "../../composables/useWorkflow";

const props = defineProps<{
  show: boolean;
  workflow: WorkflowSummary | null;
  definition: WorkflowDefinition | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [definition: WorkflowDefinition];
  activate: [];
  delete: [];
}>();

const draft = ref<WorkflowDefinition | null>(null);

watch(
  () => props.definition,
  (def) => {
    if (def) {
      draft.value = JSON.parse(JSON.stringify(def)) as WorkflowDefinition;
    } else {
      draft.value = null;
    }
  },
  { immediate: true },
);

function moveStep(index: number, delta: number) {
  if (!draft.value) return;
  const next = index + delta;
  if (next < 0 || next >= draft.value.steps.length) return;
  const steps = [...draft.value.steps];
  const [item] = steps.splice(index, 1);
  steps.splice(next, 0, item);
  draft.value = { ...draft.value, steps };
}

function addStep() {
  if (!draft.value) return;
  const n = draft.value.steps.length + 1;
  draft.value = {
    ...draft.value,
    steps: [
      ...draft.value.steps,
      {
        id: `step-${n}`,
        title: `Step ${n}`,
        executor: "deepseek",
        skills: [],
        outputs: [],
      },
    ],
  };
}

function removeStep(index: number) {
  if (!draft.value || draft.value.steps.length <= 1) return;
  const steps = draft.value.steps.filter((_, i) => i !== index);
  draft.value = { ...draft.value, steps };
}

function onSave() {
  if (draft.value) {
    emit("save", draft.value);
  }
}
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-40 flex justify-end bg-black/20"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-lg h-full bg-white shadow-xl flex flex-col">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div>
          <h2 class="text-sm font-semibold text-gray-800">Workflow config</h2>
          <p v-if="workflow" class="text-[10px] text-gray-400">{{ workflow.id }}</p>
        </div>
        <button type="button" class="text-gray-500 hover:text-gray-800" @click="emit('close')">
          ×
        </button>
      </div>

      <div v-if="!draft" class="flex-1 p-4 text-xs text-gray-500">Loading…</div>

      <div v-else class="flex-1 overflow-y-auto p-4 space-y-4">
        <label class="block text-xs">
          <span class="text-gray-500">Title</span>
          <input
            v-model="draft.title"
            type="text"
            class="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </label>

        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-gray-500 uppercase">Pipeline steps</span>
            <button type="button" class="text-xs text-blue-600" @click="addStep">+ Add</button>
          </div>
          <div
            v-for="(step, index) in draft.steps"
            :key="`${step.id}-${index}`"
            class="border border-gray-200 rounded p-2 mb-2 space-y-2"
          >
            <div class="flex gap-2">
              <input
                v-model="step.id"
                type="text"
                placeholder="id"
                class="flex-1 border border-gray-300 rounded px-2 py-1 text-xs"
              />
              <input
                v-model="step.title"
                type="text"
                placeholder="title"
                class="flex-1 border border-gray-300 rounded px-2 py-1 text-xs"
              />
            </div>
            <select v-model="step.executor" class="w-full border border-gray-300 rounded px-2 py-1 text-xs">
              <option value="deepseek">deepseek</option>
              <option value="claude-code">claude-code</option>
            </select>
            <div class="flex gap-1">
              <button
                type="button"
                class="text-[10px] px-2 py-0.5 border rounded"
                :disabled="index === 0"
                @click="moveStep(index, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="text-[10px] px-2 py-0.5 border rounded"
                :disabled="index === draft.steps.length - 1"
                @click="moveStep(index, 1)"
              >
                ↓
              </button>
              <button
                type="button"
                class="text-[10px] px-2 py-0.5 border rounded text-red-600 ml-auto"
                @click="removeStep(index)"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 p-4 border-t border-gray-200">
        <button
          type="button"
          class="btn-primary text-xs py-1 px-3 disabled:opacity-50"
          :disabled="saving || !draft"
          @click="onSave"
        >
          Save
        </button>
        <button
          type="button"
          class="text-xs px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50"
          @click="emit('activate')"
        >
          Set as Active
        </button>
        <button
          v-if="workflow && !workflow.isLegacy"
          type="button"
          class="text-xs px-3 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
          @click="emit('delete')"
        >
          Delete
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
