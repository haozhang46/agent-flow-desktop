<script setup lang="ts">
import WorkflowCodeExplorer from "../../components/workflow/WorkflowCodeExplorer.vue";
import type { PanelApi } from "../registryComponents";

defineProps<{
  api: PanelApi;
  root: string;
  writable?: boolean;
}>();
</script>

<template>
  <WorkflowCodeExplorer :api="api" :root="root" />
</template>
