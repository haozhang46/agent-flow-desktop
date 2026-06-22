import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import {
  stateFilePath,
  loadStateFile,
  saveStateFile,
  createRunState,
} from "../../electron/workflow/stateFile";

const MINIMAL_WF = {
  version: 1 as const,
  id: "test-id",
  title: "Test",
  steps: [
    {
      id: "prd",
      title: "PRD",
      executor: "deepseek" as const,
      skills: [],
      outputs: [],
      gates: [],
    },
  ],
  edges: [],
};

describe("stateFile paths", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-state-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("legacy workflow uses root state.json", () => {
    expect(stateFilePath(tmp, "legacy-wf", true)).toBe(
      path.join(tmp, ".agentflow/state.json"),
    );
  });

  it("non-legacy uses workflows/{id}/state.json", () => {
    expect(stateFilePath(tmp, "hotfix", false)).toBe(
      path.join(tmp, ".agentflow/workflows/hotfix/state.json"),
    );
  });

  it("saveStateFile and loadStateFile round-trip for nested workflow", async () => {
    await fs.mkdir(path.join(tmp, ".agentflow/workflows/hotfix"), { recursive: true });
    await fs.writeFile(
      path.join(tmp, ".agentflow/workflows/hotfix/workflow.yaml"),
      yaml.stringify({ ...MINIMAL_WF, id: "hotfix", title: "Hotfix" }),
    );

    const state = createRunState({ ...MINIMAL_WF, id: "hotfix", title: "Hotfix" });
    await saveStateFile(tmp, state);
    const loaded = await loadStateFile(tmp, { ...MINIMAL_WF, id: "hotfix", title: "Hotfix" });
    expect(loaded?.workflowId).toBe("hotfix");
    expect(loaded?.currentStepId).toBe("prd");
  });
});
