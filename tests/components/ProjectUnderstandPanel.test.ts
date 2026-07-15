// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectUnderstandPanel from "../../src/components/ua/ProjectUnderstandPanel.vue";
import type {
  GraphSummary,
  KnowledgeGraph,
  UaStatus,
  WorkflowDraft,
} from "../../src/types/ua";

const sampleSummary: GraphSummary = {
  projectName: "fixture-app",
  description: "Minimal UA graph for tests",
  nodeCount: 1,
  edgeCount: 0,
  layers: [{ id: "layer:ui", name: "UI", nodeCount: 1 }],
  sampleNodes: [
    {
      id: "file:src/main.ts",
      name: "main.ts",
      type: "file",
      summary: "App entry",
    },
  ],
  analyzedAt: "2026-07-15T00:00:00.000Z",
};

const idleStatus: UaStatus = {
  hasGraph: false,
  busy: false,
  busyKind: null,
  summary: null,
  analyzedAt: null,
};

const readyStatus: UaStatus = {
  hasGraph: true,
  busy: false,
  busyKind: null,
  summary: sampleSummary,
  analyzedAt: sampleSummary.analyzedAt,
};

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
        skills: [],
        outputs: [],
        prompt_template: "prompts/prd.md",
      },
    ],
    edges: [],
  },
  prompts: { "prompts/prd.md": "Write a PRD." },
  meta: {
    source: "ua-graph",
    analyzedAt: sampleSummary.analyzedAt,
    gitCommitHash: null,
    gitCommitHashes: { main: null },
    rootIds: ["main"],
    goal: null,
  },
};

const sampleGraph: KnowledgeGraph = {
  project: {
    name: "fixture-app",
    description: "Minimal UA graph for tests",
    languages: ["typescript"],
    frameworks: ["vue"],
    analyzedAt: "2026-07-15T00:00:00.000Z",
    gitCommitHash: null,
  },
  nodes: [
    {
      id: "file:src/main.ts",
      type: "file",
      name: "main.ts",
      filePath: "src/main.ts",
      summary: "App entry",
      tags: ["entry"],
      complexity: "low",
    },
  ],
  edges: [],
  layers: [
    {
      id: "layer:ui",
      name: "UI",
      description: "Frontend entry",
      nodeIds: ["file:src/main.ts"],
    },
  ],
  tour: [],
};

const fetchStatus = vi.fn();
const startAnalyze = vi.fn();
const cancelAnalyze = vi.fn();
const pollProgress = vi.fn();
const generateWorkflow = vi.fn();
const applyWorkflow = vi.fn();
const fetchGraph = vi.fn();

vi.mock("../../src/composables/useUa", () => ({
  useUa: () => ({
    fetchStatus,
    fetchSummary: vi.fn(),
    fetchGraph,
    startAnalyze,
    cancelAnalyze,
    pollProgress,
    generateWorkflow,
    applyWorkflow,
  }),
}));

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await flushPromises();
  }
}

