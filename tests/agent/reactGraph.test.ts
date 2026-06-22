import { describe, expect, it, vi } from "vitest";
import { HumanMessage, AIMessageChunk } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn(),
}));

vi.mock("../../electron/chatMemory/checkpointer", () => ({
  getProjectCheckpointer: vi.fn(() => ({})),
}));

import { buildStreamingReactAgent } from "../../electron/agent/reactGraph";

describe("buildStreamingReactAgent", () => {
  it("compiles ask and agent graphs", () => {
    const llm = { bindTools: vi.fn() };
    const ask = buildStreamingReactAgent({
      llm: llm as never,
      tools: [],
      checkpointer: {} as never,
    });
    const agent = buildStreamingReactAgent({
      llm: llm as never,
      tools: [{ name: "read_file", description: "read", invoke: vi.fn() } as never],
      checkpointer: {} as never,
    });
    expect(ask).toBeTruthy();
    expect(agent).toBeTruthy();
  });

  it("forwards LLM token chunks through custom stream writer", async () => {
    const llm = {
      stream: vi.fn(async function* () {
        yield new AIMessageChunk({ content: "hel" });
        yield new AIMessageChunk({ content: "lo" });
      }),
    };
    const agent = buildStreamingReactAgent({
      llm: llm as never,
      tools: [],
      checkpointer: new MemorySaver(),
    });

    const tokens: string[] = [];
    const stream = await agent.stream(
      { messages: [new HumanMessage("hi")] },
      { configurable: { thread_id: "writer-test" }, streamMode: ["custom", "updates"] },
    );
    for await (const raw of stream) {
      if (Array.isArray(raw) && raw.length === 2 && raw[0] === "custom") {
        tokens.push(String(raw[1]));
      }
    }

    expect(tokens).toEqual(["hel", "lo"]);
  });
});
