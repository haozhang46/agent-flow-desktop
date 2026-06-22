<script setup lang="ts">
import { computed } from "vue";
import { sortSpacingKeys } from "../theme/mergeTheme";
import type { SpacingScale } from "../theme/types";

const props = defineProps<{
  spacing: SpacingScale;
  defaultSpacing: SpacingScale;
}>();

const emit = defineEmits<{
  "update:spacing": [spacing: SpacingScale];
}>();

const keys = computed(() => sortSpacingKeys(Object.keys(props.spacing)));

function updateKey(key: string, value: string) {
  emit("update:spacing", { ...props.spacing, [key]: value });
}

function resetKey(key: string) {
  const def = props.defaultSpacing[key];
  if (def !== undefined) {
    emit("update:spacing", { ...props.spacing, [key]: def });
  }
}
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto border border-gray-200 rounded">
    <table class="w-full text-xs">
      <thead class="bg-gray-50 sticky top-0">
        <tr>
          <th class="text-left px-3 py-2 font-medium text-gray-500 border-b border-gray-200 w-24">
            Key
          </th>
          <th class="text-left px-3 py-2 font-medium text-gray-500 border-b border-gray-200">
            Value
          </th>
          <th class="text-right px-3 py-2 font-medium text-gray-500 border-b border-gray-200 w-20">
            Reset
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="key in keys"
          :key="key"
          class="border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
          :data-testid="`spacing-row-${key}`"
        >
          <td class="px-3 py-1.5 font-mono text-gray-700">{{ key }}</td>
          <td class="px-3 py-1.5">
            <input
              type="text"
              class="w-full text-xs px-2 py-1 border border-gray-300 rounded font-mono"
              :value="spacing[key]"
              @change="updateKey(key, ($event.target as HTMLInputElement).value)"
            />
          </td>
          <td class="px-3 py-1.5 text-right">
            <button
              type="button"
              class="text-xs text-gray-500 hover:text-gray-800"
              @click="resetKey(key)"
            >
              Reset
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
