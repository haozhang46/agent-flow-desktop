// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import DeclarativePanelWidget from "../../src/workspace/widgets/DeclarativePanelWidget.vue";

describe("DeclarativePanelWidget", () => {
  it("renders propsFields labels", () => {
    const wrapper = mount(DeclarativePanelWidget, {
      props: {
        propsFields: [{ key: "title", label: "Title", type: "string" }],
        modelProps: { title: "Hello" },
      },
    });
    expect(wrapper.text()).toContain("Title");
    expect(wrapper.text()).toContain("Hello");
  });

  it("shows missing-type placeholder when flagged", () => {
    const wrapper = mount(DeclarativePanelWidget, {
      props: { missingType: "gone-type", propsFields: [], modelProps: {} },
    });
    expect(wrapper.text()).toMatch(/missing|gone-type/i);
  });
});
