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
    widget-type="be-architecture-plan"
    title="Backend Architecture Plan"
    editor-test-id="be-arch-editor"
  />
</template>
