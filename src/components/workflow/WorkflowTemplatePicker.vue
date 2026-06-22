<script setup lang="ts">
import type { TemplateSummary } from "../../composables/useWorkflow";

defineProps<{
  show: boolean;
  templates: TemplateSummary[];
  loading: boolean;
}>();

const emit = defineEmits<{
  close: [];
  select: [templateId: string];
}>();
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
    @click.self="emit('close')"
  >
    <div class="bg-white rounded-lg shadow-lg w-80 max-h-[70vh] flex flex-col">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 class="text-sm font-semibold text-gray-800">Add workflow from template</h2>
        <button type="button" class="text-gray-500 hover:text-gray-800" @click="emit('close')">
          ×
        </button>
      </div>

      <div v-if="loading" class="p-4 text-xs text-gray-500">Loading templates…</div>

      <div v-else class="flex-1 overflow-y-auto">
        <button
          v-for="tpl in templates"
          :key="`${tpl.source}-${tpl.id}`"
          type="button"
          class="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
          @click="emit('select', tpl.id)"
        >
          <div class="text-sm font-medium text-gray-800">{{ tpl.title }}</div>
          <div class="text-[10px] text-gray-400 mt-0.5">{{ tpl.id }} · {{ tpl.source }}</div>
        </button>
        <p v-if="!templates.length" class="p-4 text-xs text-gray-400">No templates available.</p>
      </div>
    </div>
  </div>
</template>
