<script setup lang="ts">
const model = defineModel<string>({ default: "" });
</script>

<template>
  <label class="block space-y-1" data-testid="ua-goal-field">
    <span class="text-xs font-medium text-gray-600">Goal (optional)</span>
    <textarea
      v-model="model"
      rows="2"
      class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-y min-h-[3rem] focus:outline-none focus:ring-1 focus:ring-blue-400"
      placeholder="Describe the workflow you want, or leave blank for a greenfield default."
      data-testid="ua-goal-input"
    />
  </label>
</template>
