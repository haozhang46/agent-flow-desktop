import { EventEmitter } from "node:events";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getExecutor } from "../../electron/executors/registry";
import type { StepContext } from "../../electron/executors/types";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn(),
}));

vi.mock("@langchain/langgraph", () => ({
  MemorySaver: vi.fn(),
}));

vi.mock("../../electron/chatMemory/checkpointer", () => ({
  getProjectCheckpointer: vi.fn(() => ({})),
}));

vi.mock("../../electron/agent/reactGraph", () => ({
  buildStreamingReactAgent: vi.fn(() => ({
    stream: vi.fn(async function* () {
      yield ["custom", "hello from deepseek"];
    }),
  })),
}));

vi.mock("../../electron/agent/tools", () => ({
  buildDesktopLangChainTools: vi.fn(() => []),
}));

const baseContext: StepContext = {
  workspaceRoot: "/tmp/workspace",
  stepId: "step-1",
  systemPrompt: "You are a helpful agent.",
  userPrompt: "Do the thing.",
  threadId: "thread-1",
  apiKey: "test-key",
};

describe("executor registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns deepseek and claude-code executors", () => {
    expect(getExecutor("deepseek").id).toBe("deepseek");
    expect(getExecutor("claude-code").id).toBe("claude-code");
  });

  it("throws for unknown executor", () => {
    expect(() => getExecutor("unknown")).toThrow("unknown executor: unknown");
  });
});

describe("deepseek executor", () => {
  it("maps stream events to StepEvent", async () => {
    const events = [];

    for await (const event of getExecutor("deepseek").run(baseContext)) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: "message", content: "hello from deepseek" });
    expect(events.at(-1)).toEqual({ type: "done" });
  });
});

describe("claude-code executor", () => {
  it("streams stdout lines and emits done", async () => {
    const { spawn } = await import("node:child_process");
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const mockChild = Object.assign(new EventEmitter(), { stdout, stderr });
    vi.mocked(spawn).mockReturnValue(mockChild as never);

    const events = [];
    const collect = (async () => {
      for await (const event of getExecutor("claude-code").run(baseContext)) {
        events.push(event);
      }
    })();

    stdout.emit("data", Buffer.from("line1\nline2\n"));
    mockChild.emit("close", 0);
    await collect;

    expect(events.some((e) => e.type === "message" && e.content.includes("line1"))).toBe(true);
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(spawn).toHaveBeenCalledWith(
      "claude",
      ["--print", baseContext.userPrompt],
      expect.objectContaining({ cwd: baseContext.workspaceRoot }),
    );
  });

  it("emits error message when claude is not found", async () => {
    const { spawn } = await import("node:child_process");
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const mockChild = Object.assign(new EventEmitter(), { stdout, stderr });
    vi.mocked(spawn).mockReturnValue(mockChild as never);

    const events = [];
    const collect = (async () => {
      for await (const event of getExecutor("claude-code").run(baseContext)) {
        events.push(event);
      }
    })();

    mockChild.emit("error", Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" }));
    await collect;

    expect(events[0]).toEqual({
      type: "message",
      content: "Error: spawn claude ENOENT",
    });
    expect(events.at(-1)).toEqual({ type: "done" });
  });
});
