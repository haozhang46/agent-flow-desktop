<script setup lang="ts">
import WorkflowCicdPanel from "../../components/workflow/WorkflowCicdPanel.vue";
import type { PanelApi } from "../registryComponents";

defineProps<{
  api: PanelApi;
}>();
</script>

<template>
  <WorkflowCicdPanel :api="api" />
</template>
