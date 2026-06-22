<script setup lang="ts">
import { computed } from "vue";
import {
  COLOR_SHADES,
  listColorPalettes,
} from "../theme/mergeTheme";
import type { ColorScale } from "../theme/types";

const props = defineProps<{
  colors: ColorScale;
  defaultColors: ColorScale;
  selectedPalette: string;
}>();

const emit = defineEmits<{
  "update:colors": [colors: ColorScale];
  "update:selectedPalette": [name: string];
}>();

const palettes = computed(() =>
  listColorPalettes({ colors: props.colors, spacing: {} }),
);

const shadeKeys = computed(() => {
  const def = props.defaultColors[props.selectedPalette];
  if (typeof def === "object" && def !== null && "50" in def) {
    return [...COLOR_SHADES];
  }
  const keys = new Set<string>();
  if (typeof def === "object" && def) {
    for (const k of Object.keys(def)) keys.add(k);
  }
  const cur = props.colors[props.selectedPalette];
  if (typeof cur === "object" && cur) {
    for (const k of Object.keys(cur)) keys.add(k);
  }
  return [...keys].sort();
});

function paletteValue(shade: string): string {
  const cur = props.colors[props.selectedPalette];
  if (typeof cur === "object" && cur?.[shade]) {
    return cur[shade];
  }
  const def = props.defaultColors[props.selectedPalette];
  if (typeof def === "object" && def?.[shade]) {
    return def[shade];
  }
  return "#000000";
}

function updateShade(shade: string, hex: string) {
  const name = props.selectedPalette;
  const current = props.colors[name];
  const base =
    typeof current === "object" && current !== null
      ? { ...current }
      : typeof props.defaultColors[name] === "object"
        ? { ...(props.defaultColors[name] as Record<string, string>) }
        : {};
  base[shade] = hex;
  emit("update:colors", { ...props.colors, [name]: base });
}

function resetPalette() {
  const name = props.selectedPalette;
  const def = props.defaultColors[name];
  const next = { ...props.colors };
  if (def === undefined) {
    delete next[name];
  } else if (typeof def === "string") {
    next[name] = def;
  } else {
    next[name] = { ...def };
  }
  emit("update:colors", next);
}
</script>

<template>
  <div class="flex flex-1 min-h-0 gap-3">
    <nav class="w-28 shrink-0 overflow-y-auto border border-gray-200 rounded">
      <button
        v-for="name in palettes"
        :key="name"
        type="button"
        class="block w-full text-left text-xs px-2 py-1.5 border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
        :class="name === selectedPalette ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'"
        :data-testid="`palette-${name}`"
        @click="emit('update:selectedPalette', name)"
      >
        {{ name }}
      </button>
    </nav>

    <div class="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto">
      <div class="flex items-center justify-end">
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
          data-testid="reset-palette"
          @click="resetPalette"
        >
          Reset palette
        </button>
      </div>

      <div
        v-for="shade in shadeKeys"
        :key="shade"
        class="flex items-center gap-2"
        :data-testid="`shade-${shade}`"
      >
        <span class="text-xs text-gray-500 w-8 font-mono">{{ shade }}</span>
        <input
          type="color"
          class="w-8 h-7 rounded border border-gray-300 cursor-pointer shrink-0"
          :value="paletteValue(shade)"
          @input="updateShade(shade, ($event.target as HTMLInputElement).value)"
        />
        <input
          type="text"
          class="flex-1 text-xs px-2 py-1 border border-gray-300 rounded font-mono"
          :value="paletteValue(shade)"
          @change="updateShade(shade, ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>
  </div>
</template>
