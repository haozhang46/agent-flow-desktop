import { describe, expect, it } from "vitest";
import { AgentStreamFilter } from "../../electron/agent/agentStreamFilter";

describe("AgentStreamFilter", () => {
  it("streams all chunks in ask mode", () => {
    const filter = new AgentStreamFilter("ask");
    expect(filter.onModelChunk("hello")).toEqual([{ type: "message", content: "hello" }]);
    expect(filter.onModelChunk(" world")).toEqual([{ type: "message", content: " world" }]);
  });

  it("streams all chunks in agent mode including pre-tool narration", () => {
    const filter = new AgentStreamFilter("agent");
    expect(filter.onModelChunk("Let me read the file.")).toEqual([
      { type: "message", content: "Let me read the file." },
    ]);
    filter.onToolStart();
    expect(filter.onModelChunk("Done: here is the result")).toEqual([
      { type: "message", content: "Done: here is the result" },
    ]);
    expect(filter.finish()).toEqual([]);
  });

  it("buffers plan mode chunks for plan_ready", () => {
    const filter = new AgentStreamFilter("plan");
    expect(filter.onModelChunk("## Plan")).toEqual([]);
    expect(filter.fullText).toBe("## Plan");
    expect(filter.finish()).toEqual([]);
  });
});
