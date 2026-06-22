import { describe, it, expect, vi } from "vitest";
import { buildFileChatSystemPrompt } from "../../electron/agent/prompt";

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn(),
}));

vi.mock("../../electron/agent/reactGraph", () => ({
  buildStreamingReactAgent: vi.fn(() => ({
    stream: vi.fn(async function* () {
      yield ["custom", "file chat reply"];
    }),
  })),
}));

vi.mock("../../electron/chatMemory/checkpointer", () => ({
  getProjectCheckpointer: vi.fn(() => ({})),
}));

vi.mock("../../electron/agent/fileChatTools", () => ({
  buildFileChatLangChainTools: vi.fn(() => []),
}));

import { streamFileChat } from "../../electron/agent/fileChatService";

describe("buildFileChatSystemPrompt", () => {
  it("includes file mode preamble and allowed paths", async () => {
    const prompt = await buildFileChatSystemPrompt(["AGENTS.md", "CLAUDE.md"], []);
    expect(prompt).toContain("only read and write");
    expect(prompt).toContain("- AGENTS.md");
    expect(prompt).toContain("- CLAUDE.md");
  });
});

describe("streamFileChat", () => {
  it("uses projectRoot checkpointer and checkpointThreadId", async () => {
    const events = [];
    for await (const event of streamFileChat({
      workspaceRoot: "/tmp/workspace",
      projectRoot: "/tmp/workspace",
      paths: ["AGENTS.md"],
      message: "help",
      checkpointThreadId: "file:wf-1:init:thread-1",
      apiKey: "test-key",
    })) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: "message", content: "file chat reply" });
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("returns error when paths empty", async () => {
    const events = [];
    for await (const event of streamFileChat({
      workspaceRoot: "/tmp/workspace",
      projectRoot: "/tmp/workspace",
      paths: [],
      message: "help",
      checkpointThreadId: "file:wf-1:init:thread-1",
      apiKey: "test-key",
    })) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: "message", content: "Error: paths required" });
    expect(events.at(-1)).toEqual({ type: "done" });
  });
});
