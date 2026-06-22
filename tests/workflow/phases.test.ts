import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  writePhaseOutput,
  readPhaseOutput,
  writeGateResults,
  readGateResults,
} from "../../electron/workflow/phases";

describe("phases", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-phases-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("writes phase under phases/{workflowId}/{stepId}.md when workflowId set", async () => {
    await writePhaseOutput(tmp, "be-dev", "summary", undefined, "default-dev-cicd");
    const content = await readPhaseOutput(tmp, "be-dev", undefined, "default-dev-cicd");
    expect(content).toBe("summary");
  });

  it("readPhaseOutput falls back to legacy phases/{stepId}.md", async () => {
    await writePhaseOutput(tmp, "prd", "legacy content");
    const content = await readPhaseOutput(tmp, "prd", undefined, "default-dev-cicd");
    expect(content).toBe("legacy content");
  });

  it("writes and reads phase handoff markdown", async () => {
    await writePhaseOutput(tmp, "prd", "# PRD output\n\ndetails");
    const content = await readPhaseOutput(tmp, "prd");
    expect(content).toContain("PRD output");
  });

  it("writes custom rel path under .agentflow", async () => {
    await writePhaseOutput(tmp, "prd", "custom", "phases/prd.md");
    const content = await readPhaseOutput(tmp, "prd", "phases/prd.md");
    expect(content).toBe("custom");
  });

  it("persists gate results json", async () => {
    const results = [{ id: "g1", status: "PASS" as const }];
    await writeGateResults(tmp, "be-dev", results);
    const loaded = await readGateResults(tmp, "be-dev");
    expect(loaded).toEqual(results);
  });
});
