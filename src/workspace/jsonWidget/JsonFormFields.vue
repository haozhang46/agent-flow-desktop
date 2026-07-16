<script setup lang="ts">
import type { PropField } from "../registry";

const props = defineProps<{
  fields: PropField[];
  values: Record<string, unknown>;
}>();

const emit = defineEmits<{
  change: [values: Record<string, unknown>];
}>();

function setValue(key: string, value: unknown) {
  emit("change", { ...props.values, [key]: value });
}

function stringValue(key: string): string {
  const val = props.values[key];
  return val == null ? "" : String(val);
}

function boolValue(key: string): boolean {
  return Boolean(props.values[key]);
}

function jsonDisplay(key: string): string {
  const val = props.values[key];
  if (val === undefined) return "";
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

function onJsonInput(key: string, raw: string) {
  try {
    setValue(key, JSON.parse(raw));
  } catch {
    setValue(key, raw);
  }
}
</script>

<template>
  <div class="flex flex-col gap-3 p-3" data-testid="json-form-fields">
    <label
      v-for="field in fields"
      :key="field.key"
      class="flex flex-col gap-1 text-sm"
    >
      <span class="text-xs font-medium text-gray-700">{{ field.label }}</span>

      <input
        v-if="field.type === 'string'"
        type="text"
        class="rounded border border-gray-300 px-2 py-1 text-sm"
        :data-testid="`json-form-field-${field.key}`"
        :value="stringValue(field.key)"
        @input="setValue(field.key, ($event.target as HTMLInputElement).value)"
      />

      <input
        v-else-if="field.type === 'boolean'"
        type="checkbox"
        class="h-4 w-4"
        :data-testid="`json-form-field-${field.key}`"
        :checked="boolValue(field.key)"
        @change="setValue(field.key, ($event.target as HTMLInputElement).checked)"
      />

      <select
        v-else-if="field.type === 'select'"
        class="rounded border border-gray-300 px-2 py-1 text-sm"
        :data-testid="`json-form-field-${field.key}`"
        :value="stringValue(field.key)"
        @change="setValue(field.key, ($event.target as HTMLSelectElement).value)"
      >
        <option
          v-for="opt in field.options ?? []"
          :key="opt"
          :value="opt"
        >
          {{ opt }}
        </option>
      </select>

      <textarea
        v-else
        class="rounded border border-gray-300 px-2 py-1 font-mono text-xs"
        rows="3"
        :data-testid="`json-form-field-${field.key}`"
        :value="jsonDisplay(field.key)"
        @input="onJsonInput(field.key, ($event.target as HTMLTextAreaElement).value)"
      />
    </label>
  </div>
</template>
