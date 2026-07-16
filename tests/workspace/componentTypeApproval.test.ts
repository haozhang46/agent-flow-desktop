import { describe, expect, it } from "vitest";
import { COMPONENT_TYPE_PENDING_PREFIX } from "../../shared/agentflowApprovalConstants";
import { parsePendingComponentTypeApproval } from "../../src/workspace/componentTypeApproval";

describe("parsePendingComponentTypeApproval", () => {
  it("parses pending payload", () => {
    const payload = {
      scope: "project",
      typeDef: {
        type: "my-checklist",
        label: "Checklist",
        description: "d",
        category: "custom",
        defaultProps: {},
        propsFields: [],
      },
      overwrite: false,
      summary: "Register my-checklist",
    };
    const parsed = parsePendingComponentTypeApproval(
      COMPONENT_TYPE_PENDING_PREFIX + JSON.stringify(payload),
    );
    expect(parsed?.typeDef.type).toBe("my-checklist");
    expect(parsed?.scope).toBe("project");
  });

  it("returns null for unrelated output", () => {
    expect(parsePendingComponentTypeApproval("hello")).toBeNull();
  });
});
