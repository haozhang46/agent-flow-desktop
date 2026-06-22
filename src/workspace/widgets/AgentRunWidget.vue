<script setup lang="ts">
import WorkflowAgentRunPanel from "../../components/workflow/WorkflowAgentRunPanel.vue";
import type { StepStatus } from "../../composables/useWorkflow";
import type { PanelApi } from "../registryComponents";

defineProps<{
  api: PanelApi;
  stepId: string;
  stepTitle: string;
  status: StepStatus;
  reportPath: string | null;
  running: boolean;
  liveOutput: string;
}>();
</script>

<template>
  <WorkflowAgentRunPanel
    :api="api"
    :step-id="stepId"
    :step-title="stepTitle"
    :status="status"
    :report-path="reportPath"
    :running="running"
    :live-output="liveOutput"
  />
</template>
