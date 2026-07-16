<script setup lang="ts">
import { computed, shallowRef, watch, type Component } from "vue";
import {
  buildRenderPlan,
  executeAction,
  getBuiltinTypeDocument,
  type PanelAction,
  type PanelTypeDocument,
  type RenderPlan,
} from "../../../shared/jsonWidget";
import type { WorkspaceComponent } from "../registry";
import type { PanelApi } from "../registryComponents";
import { bindWidgetProps, type PanelRuntimeContext } from "../widgetBindProps";
import JsonFormFields from "./JsonFormFields.vue";
import { VIEW_LOADERS } from "./viewRegistry";

const props = defineProps<{
  type: string;
  componentId: string;
  label?: string;
  props: Record<string, unknown>;
  api: PanelApi;
  runtime?: PanelRuntimeContext;
  workspaceStepId?: string;
  typeDocument?: PanelTypeDocument;
  chatInvoke?: (message: string) => void | Promise<void>;
  onPropsUpdate?: (props: Record<string, unknown>) => void;
}>();

const document = computed(
  () => props.typeDocument ?? getBuiltinTypeDocument(props.type),
);

const plan = computed<RenderPlan | null>(() => {
  if (!document.value) return null;
  return buildRenderPlan(document.value, props.props);
});

const viewComponent = shallowRef<Component | null>(null);
const unknownViewName = shallowRef<string | null>(null);
let viewLoadGeneration = 0;

watch(
  () => {
    const p = plan.value;
    if (!p || p.kind !== "view") return null;
    return p.viewName;
  },
  async (viewName) => {
    const generation = ++viewLoadGeneration;
    viewComponent.value = null;
    unknownViewName.value = null;
    if (!viewName) return;
    const loader = VIEW_LOADERS[viewName];
    if (!loader) {
      unknownViewName.value = viewName;
      return;
    }
    const mod = await loader();
    if (generation !== viewLoadGeneration) return;
    viewComponent.value = mod.default;
  },
  { immediate: true },
);

const boundViewProps = computed(() => {
  const p = plan.value;
  if (!p || p.kind !== "view") return {};
  const comp: WorkspaceComponent = {
    id: props.componentId,
    type: props.type,
    label: props.label,
    props: p.viewProps,
  };
  return bindWidgetProps(comp, props.api, props.runtime, props.workspaceStepId);
});

function onFormChange(next: Record<string, unknown>) {
  props.onPropsUpdate?.(next);
}

const actionError = shallowRef<string | null>(null);

async function onActionClick(action: PanelAction) {
  actionError.value = null;
  try {
    await executeAction(action, {
      props: props.props,
      setProps: async (next) => {
        props.onPropsUpdate?.(next);
      },
      panelApi: props.api as unknown as Record<string, (...args: unknown[]) => unknown>,
      chatInvoke: props.chatInvoke,
    });
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}
</script>

<template>
  <div
    v-if="!document"
    class="m-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
    data-testid="json-widget-missing-type"
  >
    Missing type document: {{ type }}
  </div>

  <div v-else-if="plan" class="flex flex-col flex-1 min-h-0">
    <div
      v-if="unknownViewName"
      class="m-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
      data-testid="json-widget-unknown-view"
    >
      Unknown view: {{ unknownViewName }}
    </div>

    <component
      :is="viewComponent"
      v-else-if="plan.kind === 'view' && viewComponent"
      v-bind="boundViewProps"
    />

    <JsonFormFields
      v-else-if="plan.kind === 'form'"
      :fields="plan.fields"
      :values="plan.values"
      @change="onFormChange"
    />

    <div
      v-if="actionError"
      class="mx-3 mb-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700"
      data-testid="json-widget-action-error"
    >
      {{ actionError }}
    </div>

    <div
      v-if="plan.kind !== 'error' && plan.actions.length"
      class="flex flex-wrap gap-2 border-t border-gray-100 px-3 py-2"
      data-testid="json-widget-actions"
    >
      <button
        v-for="action in plan.actions"
        :key="action.id"
        type="button"
        class="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
        :data-testid="`json-widget-action-${action.id}`"
        @click="onActionClick(action)"
      >
        {{ action.label }}
      </button>
    </div>
  </div>
</template>
