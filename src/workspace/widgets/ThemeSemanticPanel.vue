<script setup lang="ts">
import {
  SEMANTIC_PALETTE,
  SEMANTIC_TOKEN_DEFS,
} from "../theme/mergeTheme";
import type { ColorPalette, ColorScale } from "../theme/types";

const props = defineProps<{
  colors: ColorScale;
  defaultColors: ColorScale;
}>();

const emit = defineEmits<{
  "update:colors": [colors: ColorScale];
}>();

function tokenValue(key: string): string {
  const current = props.colors[SEMANTIC_PALETTE];
  if (typeof current === "object" && current?.[key]) {
    return current[key];
  }
  const def = props.defaultColors[SEMANTIC_PALETTE];
  if (typeof def === "object" && def?.[key]) {
    return def[key];
  }
  return "#000000";
}

function updateToken(key: string, hex: string) {
  const current = props.colors[SEMANTIC_PALETTE];
  const def = props.defaultColors[SEMANTIC_PALETTE];
  const base =
    typeof current === "object" && current !== null
      ? { ...current }
      : typeof def === "object" && def !== null
        ? { ...def }
        : {};
  base[key] = hex;
  emit("update:colors", { ...props.colors, [SEMANTIC_PALETTE]: base });
}

function resetSemantic() {
  const def = props.defaultColors[SEMANTIC_PALETTE];
  const next = { ...props.colors };
  if (typeof def === "object" && def !== null) {
    next[SEMANTIC_PALETTE] = { ...def };
  } else {
    delete next[SEMANTIC_PALETTE];
  }
  emit("update:colors", next);
}
</script>

<template>
  <div class="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto">
    <div class="flex items-center justify-between shrink-0">
      <p class="text-xs text-gray-500">
        语义主题色 → UnoCSS <code class="font-mono text-[10px]">bg-brand-*</code>
      </p>
      <button
        type="button"
        class="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
        data-testid="reset-semantic"
        @click="resetSemantic"
      >
        重置主题色
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-2">
      <label
        v-for="token in SEMANTIC_TOKEN_DEFS"
        :key="token.key"
        class="flex items-center gap-2"
        :data-testid="`semantic-${token.key}`"
      >
        <span class="text-xs text-gray-700 w-24 shrink-0">{{ token.label }}</span>
        <input
          type="color"
          class="w-8 h-7 rounded border border-gray-300 cursor-pointer shrink-0"
          :value="tokenValue(token.key)"
          @input="updateToken(token.key, ($event.target as HTMLInputElement).value)"
        />
        <input
          type="text"
          class="flex-1 min-w-0 text-xs px-2 py-1 border border-gray-300 rounded font-mono"
          :value="tokenValue(token.key)"
          @change="updateToken(token.key, ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
  </div>
</template>
