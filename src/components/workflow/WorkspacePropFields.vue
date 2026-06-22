<script setup lang="ts">
import type { PropField } from "../../workspace/registry";

export type FileListItem = { path: string; label: string };

const props = defineProps<{
  fields: PropField[];
  values: Record<string, unknown>;
  skills?: string[];
}>();

const emit = defineEmits<{
  "update:prop": [payload: { key: string; value: unknown }];
}>();

function emitProp(key: string, value: unknown) {
  emit("update:prop", { key, value });
}

function fieldValue(field: PropField): unknown {
  const val = props.values[field.key];
  if (val !== undefined) return val;
  if (field.type === "boolean") return false;
  if (
    field.type === "string[]" ||
    field.type === "file-list" ||
    field.type === "skills"
  ) {
    return [];
  }
  return "";
}

function propStringArrayValue(key: string): string {
  const val = props.values[key];
  return Array.isArray(val) ? val.map(String).join("\n") : "";
}

function onStringArrayInput(key: string, raw: string) {
  const items = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  emitProp(key, items);
}

function fileListValue(key: string): FileListItem[] {
  const val = props.values[key];
  if (!Array.isArray(val)) return [];
  return val.map((item) => {
    if (typeof item === "object" && item !== null) {
      const row = item as Record<string, unknown>;
      return {
        path: String(row.path ?? ""),
        label: String(row.label ?? ""),
      };
    }
    return { path: String(item), label: String(item) };
  });
}

function updateFileListRow(
  key: string,
  index: number,
  field: "path" | "label",
  value: string,
) {
  const rows = fileListValue(key).map((row) => ({ ...row }));
  rows[index] = { ...rows[index], [field]: value };
  emitProp(key, rows);
}

function removeFileListRow(key: string, index: number) {
  const rows = fileListValue(key).filter((_, i) => i !== index);
  emitProp(key, rows);
}

function addFileListRow(key: string) {
  const rows = [...fileListValue(key), { path: "", label: "" }];
  emitProp(key, rows);
}

function toggleSkillProp(key: string, skill: string) {
  const current = props.values[key];
  const list = Array.isArray(current) ? [...current.map(String)] : [];
  const idx = list.indexOf(skill);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(skill);
  }
  emitProp(key, list);
}

function skillSelected(key: string, skill: string): boolean {
  const current = props.values[key];
  return Array.isArray(current) && current.map(String).includes(skill);
}
</script>

<template>
  <div
    v-for="field in fields"
    :key="field.key"
    class="text-xs"
    :data-testid="`prop-field-${field.key}`"
  >
    <span class="text-gray-500">
      {{ field.label }}
      <span v-if="field.required" class="text-red-500">*</span>
    </span>

    <input
      v-if="field.type === 'string' || field.type === 'langflow-flow'"
      :value="String(fieldValue(field) ?? '')"
      type="text"
      class="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-xs"
      @input="emitProp(field.key, ($event.target as HTMLInputElement).value)"
    />

    <label v-else-if="field.type === 'boolean'" class="mt-1 flex items-center gap-2">
      <input
        :checked="Boolean(fieldValue(field))"
        type="checkbox"
        @change="emitProp(field.key, ($event.target as HTMLInputElement).checked)"
      />
      <span class="text-gray-600">Enabled</span>
    </label>

    <select
      v-else-if="field.type === 'select'"
      :value="String(fieldValue(field) ?? '')"
      class="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-xs"
      @change="emitProp(field.key, ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="opt in field.options ?? []" :key="opt" :value="opt">{{ opt }}</option>
    </select>

    <textarea
      v-else-if="field.type === 'string[]'"
      :value="propStringArrayValue(field.key)"
      rows="3"
      class="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono"
      placeholder="One item per line"
      @input="onStringArrayInput(field.key, ($event.target as HTMLTextAreaElement).value)"
    />

    <div v-else-if="field.type === 'file-list'" class="mt-1 space-y-2">
      <div
        v-for="(row, index) in fileListValue(field.key)"
        :key="index"
        class="space-y-1 border border-gray-200 rounded p-2"
        :data-testid="`file-list-row-${index}`"
      >
        <input
          :value="row.path"
          type="text"
          placeholder="Path"
          class="w-full border border-gray-300 rounded px-2 py-1 text-xs"
          @input="
            updateFileListRow(field.key, index, 'path', ($event.target as HTMLInputElement).value)
          "
        />
        <input
          :value="row.label"
          type="text"
          placeholder="Label"
          class="w-full border border-gray-300 rounded px-2 py-1 text-xs"
          @input="
            updateFileListRow(field.key, index, 'label', ($event.target as HTMLInputElement).value)
          "
        />
        <button
          type="button"
          class="text-[10px] px-1.5 py-0.5 border rounded text-red-600"
          :data-testid="`file-list-remove-${index}`"
          @click="removeFileListRow(field.key, index)"
        >
          Remove
        </button>
      </div>
      <button
        type="button"
        class="text-[10px] px-1.5 py-0.5 border rounded text-gray-600"
        data-testid="file-list-add"
        @click="addFileListRow(field.key)"
      >
        Add file
      </button>
    </div>

    <div v-else-if="field.type === 'skills'" class="mt-1 flex flex-wrap gap-1">
      <button
        v-for="skill in skills ?? []"
        :key="skill"
        type="button"
        class="text-[10px] px-1.5 py-0.5 rounded-full border"
        :class="
          skillSelected(field.key, skill)
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-300'
        "
        @click="toggleSkillProp(field.key, skill)"
      >
        {{ skill }}
      </button>
      <input
        v-if="!(skills?.length)"
        :value="String(fieldValue(field) ?? '')"
        type="text"
        class="w-full border border-gray-300 rounded px-2 py-1 text-xs"
        placeholder="Comma-separated skills"
        @input="
          emitProp(
            field.key,
            ($event.target as HTMLInputElement).value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        "
      />
    </div>
  </div>
</template>
