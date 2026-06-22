<script setup lang="ts">
defineProps<{
  planContent: string;
}>();

const emit = defineEmits<{
  approve: [];
  edit: [];
  cancel: [];
}>();
</script>

<template>
  <div class="my-3 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
    <p class="text-xs font-medium text-blue-800 uppercase tracking-wide">Plan ready for review</p>
    <pre class="text-xs whitespace-pre-wrap text-gray-800 max-h-48 overflow-y-auto">{{ planContent }}</pre>
    <div class="flex flex-wrap gap-2">
      <button type="button" class="btn-primary text-xs py-1 px-3" @click="emit('approve')">
        Approve &amp; Run in Agent
      </button>
      <button
        type="button"
        class="text-xs px-3 py-1 rounded-lg border border-gray-300 hover:bg-white"
        @click="emit('edit')"
      >
        Edit
      </button>
      <button
        type="button"
        class="text-xs px-3 py-1 rounded-lg border border-gray-300 hover:bg-white"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </div>
</template>
