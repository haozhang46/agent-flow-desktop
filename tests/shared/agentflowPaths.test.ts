import { describe, expect, it } from "vitest";
import { isAgentflowRelativePath } from "../../shared/agentflowPaths";

describe("isAgentflowRelativePath", () => {
  it("matches .agentflow root and nested files", () => {
    expect(isAgentflowRelativePath(".agentflow")).toBe(true);
    expect(isAgentflowRelativePath(".agentflow/topology.yaml")).toBe(true);
    expect(isAgentflowRelativePath("./.agentflow/workspaces/fe-dev.workspace.json")).toBe(true);
  });

  it("does not match other project paths", () => {
    expect(isAgentflowRelativePath("docs/be-architecture.md")).toBe(false);
    expect(isAgentflowRelativePath("AGENTS.md")).toBe(false);
  });
});
