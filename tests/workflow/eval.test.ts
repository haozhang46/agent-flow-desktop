import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runHarnessEval, compareEvalReports } from "../../electron/workflow/eval";
import { createRunState } from "../../electron/workflow/stateFile";
import type { WorkflowDefinition } from "../../electron/workflow/types";

const workflow: WorkflowDefinition = {
  version: 1,
  id: "eval-test",
  title: "Eval Test",
  steps: [
    {
      id: "prd",
      title: "PRD",
      executor: "deepseek",
      skills: [],
      outputs: ["docs/PRD.md"],
      gates: [{ id: "prd-file", type: "file", path: "docs/PRD.md", min_bytes: 10 }],
    },
    {
      id: "be-dev",
      title: "BE",
      executor: "deepseek",
      skills: [],
      outputs: ["backend/"],
    },
  ],
  edges: [{ from: "prd", to: "be-dev" }],
  resources: [],
};

describe("harnessEval", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-eval-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("scores higher when artifacts and phases exist", async () => {
    await fs.mkdir(path.join(tmp, "docs"), { recursive: true });
    await fs.writeFile(path.join(tmp, "docs/PRD.md"), "x".repeat(50));
    await fs.mkdir(path.join(tmp, ".agentflow/phases"), { recursive: true });
    await fs.writeFile(path.join(tmp, ".agentflow/phases/prd.md"), "phase");

    const state = createRunState(workflow, "BUG_FIX", "LOW");
    state.activeStepIds = ["prd"];
    state.stepStatuses["prd"] = "done";
    state.lastGateResults["prd"] = [{ id: "prd-file", status: "PASS" }];

    const report = await runHarnessEval(tmp, workflow, state);
    expect(report.totalScore).toBeGreaterThan(50);
    expect(report.dimensions).toHaveLength(4);
  });

  it("compareEvalReports shows delta and regressions", () => {
    const baseline = {
      workflowId: "w",
      intent: "FEATURE",
      risk: "HIGH",
      dimensions: [{ id: "gates", weight: 0.25, score: 80, max: 100, detail: "" }],
      totalScore: 80,
      grade: "B",
      generatedAt: "",
    };
    const candidate = {
      ...baseline,
      dimensions: [{ id: "gates", weight: 0.25, score: 60, max: 100, detail: "" }],
      totalScore: 60,
      grade: "D",
    };
    const cmp = compareEvalReports(baseline, candidate);
    expect(cmp.delta).toBe(-20);
    expect(cmp.regressed).toContain("gates: 80 → 60");
  });
});
