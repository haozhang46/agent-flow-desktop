import { describe, it, expect, vi, beforeEach } from "vitest";

const streamMock = vi.fn(async function* () {
  yield ["custom", "hi"];
});

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn(),
}));

vi.mock("../../electron/agent/reactGraph", () => ({
  buildStreamingReactAgent: vi.fn(() => ({
    stream: streamMock,
  })),
}));

vi.mock("../../electron/chatMemory/checkpointer", () => ({
  getProjectCheckpointer: vi.fn(),
}));

vi.mock("../../electron/agent/agentflowPromptContext", () => ({
  getToolsForMode: vi.fn(() => []),
}));

vi.mock("../../electron/agent/prompt", () => ({
  buildChatSystemPrompt: vi.fn(async () => "system"),
}));

import { AgentService } from "../../electron/agent/agentService";
import { buildStreamingReactAgent } from "../../electron/agent/reactGraph";

describe("AgentService.resolveCheckpointThreadId", () => {
  let service: AgentService;

  beforeEach(() => {
    streamMock.mockClear();
    vi.mocked(buildStreamingReactAgent).mockClear();
    service = new AgentService();
    service.configure({
      apiKey: "test-key",
      workspaceRoot: "/tmp/ws",
    });
  });

  it("uses thread_id verbatim when it contains a colon", async () => {
    const events = service.streamEvents("free:wf-1:thread-abc", "hello", { mode: "agent" });
    await events.next();

    expect(buildStreamingReactAgent).toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        configurable: expect.objectContaining({
          thread_id: "free:wf-1:thread-abc",
        }),
        streamMode: ["custom", "updates"],
      }),
    );
  });

  it("prefixes mode for bare uuid thread ids", async () => {
    const events = service.streamEvents("uuid-only", "hello", { mode: "agent" });
    await events.next();

    expect(buildStreamingReactAgent).toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        configurable: expect.objectContaining({
          thread_id: "agent:uuid-only",
        }),
        streamMode: ["custom", "updates"],
      }),
    );
  });

  it("rebuilds agent per stream with clarification thread id", async () => {
    const { getToolsForMode } = await import("../../electron/agent/agentflowPromptContext");
    const events = service.streamEvents("t-clarify", "hello", { mode: "ask" });
    await events.next();

    expect(getToolsForMode).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "ask",
        clarificationThreadId: "ask:t-clarify",
      }),
    );
  });
});
