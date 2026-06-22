import { describe, it, expect, vi } from "vitest";
import { assistantHasActivity, consumeChatStream, shouldShowThinking } from "../../src/composables/useChatStream";

async function* sseEvents(
  events: Array<
    | { type: "message"; content: string }
    | { type: "plan_ready"; content: string }
    | { type: "tool_start"; name: string }
    | { type: "tool_end"; name: string; output?: string }
  >,
) {
  for (const event of events) {
    if (event.type === "message") {
      yield { type: "message" as const, chunk: { content: event.content } };
    } else if (event.type === "plan_ready") {
      yield { type: "plan_ready" as const, content: event.content };
    } else if (event.type === "tool_start") {
      yield { type: "tool_start" as const, event: { name: event.name, call_id: "1" } };
    } else {
      yield {
        type: "tool_end" as const,
        event: { name: event.name, call_id: "1", ok: true, output: event.output },
      };
    }
  }
}

describe("consumeChatStream", () => {
  it("streams tokens to memory in agent mode", async () => {
    const memory = {
      addAssistantChunk: vi.fn(),
      beginAssistantReply: vi.fn(),
      applyToolStart: vi.fn(),
      applyToolEnd: vi.fn(),
    };

    await consumeChatStream(sseEvents([{ type: "message", content: "hi" }]), {
      memory,
      mode: "agent",
    });

    expect(memory.addAssistantChunk).toHaveBeenCalledWith("hi", undefined);
  });

  it("buffers plan mode tokens and emits plan_ready", async () => {
    const memory = {
      addAssistantChunk: vi.fn(),
      beginAssistantReply: vi.fn(),
      applyToolStart: vi.fn(),
      applyToolEnd: vi.fn(),
    };
    const onPlanReady = vi.fn();

    await consumeChatStream(
      sseEvents([
        { type: "message", content: "draft" },
        { type: "plan_ready", content: "# Plan" },
      ]),
      {
        memory,
        mode: "plan",
        onPlanReady,
      },
    );

    expect(memory.addAssistantChunk).not.toHaveBeenCalled();
    expect(onPlanReady).toHaveBeenCalledWith("# Plan");
  });

  it("forwards tool events in agent mode", async () => {
    const memory = {
      addAssistantChunk: vi.fn(),
      beginAssistantReply: vi.fn(),
      applyToolStart: vi.fn(),
      applyToolEnd: vi.fn(),
    };

    await consumeChatStream(
      sseEvents([
        { type: "tool_start", name: "read_file" },
        { type: "tool_end", name: "read_file", output: "ok" },
      ]),
      {
        memory,
        mode: "agent",
      },
    );

    expect(memory.applyToolStart).toHaveBeenCalled();
    expect(memory.applyToolEnd).toHaveBeenCalled();
  });
});

describe("shouldShowThinking", () => {
  it("hides after assistant shell is created", () => {
    expect(shouldShowThinking([{ role: "user", content: "hi" }], true)).toBe(true);
    expect(
      shouldShowThinking(
        [{ role: "user", content: "hi" }, { role: "assistant", content: "" }],
        true,
      ),
    ).toBe(false);
  });

  it("tracks assistant activity for content and tools", () => {
    expect(assistantHasActivity([{ role: "assistant", content: "x" }])).toBe(true);
    expect(
      assistantHasActivity([{ role: "assistant", content: "", toolRuns: [{ name: "read_file", status: "running" }] }]),
    ).toBe(true);
  });
});
