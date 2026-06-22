<script setup lang="ts">
import MarkdownFilePanel from "../../components/workflow/MarkdownFilePanel.vue";
import type { PanelApi } from "../registryComponents";

type FileEntry = { path: string; label: string };

defineProps<{
  api: PanelApi;
  docsDir?: string;
  mode?: "directory" | "file-list";
  files?: FileEntry[];
  editable?: boolean;
}>();
</script>

<template>
  <MarkdownFilePanel
    :api="api"
    :mode="mode ?? 'directory'"
    :docs-dir="docsDir"
    :files="files"
    :editable="editable !== false"
    sidebar-title="Documents"
    :allow-delete="mode !== 'file-list'"
  />
</template>
