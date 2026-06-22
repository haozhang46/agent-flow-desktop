<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    panelPercent: number;
    storageKey?: string;
    minPercent?: number;
    maxPercent?: number;
  }>(),
  {
    minPercent: 20,
    maxPercent: 70,
  },
);

const emit = defineEmits<{
  "update:panelPercent": [value: number];
}>();

const containerRef = ref<HTMLElement | null>(null);
const isResizing = ref(false);

const mainPanelWidth = computed(() => `calc(${100 - props.panelPercent}% - 4px)`);
const chatPanelWidth = computed(() => `${props.panelPercent}%`);

function clampPercent(value: number): number {
  return Math.min(props.maxPercent, Math.max(props.minPercent, value));
}

function onResizeMove(e: MouseEvent) {
  const el = containerRef.value;
  if (!el || !isResizing.value) return;
  const rect = el.getBoundingClientRect();
  const pct = ((rect.right - e.clientX) / rect.width) * 100;
  emit("update:panelPercent", clampPercent(pct));
}

function stopResize() {
  if (!isResizing.value) return;
  isResizing.value = false;
  document.removeEventListener("mousemove", onResizeMove);
  document.removeEventListener("mouseup", stopResize);
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  if (props.storageKey) {
    localStorage.setItem(props.storageKey, String(props.panelPercent));
  }
}

function startResize() {
  isResizing.value = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  document.addEventListener("mousemove", onResizeMove);
  document.addEventListener("mouseup", stopResize);
}

function loadStoredPercent() {
  if (!props.storageKey) return;
  const stored = localStorage.getItem(props.storageKey);
  if (!stored) return;
  const value = Number(stored);
  if (Number.isFinite(value)) {
    emit("update:panelPercent", clampPercent(value));
  }
}

loadStoredPercent();

onUnmounted(stopResize);
</script>

<template>
  <div ref="containerRef" class="flex flex-1 min-w-0 min-h-0">
    <div
      class="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden border-r border-gray-200"
      :style="{ width: mainPanelWidth }"
    >
      <slot name="main" />
    </div>

    <div
      class="w-1 shrink-0 cursor-col-resize bg-gray-200 hover:bg-blue-400 active:bg-blue-500 transition-colors"
      title="Drag to resize chat panel"
      @mousedown.prevent="startResize"
    />

    <aside
      class="flex flex-row min-w-0 min-h-0 bg-white shrink-0"
      :style="{ width: chatPanelWidth }"
    >
      <slot name="panel" />
    </aside>
  </div>
</template>