describe("ProjectUnderstandPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    fetchStatus.mockResolvedValue(idleStatus);
    startAnalyze.mockResolvedValue({ started: true });
    cancelAnalyze.mockResolvedValue({ cancelled: true });
    pollProgress.mockResolvedValue(null);
    generateWorkflow.mockResolvedValue({ draft });
    applyWorkflow.mockResolvedValue({ workflowId: "ua-fixture" });
    fetchGraph.mockResolvedValue(sampleGraph);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not render when show is false", () => {
    const wrapper = mount(ProjectUnderstandPanel, { props: { show: false } });
    expect(wrapper.find('[data-testid="ua-project-understand-panel"]').exists()).toBe(
      false,
    );
  });

  it("loads status and shows no-graph hint", async () => {
    const wrapper = mount(ProjectUnderstandPanel, { props: { show: true } });
    await settle();

    expect(fetchStatus).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="ua-panel-no-graph"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="ua-generate"]').attributes("disabled")).toBeDefined();
  });

  it("shows summary when hasGraph and enables generate", async () => {
    fetchStatus.mockResolvedValue(readyStatus);
    const wrapper = mount(ProjectUnderstandPanel, { props: { show: true } });
    await settle();

    expect(wrapper.find('[data-testid="ua-graph-summary"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("fixture-app");
    expect(wrapper.get('[data-testid="ua-generate"]').attributes("disabled")).toBeUndefined();
  });

  it("confirms token cost before first analyze when no graph", async () => {
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirm);
    fetchStatus
      .mockResolvedValueOnce(idleStatus)
      .mockResolvedValue({ ...idleStatus, busy: true, busyKind: "analyze" });

    const wrapper = mount(ProjectUnderstandPanel, { props: { show: true } });
    await settle();

    await wrapper.get('[data-testid="ua-analyze"]').trigger("click");
    await settle();

    expect(confirm).toHaveBeenCalled();
    expect(startAnalyze).toHaveBeenCalled();
  });

  it("skips confirm when graph already exists", async () => {
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirm);
    fetchStatus.mockResolvedValue(readyStatus);

    const wrapper = mount(ProjectUnderstandPanel, { props: { show: true } });
    await settle();

    await wrapper.get('[data-testid="ua-analyze"]').trigger("click");
    await settle();

    expect(confirm).not.toHaveBeenCalled();
    expect(startAnalyze).toHaveBeenCalled();
  });

  it("polls progress every 1s while busy", async () => {
    vi.useFakeTimers();
    fetchStatus.mockResolvedValue({
      ...idleStatus,
      busy: true,
      busyKind: "analyze",
    });
    pollProgress.mockResolvedValue({
      phase: "scan",
      message: "Scanning…",
      percent: 5,
    });

    const wrapper = mount(ProjectUnderstandPanel, { props: { show: true } });
    await settle();

    expect(pollProgress).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="ua-panel-progress"]').text()).toContain(
      "Scanning",
    );

    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(pollProgress.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("generate shows draft review and confirm applies workflow", async () => {
    fetchStatus.mockResolvedValue(readyStatus);
    const wrapper = mount(ProjectUnderstandPanel, { props: { show: true } });
    await settle();

    await wrapper.get('[data-testid="ua-goal-input"]').setValue("build CI");
    await wrapper.get('[data-testid="ua-generate"]').trigger("click");
    await settle();

    expect(generateWorkflow).toHaveBeenCalledWith("build CI");
    expect(wrapper.find('[data-testid="ua-draft-review"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Fixture Workflow");

    await wrapper.get('[data-testid="ua-draft-confirm"]').trigger("click");
    await settle();

    expect(applyWorkflow).toHaveBeenCalledWith(draft, { activate: true });
    expect(wrapper.emitted("applied")).toEqual([["ua-fixture"]]);
  });

  it("confirm shows Applying… and disables draft actions while apply is in flight", async () => {
    fetchStatus.mockResolvedValue(readyStatus);
    let resolveApply!: (value: { workflowId: string }) => void;
    applyWorkflow.mockReturnValue(
      new Promise((resolve) => {
        resolveApply = resolve;
      }),
    );

    const wrapper = mount(ProjectUnderstandPanel, { props: { show: true } });
    await settle();

    await wrapper.get('[data-testid="ua-generate"]').trigger("click");
    await settle();

    await wrapper.get('[data-testid="ua-draft-confirm"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="ua-draft-confirm"]').text()).toBe("Applying…");
    expect(wrapper.get('[data-testid="ua-draft-confirm"]').attributes("disabled")).toBeDefined();
    expect(wrapper.get('[data-testid="ua-draft-cancel"]').attributes("disabled")).toBeDefined();
    expect(wrapper.get('[data-testid="ua-draft-regenerate"]').attributes("disabled")).toBeDefined();

    resolveApply({ workflowId: "ua-fixture" });
    await settle();
  });

  it("draft cancel clears review; regenerate calls generate again", async () => {
    fetchStatus.mockResolvedValue(readyStatus);
    const wrapper = mount(ProjectUnderstandPanel, { props: { show: true } });
    await settle();

    await wrapper.get('[data-testid="ua-generate"]').trigger("click");
    await settle();
    expect(wrapper.find('[data-testid="ua-draft-review"]').exists()).toBe(true);

    await wrapper.get('[data-testid="ua-draft-cancel"]').trigger("click");
    await settle();
    expect(wrapper.find('[data-testid="ua-draft-review"]').exists()).toBe(false);

    await wrapper.get('[data-testid="ua-generate"]').trigger("click");
    await settle();
    await wrapper.get('[data-testid="ua-draft-regenerate"]').trigger("click");
    await settle();

    expect(generateWorkflow.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(wrapper.find('[data-testid="ua-draft-review"]').exists()).toBe(true);
  });

  it("preview fetches graph and shows explorer", async () => {
    fetchStatus.mockResolvedValue(readyStatus);
    const wrapper = mount(ProjectUnderstandPanel, { props: { show: true } });
    await settle();

    await wrapper.get('[data-testid="ua-preview"]').trigger("click");
    await settle();

    expect(wrapper.emitted("open-preview")).toBeTruthy();
    expect(fetchGraph).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="ua-graph-explorer"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("main.ts");
  });

  it("emits close from close button", async () => {
    fetchStatus.mockResolvedValue(idleStatus);
    const wrapper = mount(ProjectUnderstandPanel, { props: { show: true } });
    await settle();

    await wrapper.get('[data-testid="ua-panel-close"]').trigger("click");
    expect(wrapper.emitted("close")).toBeTruthy();
  });
});
