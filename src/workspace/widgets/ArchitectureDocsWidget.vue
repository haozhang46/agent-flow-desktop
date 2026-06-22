<script setup lang="ts">
import WorkflowArchitecturePanel from "../../components/workflow/WorkflowArchitecturePanel.vue";
import type { PanelApi } from "../registryComponents";

defineProps<{
  api: PanelApi;
  files?: { path: string; label: string }[];
}>();
</script>

<template>
  <WorkflowArchitecturePanel :api="api" :files="files" />
</template>
