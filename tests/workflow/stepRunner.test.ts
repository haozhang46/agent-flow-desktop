import { describe, it, expect, vi } from "vitest";
import type { StepContext, StepEvent } from "../../electron/executors/types";
import type { WorkflowDefinition } from "../../electron/workflow/types";
import type { WorkflowRunState } from "../../electron/workflow/state";

const mockRun = vi.fn(async function* (_ctx: StepContext): AsyncIterable<StepEvent> {
  yield { type: "message", content: "mock output" };
  yield { type: "done" };
});

vi.mock("../../electron/workflow/prompt", () => ({
  buildSystemPrompt: vi.fn().mockResolvedValue("system prompt"),
  renderPromptTemplate: vi.fn().mockResolvedValue("user prompt"),
}));

vi.mock("../../electron/workflow/gates", () => ({
  runGates: vi.fn().mockResolvedValue([]),
  allGatesPassed: vi.fn().mockReturnValue(true),
}));

vi.mock("../../electron/resources/resolver", () => ({
  stepNeedsResourceContext: vi.fn().mockReturnValue(false),
  resolveResources: vi.fn(),
  formatResourceContextForPrompt: vi.fn(),
}));

vi.mock("../../electron/executors/registry", () => ({
  registerExecutor: vi.fn(),
  getExecutor: vi.fn(() => ({
    id: "mock",
    run: mockRun,
  })),
}));

vi.mock("../../electron/workflow/stateFile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../electron/workflow/stateFile")>();
  return {
    ...actual,
    saveStateFile: vi.fn().mockResolvedValue(undefined),
    getOrCreateState: vi.fn(),
  };
});

vi.mock("../../electron/workflow/phases", () => ({
  writePhaseOutput: vi.fn().mockResolvedValue("/tmp/phase.md"),
  writeGateResults: vi.fn().mockResolvedValue(undefined),
  readPhaseOutput: vi.fn().mockResolvedValue(null),
}));

import { StepRunner } from "../../electron/workflow/stepRunner";

const testWorkflow: WorkflowDefinition = {
  version: 1,
  id: "test-workflow",
  title: "Test Workflow",
  steps: [
    {
      id: "step-a",
      title: "Step A",
      executor: "deepseek",
      agents_md: null,
      skills: [],
      prompt_template: "prompts/a.md",
      outputs: [],
      advance: "manual",
      requires_resources: [],
    },
    {
      id: "step-b",
      title: "Step B",
      executor: "deepseek",
      agents_md: null,
      skills: [],
      prompt_template: "prompts/b.md",
      outputs: [],
      advance: "manual",
      requires_resources: [],
    },
  ],
  edges: [{ from: "step-a", to: "step-b" }],
  resources: [],
};

function makeState(overrides: Partial<WorkflowRunState> = {}): WorkflowRunState {
  return {
    workflowId: "test-workflow",
    intent: "FEATURE",
    risk: "HIGH",
    currentStepId: "step-a",
    activeStepIds: ["step-a", "step-b"],
    stepStatuses: { "step-a": "pending", "step-b": "pending" },
    lastGateResults: {},
    threadId: "test-thread",
    ...overrides,
  };
}

describe("StepRunner", () => {
  it("initial state has first step pending", () => {
    const runner = new StepRunner("/tmp/project", testWorkflow, () => "test-key", undefined, makeState());
    const state = runner.getState();

    expect(state.workflowId).toBe("test-workflow");
    expect(state.currentStepId).toBe("step-a");
    expect(state.stepStatuses["step-a"]).toBe("pending");
    expect(state.stepStatuses["step-b"]).toBe("pending");
    expect(state.threadId).toBeTruthy();
  });

  it("runCurrentStep emits events and marks step done", async () => {
    const runner = new StepRunner("/tmp/project", testWorkflow, () => "test-key", undefined, makeState());
    const events: StepEvent[] = [];

    for await (const event of runner.runCurrentStep()) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: "message", content: "mock output" });
    expect(events.at(-1)).toEqual({ type: "done" });

    const state = runner.getState();
    expect(state.stepStatuses["step-a"]).toBe("done");
    expect(state.currentStepId).toBe("step-a");
  });

  it("advance continue moves to next step", async () => {
    const runner = new StepRunner("/tmp/project", testWorkflow, () => "test-key", undefined, makeState());

    for await (const _ of runner.runCurrentStep()) {
      // drain
    }

    await runner.advance("continue");

    const state = runner.getState();
    expect(state.currentStepId).toBe("step-b");
    expect(state.stepStatuses["step-a"]).toBe("done");
    expect(state.stepStatuses["step-b"]).toBe("pending");
  });

  it("advance skip marks skipped and moves on", async () => {
    const runner = new StepRunner("/tmp/project", testWorkflow, () => "test-key", undefined, makeState());

    await runner.advance("skip");

    const state = runner.getState();
    expect(state.stepStatuses["step-a"]).toBe("skipped");
    expect(state.currentStepId).toBe("step-b");
  });

  it("advance retry resets step to pending", async () => {
    const runner = new StepRunner("/tmp/project", testWorkflow, () => "test-key", undefined, makeState());

    for await (const _ of runner.runCurrentStep()) {
      // drain
    }

    await runner.advance("retry");

    const state = runner.getState();
    expect(state.stepStatuses["step-a"]).toBe("pending");
    expect(state.currentStepId).toBe("step-a");
  });

  it("getDispatchDecision returns dispatcher result", () => {
    const runner = new StepRunner("/tmp/project", testWorkflow, () => "test-key", undefined, makeState());
    const decision = runner.getDispatchDecision();
    expect(decision.action).toBe("run");
    expect(decision.stepId).toBe("step-a");
  });
});
