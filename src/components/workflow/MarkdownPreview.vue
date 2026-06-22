<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import mermaid from "mermaid";
import { renderMarkdownWithMermaid } from "../../utils/mermaidMarkdown";

const props = defineProps<{ content: string }>();

const root = ref<HTMLElement | null>(null);
const html = computed(() => renderMarkdownWithMermaid(props.content));

let mermaidReady = false;

function ensureMermaid() {
  if (mermaidReady) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "strict",
  });
  mermaidReady = true;
}

async function renderDiagrams() {
  ensureMermaid();
  await nextTick();
  if (!root.value) return;
  const nodes = root.value.querySelectorAll<HTMLElement>(".mermaid");
  if (nodes.length === 0) return;
  try {
    await mermaid.run({ nodes: Array.from(nodes), suppressErrors: true });
  } catch {
    // suppressErrors handles per-diagram failures
  }
}

onMounted(() => {
  void renderDiagrams();
});

watch(
  () => props.content,
  () => {
    void renderDiagrams();
  },
);
</script>

<template>
  <div
    ref="root"
    class="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 markdown-preview"
    data-testid="markdown-preview"
    v-html="html"
  />
</template>
