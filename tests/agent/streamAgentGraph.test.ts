import { describe, expect, it, vi } from "vitest";
import { streamCompiledAgent } from "../../electron/agent/streamAgentGraph";

describe("streamCompiledAgent", () => {
  it("maps custom stream chunks to on_chat_model_stream", async () => {
    const agent = {
      stream: vi.fn(async function* () {
        yield ["custom", "hel"];
        yield ["custom", "lo"];
      }),
    };

    const events = [];
    for await (const event of streamCompiledAgent(agent as never, { messages: [] }, {})) {
      events.push(event);
    }

    expect(events).toEqual([
      { event: "on_chat_model_stream", data: { chunk: { content: "hel" } } },
      { event: "on_chat_model_stream", data: { chunk: { content: "lo" } } },
    ]);
  });
});
