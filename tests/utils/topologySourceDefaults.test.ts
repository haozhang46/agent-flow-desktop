import { describe, expect, it } from "vitest";
import { defaultSourceForNodeId } from "../../src/utils/topologySourceDefaults";

describe("defaultSourceForNodeId", () => {
  it("maps api to backend", () => {
    expect(defaultSourceForNodeId("api")).toBe("backend");
  });

  it("maps fe-web to fe", () => {
    expect(defaultSourceForNodeId("fe-web")).toBe("fe");
  });

  it("returns empty for unknown", () => {
    expect(defaultSourceForNodeId("custom-svc")).toBe("");
  });
});
