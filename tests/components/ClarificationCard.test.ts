// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ClarificationCard from "../../src/components/chat/ClarificationCard.vue";

const options = [
  { id: "yes", label: "需要联网" },
  { id: "no", label: "不用，按已有知识答" },
];

describe("ClarificationCard", () => {
  it("selects an option and emits submit payload", async () => {
    const wrapper = mount(ClarificationCard, {
      props: {
        question: "需要联网查询最新股价吗？",
        options,
        allowMultiple: false,
        allowFreeText: true,
        status: "pending",
      },
    });

    await wrapper.get('[data-testid="clarification-option-yes"]').setValue(true);
    await wrapper.get('[data-testid="clarification-free-text"]').setValue("只要今天的收盘价");
    await wrapper.get('[data-testid="clarification-submit"]').trigger("click");

    expect(wrapper.emitted("submit")).toEqual([
      [{ selected_option_ids: ["yes"], free_text: "只要今天的收盘价" }],
    ]);
  });

  it("allows multi-select when allowMultiple is true", async () => {
    const wrapper = mount(ClarificationCard, {
      props: {
        question: "Pick both",
        options,
        allowMultiple: true,
        allowFreeText: false,
        status: "pending",
      },
    });

    await wrapper.get('[data-testid="clarification-option-yes"]').setValue(true);
    await wrapper.get('[data-testid="clarification-option-no"]').setValue(true);
    await wrapper.get('[data-testid="clarification-submit"]').trigger("click");

    expect(wrapper.emitted("submit")).toEqual([
      [{ selected_option_ids: ["yes", "no"] }],
    ]);
  });

  it("shows read-only answered summary without submit", () => {
    const wrapper = mount(ClarificationCard, {
      props: {
        question: "Done?",
        options,
        allowMultiple: false,
        allowFreeText: false,
        status: "answered",
      },
    });

    expect(wrapper.text()).toContain("Answered");
    expect(wrapper.find('[data-testid="clarification-submit"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="clarification-option-yes"]').attributes("disabled")).toBeDefined();
  });
});
