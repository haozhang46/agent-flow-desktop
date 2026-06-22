import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn(),
}));

vi.mock("../../electron/agent/reactGraph", () => ({
  buildStreamingReactAgent: vi.fn(() => ({
    stream: vi.fn(async function* () {
      yield ["custom", "hi"];
    }),
  })),
}));

vi.mock("../../electron/chatMemory/checkpointer", () => ({
  getProjectCheckpointer: vi.fn(),
}));

vi.mock("../../electron/agent/tools", () => ({
  buildDesktopLangChainTools: vi.fn(() => []),
  buildReadOnlyDesktopTools: vi.fn(() => []),
}));

vi.mock("../../electron/agent/prompt", () => ({
  buildChatSystemPrompt: vi.fn(async () => "system"),
}));

import { AgentService } from "../../electron/agent/agentService";

describe("AgentService.resolveCheckpointThreadId", () => {
  let service: AgentService;

  beforeEach(() => {
    service = new AgentService();
    service.configure({
      apiKey: "test-key",
      workspaceRoot: "/tmp/ws",
    });
  });

  it("uses thread_id verbatim when it contains a colon", async () => {
    const agent = (service as unknown as { agents: Map<string, { stream: ReturnType<typeof vi.fn> }> }).agents.get("agent");
    expect(agent).toBeDefined();

    const events = service.streamEvents("free:wf-1:thread-abc", "hello", { mode: "agent" });
    await events.next();

    expect(agent!.stream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        configurable: { thread_id: "free:wf-1:thread-abc" },
        streamMode: ["custom", "updates"],
      }),
    );
  });

  it("prefixes mode for bare uuid thread ids", async () => {
    const agent = (service as unknown as { agents: Map<string, { stream: ReturnType<typeof vi.fn> }> }).agents.get("agent");
    expect(agent).toBeDefined();

    const events = service.streamEvents("uuid-only", "hello", { mode: "agent" });
    await events.next();

    expect(agent!.stream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        configurable: { thread_id: "agent:uuid-only" },
        streamMode: ["custom", "updates"],
      }),
    );
  });
});
