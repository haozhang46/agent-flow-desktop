import { describe, expect, it } from "vitest";
import { heuristicCreateComponentIntent } from "../../electron/agent/intentRouter";

describe("heuristicCreateComponentIntent", () => {
  it("detects create custom component type", () => {
    const r = heuristicCreateComponentIntent("帮我新建一个自定义 checklist 组件类型");
    expect(r.intent).toBe("create_custom_component_type");
    expect(r.confidence).toBe("high");
  });

  it("marks ambiguous component mentions as low confidence", () => {
    const r = heuristicCreateComponentIntent("这个组件能不能改一下");
    expect(r.confidence).toBe("low");
  });

  it("returns other for unrelated chat", () => {
    const r = heuristicCreateComponentIntent("总结一下今天的 commits");
    expect(r.intent).toBe("other");
  });
});
