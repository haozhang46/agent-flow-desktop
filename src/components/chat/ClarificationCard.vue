<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ClarificationOption } from "@agent-flow/shared-ui";

const props = defineProps<{
  question: string;
  options: ClarificationOption[];
  allowMultiple: boolean;
  allowFreeText: boolean;
  status: "pending" | "submitting" | "answered" | "cancelled";
  error?: string | null;
}>();

const emit = defineEmits<{
  submit: [payload: { selected_option_ids: string[]; free_text?: string }];
}>();

const selectedIds = ref<string[]>([]);
const freeText = ref("");

const interactive = computed(
  () => props.status === "pending" || props.status === "submitting",
);
const disabled = computed(() => props.status !== "pending");

watch(
  () => props.status,
  (status) => {
    if (status === "pending") {
      selectedIds.value = [];
      freeText.value = "";
    }
  },
);

function toggleOption(id: string) {
  if (disabled.value) return;
  if (props.allowMultiple) {
    if (selectedIds.value.includes(id)) {
      selectedIds.value = selectedIds.value.filter((x) => x !== id);
    } else {
      selectedIds.value = [...selectedIds.value, id];
    }
    return;
  }
  selectedIds.value = [id];
}

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id);
}

function onSubmit() {
  if (disabled.value || selectedIds.value.length === 0) return;
  const payload: { selected_option_ids: string[]; free_text?: string } = {
    selected_option_ids: [...selectedIds.value],
  };
  const trimmed = freeText.value.trim();
  if (props.allowFreeText && trimmed) {
    payload.free_text = trimmed;
  }
  emit("submit", payload);
}
</script>

<template>
  <div
    class="my-3 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3"
    data-testid="clarification-card"
  >
    <p class="text-xs font-medium text-blue-800 uppercase tracking-wide">
      {{ status === "answered" ? "Answered" : status === "submitting" ? "Submitting…" : "Clarification needed" }}
    </p>
    <p class="text-sm text-gray-800">{{ question }}</p>

    <div class="space-y-2">
      <label
        v-for="opt in options"
        :key="opt.id"
        class="flex items-start gap-2 text-sm text-gray-800 cursor-pointer"
        :class="{ 'opacity-60 cursor-default': disabled }"
      >
        <input
          :data-testid="`clarification-option-${opt.id}`"
          :type="allowMultiple ? 'checkbox' : 'radio'"
          :name="allowMultiple ? undefined : 'clarification-option'"
          :value="opt.id"
          :checked="isSelected(opt.id)"
          :disabled="disabled"
          class="mt-0.5"
          @change="toggleOption(opt.id)"
        />
        <span>{{ opt.label }}</span>
      </label>
    </div>

    <textarea
      v-if="allowFreeText && interactive"
      data-testid="clarification-free-text"
      v-model="freeText"
      :disabled="disabled"
      rows="2"
      placeholder="Optional details…"
      class="w-full text-xs rounded-lg border border-gray-300 px-2 py-1.5 bg-white disabled:opacity-60"
    />

    <p v-if="error" class="text-xs text-red-600">{{ error }}</p>

    <div v-if="interactive" class="flex flex-wrap gap-2">
      <button
        type="button"
        data-testid="clarification-submit"
        class="btn-primary text-xs py-1 px-3"
        :disabled="disabled || selectedIds.length === 0"
        @click="onSubmit"
      >
        {{ status === "submitting" ? "Submitting…" : "Submit" }}
      </button>
    </div>
  </div>
</template>
