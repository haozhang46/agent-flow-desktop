import { describe, it, expect, vi } from "vitest";
import { assistantHasActivity, consumeChatStream, shouldShowThinking } from "../../src/composables/useChatStream";
import type { ClarificationSsePayload, SseEvent } from "@agent-flow/shared-ui";

async function* sseEvents(
  events: Array<
    | { type: "message"; content: string }
    | { type: "plan_ready"; content: string }
    | { type: "tool_start"; name: string }
    | { type: "tool_end"; name: string; output?: string }
    | { type: "clarification"; clarification: ClarificationSsePayload }
    | { type: "done"; awaiting_clarification?: boolean }
  >,
): AsyncGenerator<SseEvent> {
  for (const event of events) {
    if (event.type === "message") {
      yield { type: "message" as const, chunk: { content: event.content } };
    } else if (event.type === "plan_ready") {
      yield { type: "plan_ready" as const, content: event.content };
    } else if (event.type === "tool_start") {
      yield { type: "tool_start" as const, event: { name: event.name, call_id: "1" } };
    } else if (event.type === "tool_end") {
      yield {
        type: "tool_end" as const,
        event: { name: event.name, call_id: "1", ok: true, output: event.output },
      };
    } else if (event.type === "clarification") {
      yield { type: "clarification" as const, clarification: event.clarification };
    } else {
      yield event.awaiting_clarification
        ? { type: "done" as const, awaiting_clarification: true }
        : { type: "done" as const };
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

  it("forwards clarification in ask mode and returns awaiting flag", async () => {
    const memory = {
      addAssistantChunk: vi.fn(),
      beginAssistantReply: vi.fn(),
      applyToolStart: vi.fn(),
      applyToolEnd: vi.fn(),
    };
    const onClarification = vi.fn();
    const clarification: ClarificationSsePayload = {
      clarification_id: "call_1",
      thread_id: "ask:t1",
      question: "Need network?",
      options: [{ id: "yes", label: "Yes" }],
      allow_multiple: false,
      allow_free_text: true,
      status: "pending",
    };

    const result = await consumeChatStream(
      sseEvents([
        { type: "clarification", clarification },
        { type: "done", awaiting_clarification: true },
      ]),
      {
        memory,
        mode: "ask",
        onClarification,
      },
    );

    expect(onClarification).toHaveBeenCalledWith(clarification);
    expect(result).toEqual({ awaitingClarification: true });
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
