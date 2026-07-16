// @vitest-environment happy-dom
import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, it, expect, vi } from "vitest";
import WorkflowPanelRenderer from "../../src/workspace/WorkflowPanelRenderer.vue";
import type { PanelApi } from "../../src/workspace/registryComponents";
import type { WorkspaceDefinition } from "../../src/workspace/registry";

const WidgetAlpha = defineComponent({
  name: "WidgetAlpha",
  props: { api: { type: Object, required: false }, title: { type: String, default: "" } },
  setup(props) {
    return () => h("div", { "data-testid": "widget-alpha" }, props.title || "Alpha");
  },
});

const WidgetBeta = defineComponent({
  name: "WidgetBeta",
  props: { api: { type: Object, required: false }, title: { type: String, default: "" } },
  setup(props) {
    return () => h("div", { "data-testid": "widget-beta" }, props.title || "Beta");
  },
});

vi.mock("../../src/workspace/jsonWidget/viewRegistry", () => ({
  VIEW_LOADERS: {
    alpha: async () => ({ default: WidgetAlpha }),
    beta: async () => ({ default: WidgetBeta }),
  },
}));

vi.mock("../../shared/jsonWidget/builtinTypeDefs", () => ({
  getBuiltinTypeDocument: (type: string) => {
    if (type !== "alpha" && type !== "beta") return undefined;
    return {
      type,
      label: type,
      description: "",
      category: "test",
      defaultProps: {},
      propsFields: [],
      root: { type: "view", name: type, props: { $bind: "instance" } },
    };
  },
  BUILTIN_TYPE_DOCUMENTS: {},
}));

const mockApi = {} as PanelApi;

const tabsWorkspace: WorkspaceDefinition = {
  version: 1,
  stepId: "demo",
  layout: "tabs",
  components: [
    { id: "a", type: "alpha", label: "Tab Alpha", props: { title: "Alpha content" } },
    { id: "b", type: "beta", label: "Tab Beta", props: { title: "Beta content" } },
  ],
};

const stackWorkspace: WorkspaceDefinition = {
  version: 1,
  stepId: "demo",
  layout: "stack",
  components: [
    { id: "a", type: "alpha", label: "Section Alpha", props: { title: "Stack Alpha" } },
    { id: "b", type: "beta", label: "Section Beta", props: { title: "Stack Beta" } },
  ],
};

describe("WorkflowPanelRenderer", () => {
  it("switches visible tab content when tab buttons are clicked", async () => {
    const wrapper = mount(WorkflowPanelRenderer, {
      props: { workspace: tabsWorkspace, api: mockApi },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="widget-alpha"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="widget-beta"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Alpha content");

    const betaTab = wrapper.findAll("button").find((b) => b.text() === "Tab Beta");
    expect(betaTab).toBeDefined();
    await betaTab!.trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="widget-beta"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Beta content");
  });

  it("renders all components vertically in stack layout", async () => {
    const wrapper = mount(WorkflowPanelRenderer, {
      props: { workspace: stackWorkspace, api: mockApi },
    });
    await flushPromises();

    expect(wrapper.findAll('[data-testid="stack-section"]')).toHaveLength(2);
    expect(wrapper.find('[data-testid="widget-alpha"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="widget-beta"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Stack Alpha");
    expect(wrapper.text()).toContain("Stack Beta");
    expect(wrapper.text()).toContain("Section Alpha");
    expect(wrapper.text()).toContain("Section Beta");
  });

  it("shows missing-type error for unknown widget type via Host", async () => {
    const wrapper = mount(WorkflowPanelRenderer, {
      props: {
        workspace: {
          version: 1,
          stepId: "demo",
          layout: "stack",
          components: [{ id: "x", type: "not-real", props: {} }],
        },
        api: mockApi,
      },
    });
    await flushPromises();

    const error = wrapper.find('[data-testid="json-widget-missing-type"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toContain("not-real");
  });
});
