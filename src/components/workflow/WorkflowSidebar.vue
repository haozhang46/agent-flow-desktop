<script setup lang="ts">
import type { StepStatus, WorkflowSummary } from "../../composables/useWorkflow";

export interface SidebarStep {
  id: string;
  title: string;
  status: StepStatus;
}

defineProps<{
  workflows: WorkflowSummary[];
  steps: SidebarStep[];
  selectedWorkflowId: string | null;
  activeWorkflowId: string | null;
  viewingStepId: string | null;
}>();

const emit = defineEmits<{
  "select-workflow": [workflowId: string];
  "config-workflow": [workflowId: string];
  "design-workspace": [];
  "select-step": [stepId: string];
  "add-workflow": [];
}>();

const statusLabel: Record<StepStatus, string> = {
  pending: "Pending",
  running: "Running",
  done: "Done",
  failed: "Failed",
  skipped: "Skipped",
  gate_failed: "Gate",
};

const statusClass: Record<StepStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  running: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-yellow-100 text-yellow-800",
  gate_failed: "bg-orange-100 text-orange-800",
};
</script>

<template>
  <aside class="w-52 border-r border-gray-200 bg-gray-50 flex flex-col shrink-0">
    <div class="p-3 border-b border-gray-200 flex items-center justify-between gap-2">
      <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Workflows</p>
      <button
        type="button"
        class="text-xs text-blue-600 hover:underline"
        title="Add from template"
        @click="emit('add-workflow')"
      >
        +
      </button>
    </div>

    <div class="max-h-40 overflow-y-auto border-b border-gray-200">
      <div
        v-for="wf in workflows"
        :key="wf.id"
        class="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100"
        :class="selectedWorkflowId === wf.id ? 'bg-blue-50' : 'hover:bg-gray-100'"
      >
        <button
          type="button"
          class="flex-1 min-w-0 text-left text-sm px-1 py-0.5 truncate"
          @click="emit('select-workflow', wf.id)"
        >
          <span
            v-if="activeWorkflowId === wf.id"
            class="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1 align-middle"
            title="Active"
          />
          {{ wf.title }}
        </button>
        <button
          type="button"
          class="text-xs px-1.5 py-0.5 text-gray-500 hover:text-gray-800 shrink-0"
          title="Configure workflow"
          @click.stop="emit('config-workflow', wf.id)"
        >
          ⚙
        </button>
      </div>
    </div>

    <div class="p-3 border-b border-gray-200 flex items-center justify-between gap-2">
      <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Pipeline Steps</p>
      <button
        type="button"
        class="text-[10px] text-blue-600 hover:underline shrink-0"
        title="Design workspace layout"
        :disabled="!steps.length"
        @click="emit('design-workspace')"
      >
        Design
      </button>
    </div>

    <div class="flex-1 overflow-y-auto">
      <button
        v-for="step in steps"
        :key="step.id"
        type="button"
        class="w-full text-left px-3 py-2 text-sm border-b border-gray-100 hover:bg-gray-100"
        :class="viewingStepId === step.id ? 'bg-blue-50' : ''"
        @click="emit('select-step', step.id)"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="truncate">{{ step.title }}</span>
          <span
            class="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
            :class="statusClass[step.status]"
          >
            {{ statusLabel[step.status] }}
          </span>
        </div>
      </button>
      <p v-if="!steps.length" class="p-3 text-xs text-gray-400">Select a workflow</p>
    </div>
  </aside>
</template>
