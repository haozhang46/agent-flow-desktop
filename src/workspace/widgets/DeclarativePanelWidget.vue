<script setup lang="ts">
import type { PropField } from "../registry";

defineProps<{
  propsFields?: PropField[];
  modelProps?: Record<string, unknown>;
  missingType?: string;
}>();

function displayValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0 overflow-auto p-4" data-testid="declarative-panel">
    <div
      v-if="missingType"
      class="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
      data-testid="missing-type-placeholder"
    >
      Missing widget type: {{ missingType }}
    </div>
    <ul v-else class="space-y-3">
      <li
        v-for="field in propsFields ?? []"
        :key="field.key"
        class="text-sm"
        :data-testid="`field-${field.key}`"
      >
        <div class="text-xs font-medium text-gray-500">{{ field.label }}</div>
        <div class="mt-0.5 text-gray-800 break-words">
          {{ displayValue(modelProps?.[field.key]) }}
        </div>
      </li>
    </ul>
  </div>
</template>
