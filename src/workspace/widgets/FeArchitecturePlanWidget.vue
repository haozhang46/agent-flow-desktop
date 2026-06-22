<script setup lang="ts">
import ArchitecturePlanPanel from "../../components/workflow/ArchitecturePlanPanel.vue";
import type { PanelApi } from "../registryComponents";

defineProps<{
  api: PanelApi;
  output: string;
  layers: string[];
  componentId?: string;
}>();
</script>

<template>
  <ArchitecturePlanPanel
    :api="api"
    :output="output"
    :layers="layers"
    :component-id="componentId"
    widget-type="fe-architecture-plan"
    title="Frontend Architecture Plan"
    editor-test-id="fe-arch-editor"
  />
</template>
