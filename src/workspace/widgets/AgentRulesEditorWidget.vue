<script setup lang="ts">
import MarkdownFilePanel from "../../components/workflow/MarkdownFilePanel.vue";
import type { PanelApi } from "../registryComponents";

const DEFAULT_FILES = [
  { path: "AGENTS.md", label: "AGENTS.md" },
  { path: "CLAUDE.md", label: "CLAUDE.md" },
];

defineProps<{
  api: PanelApi;
  componentId?: string;
  files?: { path: string; label: string }[];
  editable?: boolean;
}>();
</script>

<template>
  <MarkdownFilePanel
    :api="api"
    :component-id="componentId"
    mode="file-list"
    :files="files"
    :default-files="DEFAULT_FILES"
    :editable="editable"
    sidebar-title="Agent Rules"
  />
</template>
