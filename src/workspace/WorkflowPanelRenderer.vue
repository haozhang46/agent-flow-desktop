<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { WorkspaceComponent, WorkspaceDefinition } from "./registry";
import type { PanelApi } from "./registryComponents";
import type { PanelRuntimeContext } from "./widgetBindProps";
import JsonWidgetHost from "./jsonWidget/JsonWidgetHost.vue";

export type { PanelRuntimeContext };

const props = defineProps<{
  workspace: WorkspaceDefinition;
  api: PanelApi;
  runtime?: PanelRuntimeContext;
  chatInvoke?: (message: string) => void | Promise<void>;
}>();

const activeTabId = ref("");

const components = computed(() => props.workspace.components);

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
            <JsonWidgetHost
              :type="comp.type"
              :component-id="comp.id"
              :label="comp.label"
              :props="comp.props"
              :api="api"
              :runtime="runtime"
              :workspace-step-id="workspace.stepId"
              :chat-invoke="chatInvoke"
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
            <JsonWidgetHost
              :type="comp.type"
              :component-id="comp.id"
              :label="comp.label"
              :props="comp.props"
              :api="api"
              :runtime="runtime"
              :workspace-step-id="workspace.stepId"
              :chat-invoke="chatInvoke"
            />
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
