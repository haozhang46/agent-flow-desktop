import { describe, it, expect } from "vitest";
import { dispatch, resolveActiveSteps, applyIntentRisk } from "../../electron/workflow/dispatcher";
import type { WorkflowDefinition } from "../../electron/workflow/types";
import { createRunState } from "../../electron/workflow/stateFile";

const workflow: WorkflowDefinition = {
  version: 1,
  id: "test",
  title: "Test",
  steps: [
    { id: "prd", title: "PRD", executor: "deepseek", skills: [], outputs: [] },
    { id: "architecture", title: "Arch", executor: "deepseek", skills: [], outputs: [] },
    { id: "fe-dev", title: "FE", executor: "deepseek", skills: [], outputs: [] },
    { id: "be-dev", title: "BE", executor: "deepseek", skills: [], outputs: [] },
    { id: "test", title: "Test", executor: "deepseek", skills: [], outputs: [] },
    { id: "review", title: "Review", executor: "deepseek", skills: [], outputs: [] },
    { id: "test-2", title: "Test2", executor: "deepseek", skills: [], outputs: [] },
    { id: "cicd", title: "CI", executor: "deepseek", skills: [], outputs: [] },
  ],
  edges: [],
  resources: [],
};

describe("dispatcher", () => {
  it("FAST_PATH resolves BUG_FIX/LOW to 3 steps", () => {
    const active = resolveActiveSteps(workflow, "BUG_FIX", "LOW");
    expect(active).toEqual(["be-dev", "test", "cicd"]);
  });

  it("FEATURE/HIGH resolves all 8 steps", () => {
    const active = resolveActiveSteps(workflow, "FEATURE", "HIGH");
    expect(active).toHaveLength(8);
  });

  it("QUERY/NA resolves empty active steps", () => {
    const active = resolveActiveSteps(workflow, "QUERY", "NA");
    expect(active).toEqual([]);
  });

  it("applyIntentRisk marks inactive steps skipped", () => {
    const state = createRunState(workflow, "FEATURE", "HIGH");
    const next = applyIntentRisk(workflow, state, "BUG_FIX", "LOW");

    expect(next.activeStepIds).toEqual(["be-dev", "test", "cicd"]);
    expect(next.stepStatuses["prd"]).toBe("skipped");
    expect(next.currentStepId).toBe("be-dev");
  });

  it("dispatch returns idle for QUERY/NA", () => {
    const state = createRunState(workflow, "QUERY", "NA");
    const decision = dispatch(workflow, state);
    expect(decision.action).toBe("idle");
  });

  it("dispatch returns run for pending step", () => {
    const state = createRunState(workflow, "BUG_FIX", "LOW");
    const decision = dispatch(workflow, state);
    expect(decision.action).toBe("run");
    expect(decision.stepId).toBe("be-dev");
  });
});
