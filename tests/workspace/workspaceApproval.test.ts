import { describe, expect, it } from "vitest";
import { parsePendingWorkspaceApproval } from "../../src/workspace/workspaceApproval";
import { parsePendingAgentflowFileApproval } from "../../src/workspace/agentflowFileApproval";
import {
  AGENTFLOW_FILE_PENDING_PREFIX,
  WORKSPACE_PENDING_PREFIX,
} from "../../shared/agentflowApprovalConstants";

describe("parsePendingWorkspaceApproval", () => {
  it("parses pending workspace payload", () => {
    const payload = {
      workflowId: "default-dev-cicd",
      stepId: "fe-dev",
      summary: "added: code",
      before: null,
      after: { version: 1, stepId: "fe-dev", layout: "tabs", components: [] },
    };
    const output = WORKSPACE_PENDING_PREFIX + JSON.stringify(payload);
    expect(parsePendingWorkspaceApproval(output)).toEqual(payload);
  });

  it("returns null for normal tool output", () => {
    expect(parsePendingWorkspaceApproval("Wrote AGENTS.md")).toBeNull();
  });

  it("parses pending agentflow file payload", () => {
    const payload = {
      path: ".agentflow/topology.yaml",
      summary: "Write topology",
      before: "nodes: []\n",
      after: "nodes:\n  - id: api\n",
    };
    const output = AGENTFLOW_FILE_PENDING_PREFIX + JSON.stringify(payload);
    expect(parsePendingAgentflowFileApproval(output)).toEqual(payload);
  });
});
