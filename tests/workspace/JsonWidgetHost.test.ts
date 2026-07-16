// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import JsonWidgetHost from "../../src/workspace/jsonWidget/JsonWidgetHost.vue";
import { parsePanelTypeDocument } from "../../shared/jsonWidget/schema";

vi.mock("../../src/workspace/jsonWidget/viewRegistry", () => ({
  VIEW_LOADERS: {
    "markdown-doc": async () => ({
      default: defineComponent({
        props: ["docsDir", "api"],
        setup: (p) => () => h("div", { "data-testid": "mock-md" }, String(p.docsDir)),
      }),
    }),
  },
}));

describe("JsonWidgetHost", () => {
  const api = {} as never;

  it("renders named view from type document", async () => {
    const typeDocument = parsePanelTypeDocument({
      type: "markdown-doc",
      label: "Markdown Doc",
      description: "d",
      category: "docs",
      defaultProps: { docsDir: "docs" },
      propsFields: [{ key: "docsDir", label: "Docs directory", type: "string" }],
      root: { type: "view", name: "markdown-doc", props: { $bind: "instance" } },
    });
    const wrapper = mount(JsonWidgetHost, {
      props: {
        type: "markdown-doc",
        componentId: "c1",
        props: { docsDir: "notes" },
        api,
        typeDocument,
      },
    });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="mock-md"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="mock-md"]').text()).toContain("notes");
  });

  it("shows missing-type error when no document", () => {
    const wrapper = mount(JsonWidgetHost, {
      props: {
        type: "nope",
        componentId: "c1",
        props: {},
        api,
      },
    });
    expect(wrapper.find('[data-testid="json-widget-missing-type"]').exists()).toBe(true);
  });

  it("renders form root fields", async () => {
    const typeDocument = parsePanelTypeDocument({
      type: "my-checklist",
      label: "Checklist",
      description: "d",
      category: "custom",
      defaultProps: { title: "Hi" },
      propsFields: [{ key: "title", label: "Title", type: "string" }],
      root: { type: "form" },
    });
    const wrapper = mount(JsonWidgetHost, {
      props: {
        type: "my-checklist",
        componentId: "c1",
        props: {},
        api,
        typeDocument,
      },
    });
    const input = wrapper.find('[data-testid="json-form-field-title"]');
    expect(input.exists()).toBe(true);
  });
});
