<script setup lang="ts">
import { computed, markRaw, ref, shallowRef, watch, type Component } from "vue";
import type { PropField, WorkspaceComponent, WorkspaceDefinition } from "./registry";
import {
  isRegisteredWidgetType,
  WIDGET_COMPONENTS,
  type PanelApi,
} from "./registryComponents";
import { bindWidgetProps, type PanelRuntimeContext } from "./widgetBindProps";
import { useWorkspaceConfig } from "../composables/useWorkspaceConfig";
import DeclarativePanelWidget from "./widgets/DeclarativePanelWidget.vue";

export type { PanelRuntimeContext };

const props = defineProps<{
  workspace: WorkspaceDefinition;
  api: PanelApi;
  runtime?: PanelRuntimeContext;
  workflowId?: string | null;
}>();

const activeTabId = ref("");
const resolvedByType = shallowRef<Record<string, Component>>({});
const registryByType = ref<Record<string, { propsFields: PropField[] }>>({});
const { fetchRegistry } = useWorkspaceConfig();

const components = computed(() => props.workspace.components);

watch(
  () => [props.workflowId, props.workspace.components.map((c) => c.type).join(",")] as const,
  async () => {
    const types = props.workspace.components.map((c) => c.type);
    const needsDeclarative = types.some((t) => !isRegisteredWidgetType(t));

    const builtinMap: Record<string, Component> = {};
    for (const comp of props.workspace.components) {
      if (builtinMap[comp.type] || !isRegisteredWidgetType(comp.type)) continue;
      const loader = WIDGET_COMPONENTS[comp.type];
      const mod = await loader();
      builtinMap[comp.type] = markRaw(mod.default);
    }
    resolvedByType.value = builtinMap;

    if (!needsDeclarative) return;

    try {
      const res = await fetchRegistry(props.workflowId);
      const map: Record<string, { propsFields: PropField[] }> = {};
      for (const entry of res.components) {
        map[entry.type] = { propsFields: entry.propsFields };
      }
      registryByType.value = map;
    } catch {
      registryByType.value = {};
    }
  },
  { immediate: true },
);

watch(
  () => props.workspace.components,
  (list) => {
    if (!list.length) {
      activeTabId.value = "";
      return;
    }
    if (!list.some((c) => c.id === activeTabId.value)) {
      activeTabId.value = list[0].id;
    }
  },
  { immediate: true, deep: true },
);

function tabLabel(comp: WorkspaceComponent): string {
  return comp.label ?? comp.id;
}

function bindProps(comp: WorkspaceComponent): Record<string, unknown> {
  return bindWidgetProps(comp, props.api, props.runtime, props.workspace.stepId);
}

function isBuiltinType(type: string): boolean {
  return isRegisteredWidgetType(type);
}

function declarativeProps(comp: WorkspaceComponent): Record<string, unknown> {
  const entry = registryByType.value[comp.type];
  if (!entry) {
    return {
      propsFields: [],
      modelProps: comp.props,
      missingType: comp.type,
    };
  }
  return {
    propsFields: entry.propsFields,
    modelProps: comp.props,
  };
}
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0 overflow-hidden">
    <template v-if="workspace.layout === 'tabs'">
      <div
        v-if="components.length"
        class="flex gap-1 border-b border-gray-200 bg-gray-50 px-3 py-2 shrink-0"
        role="tablist"
      >
        <button
          v-for="comp in components"
          :key="comp.id"
          type="button"
          role="tab"
          class="text-xs px-3 py-1.5 rounded-t border border-b-0 transition-colors"
          :class="
            activeTabId === comp.id
              ? 'bg-white border-gray-200 text-blue-700 font-medium'
              : 'border-transparent text-gray-600 hover:bg-white/70'
          "
          :aria-selected="activeTabId === comp.id"
          @click="activeTabId = comp.id"
        >
          {{ tabLabel(comp) }}
        </button>
      </div>

      <div class="flex flex-col flex-1 min-h-0 overflow-hidden">
        <template v-for="comp in components" :key="comp.id">
          <div
            v-if="activeTabId === comp.id"
            class="flex flex-col flex-1 min-h-0 overflow-hidden"
            role="tabpanel"
          >
            <component
              :is="resolvedByType[comp.type]"
              v-if="isBuiltinType(comp.type) && resolvedByType[comp.type]"
              v-bind="bindProps(comp)"
            />
            <DeclarativePanelWidget
              v-else-if="!isBuiltinType(comp.type)"
              v-bind="declarativeProps(comp)"
            />
          </div>
        </template>
      </div>
    </template>

    <template v-else>
      <div class="flex flex-col flex-1 min-h-0 overflow-auto divide-y divide-gray-200">
        <section
          v-for="comp in components"
          :key="comp.id"
          class="flex flex-col flex-1 min-h-0"
          data-testid="stack-section"
        >
          <header
            v-if="comp.label"
            class="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-50 border-b border-gray-100"
          >
            {{ comp.label }}
          </header>
          <div class="flex flex-col flex-1 min-h-0">
            <component
              :is="resolvedByType[comp.type]"
              v-if="isBuiltinType(comp.type) && resolvedByType[comp.type]"
              v-bind="bindProps(comp)"
            />
            <DeclarativePanelWidget
              v-else-if="!isBuiltinType(comp.type)"
              v-bind="declarativeProps(comp)"
            />
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
