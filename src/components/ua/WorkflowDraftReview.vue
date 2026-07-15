<script setup lang="ts">
import type { WorkflowDraft } from "../../types/ua";

defineProps<{
  draft: WorkflowDraft;
  applying?: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
  regenerate: [];
}>();
</script>

<template>
  <div
    class="border border-gray-200 rounded-lg overflow-hidden text-sm"
    data-testid="ua-draft-review"
  >
    <div class="px-3 py-2.5 border-b border-gray-100 bg-gray-50/80">
      <p class="text-xs font-semibold text-gray-800">{{ draft.workflow.title }}</p>
      <p class="text-[10px] text-gray-400 mt-0.5 font-mono">{{ draft.workflow.id }}</p>
    </div>

    <div class="px-3 py-2.5 space-y-3 max-h-56 overflow-y-auto">
      <div class="space-y-1.5">
        <p class="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
          Steps
        </p>
        <ul class="space-y-1.5">
          <li
            v-for="step in draft.workflow.steps"
            :key="step.id"
            class="text-xs border border-gray-100 rounded px-2 py-1.5 space-y-0.5"
            data-testid="ua-draft-step"
          >
            <div class="font-medium text-gray-800">
              {{ step.title }}
              <span class="text-gray-400 font-normal font-mono">· {{ step.id }}</span>
            </div>
            <p class="text-gray-500">
              executor: {{ step.executor }}
            </p>
            <p v-if="step.skills.length" class="text-gray-500">
              skills: {{ step.skills.join(", ") }}
            </p>
            <p v-if="step.outputs.length" class="text-gray-500">
              outputs: {{ step.outputs.join(", ") }}
            </p>
          </li>
        </ul>
      </div>

      <div v-if="draft.workflow.edges.length" class="space-y-1">
        <p class="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
          Edges
        </p>
        <ul class="space-y-0.5">
          <li
            v-for="(edge, i) in draft.workflow.edges"
            :key="`${edge.from}-${edge.to}-${i}`"
            class="text-xs text-gray-700 font-mono"
            data-testid="ua-draft-edge"
          >
            {{ edge.from }} → {{ edge.to }}
          </li>
        </ul>
      </div>
    </div>

    <div class="flex flex-wrap gap-2 px-3 py-2.5 border-t border-gray-100 bg-white">
      <button
        type="button"
        class="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        data-testid="ua-draft-cancel"
        :disabled="applying"
        @click="emit('cancel')"
      >
        Cancel
      </button>
      <button
        type="button"
        class="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        data-testid="ua-draft-regenerate"
        :disabled="applying"
        @click="emit('regenerate')"
      >
        Regenerate
      </button>
      <button
        type="button"
        class="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 ml-auto"
        data-testid="ua-draft-confirm"
        :disabled="applying"
        @click="emit('confirm')"
      >
        {{ applying ? "Applying…" : "Confirm" }}
      </button>
    </div>
  </div>
</template>
