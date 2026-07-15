// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import WorkflowDraftReview from "../../src/components/ua/WorkflowDraftReview.vue";
import type { WorkflowDraft } from "../../src/types/ua";

const draft: WorkflowDraft = {
  workflow: {
    version: 1,
    id: "ua-fixture",
    title: "Fixture Workflow",
    steps: [
      {
        id: "prd",
        title: "PRD",
        executor: "deepseek",
        skills: ["understand"],
        outputs: ["docs/prd.md"],
        prompt_template: "prompts/prd.md",
      },
      {
        id: "impl",
        title: "Implement",
        executor: "deepseek",
        skills: [],
        outputs: ["src/"],
        prompt_template: "prompts/impl.md",
      },
    ],
    edges: [{ from: "prd", to: "impl" }],
  },
  prompts: {
    "prompts/prd.md": "Write a PRD.",
    "prompts/impl.md": "Implement it.",
  },
  meta: {
    source: "ua-graph",
    analyzedAt: "2026-07-15T00:00:00.000Z",
    gitCommitHash: null,
    goal: "ship feature",
  },
};

describe("WorkflowDraftReview", () => {
  it("lists workflow title, steps, and edges", () => {
    const wrapper = mount(WorkflowDraftReview, { props: { draft } });

    expect(wrapper.find('[data-testid="ua-draft-review"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Fixture Workflow");

    const steps = wrapper.findAll('[data-testid="ua-draft-step"]');
    expect(steps).toHaveLength(2);
    expect(steps[0]!.text()).toContain("prd");
    expect(steps[0]!.text()).toContain("PRD");
    expect(steps[0]!.text()).toContain("deepseek");
    expect(steps[0]!.text()).toContain("understand");
    expect(steps[0]!.text()).toContain("docs/prd.md");

    const edges = wrapper.findAll('[data-testid="ua-draft-edge"]');
    expect(edges).toHaveLength(1);
    expect(edges[0]!.text()).toContain("prd");
    expect(edges[0]!.text()).toContain("impl");
  });

  it("emits confirm, cancel, and regenerate", async () => {
    const wrapper = mount(WorkflowDraftReview, { props: { draft } });

    await wrapper.get('[data-testid="ua-draft-confirm"]').trigger("click");
    await wrapper.get('[data-testid="ua-draft-cancel"]').trigger("click");
    await wrapper.get('[data-testid="ua-draft-regenerate"]').trigger("click");

    expect(wrapper.emitted("confirm")).toHaveLength(1);
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(wrapper.emitted("regenerate")).toHaveLength(1);
  });
});
