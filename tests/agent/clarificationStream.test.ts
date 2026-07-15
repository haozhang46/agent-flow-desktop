import { describe, it, expect, vi, beforeEach } from "vitest";
import { GraphInterrupt } from "@langchain/langgraph";
import { ClarificationService } from "../../electron/agent/clarificationService";
import type { PendingClarification } from "../../electron/agent/clarificationTypes";
import {
  abandonInterruptedClarification,
  clarificationEventFromPending,
  prepareResume,
  streamCompiledAgent,
} from "../../electron/agent/streamAgentGraph";

const args = {
  question: "Need web search?",
  options: [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" },
  ],
  allow_multiple: false,
  allow_free_text: true,
};

function pendingFixture(
  overrides: Partial<PendingClarification> = {},
): PendingClarification {
  return {
    threadId: "agent:t1",
    clarificationId: "call_1",
    status: "pending",
    question: args.question,
    options: args.options,
    allow_multiple: false,
    allow_free_text: true,
    ...overrides,
  };
}

describe("clarificationEventFromPending", () => {
  it("builds clarification SSE payload from pending", () => {
    const pending = pendingFixture();
    const event = clarificationEventFromPending("agent:t1", pending);
    expect(event).toEqual({
      event: "clarification",
      data: {
        clarification_id: "call_1",
        thread_id: "agent:t1",
        question: "Need web search?",
        options: args.options,
        allow_multiple: false,
        allow_free_text: true,
        status: "pending",
      },
    });
  });
});

describe("prepareResume", () => {
  let svc: ClarificationService;

  beforeEach(() => {
    svc = new ClarificationService();
  });

  it("returns 404 when clarification is missing", () => {
    const r = prepareResume(svc, "agent:t1", "missing", {
      selected_option_ids: ["yes"],
    });
    expect(r).toEqual({ ok: false, status: 404, detail: expect.any(String) });
  });

  it("returns 409 when already answered", () => {
    svc.createPending("agent:t1", "call_1", args);
    svc.markAnswered("agent:t1", "call_1");
    const r = prepareResume(svc, "agent:t1", "call_1", {
      selected_option_ids: ["yes"],
    });
    expect(r).toEqual({ ok: false, status: 409, detail: expect.any(String) });
  });

  it("returns 400 when answer is invalid", () => {
    svc.createPending("agent:t1", "call_1", args);
    const r = prepareResume(svc, "agent:t1", "call_1", {
      selected_option_ids: ["maybe"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("returns serialized resume value without marking answered", () => {
    svc.createPending("agent:t1", "call_1", args);
    const r = prepareResume(svc, "agent:t1", "call_1", {
      selected_option_ids: ["yes"],
      free_text: "today",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(svc.getPending("agent:t1", "call_1")?.status).toBe("pending");
    const parsed = JSON.parse(r.serialized) as {
      selected_option_ids: string[];
      labels: string[];
      free_text?: string;
    };
    expect(parsed.selected_option_ids).toEqual(["yes"]);
    expect(parsed.labels).toEqual(["Yes"]);
    expect(parsed.free_text).toBe("today");
  });
});

describe("streamCompiledAgent interrupt detection", () => {
  it("emits clarification + awaiting_clarification from __interrupt__ updates", async () => {
    const svc = new ClarificationService();
    svc.createPending("agent:t1", "call_1", args);

    const agent = {
      stream: vi.fn(async function* () {
        yield [
          "updates",
          {
            __interrupt__: [
              {
                value: { clarification_id: "call_1", ...args },
                when: "during",
              },
            ],
          },
        ];
        yield ["custom", "should-not-emit"];
      }),
    };

    const events = [];
    for await (const ev of streamCompiledAgent(
      agent as never,
      { messages: [] },
      {
        configurable: { thread_id: "agent:t1" },
        clarificationService: svc,
      },
    )) {
      events.push(ev);
    }

    expect(events).toEqual([
      clarificationEventFromPending("agent:t1", pendingFixture()),
      { event: "awaiting_clarification" },
    ]);
  });

  it("emits clarification when GraphInterrupt is thrown", async () => {
    const svc = new ClarificationService();
    svc.createPending("agent:t1", "call_1", args);

    const agent = {
      stream: vi.fn(async function* () {
        throw new GraphInterrupt([
          { value: { clarification_id: "call_1", ...args }, when: "during" },
        ]);
        yield ["custom", "unreachable"];
      }),
    };

    const events = [];
    for await (const ev of streamCompiledAgent(
      agent as never,
      { messages: [] },
      {
        configurable: { thread_id: "agent:t1" },
        clarificationService: svc,
      },
    )) {
      events.push(ev);
    }

    expect(events).toEqual([
      clarificationEventFromPending("agent:t1", pendingFixture()),
      { event: "awaiting_clarification" },
    ]);
  });

  it("emits error stream chunk when interrupt pending cannot be resolved", async () => {
    const svc = new ClarificationService();

    const agent = {
      stream: vi.fn(async function* () {
        yield [
          "updates",
          {
            __interrupt__: [
              {
                value: { clarification_id: "orphan" },
                when: "during",
              },
            ],
          },
        ];
      }),
    };

    const events = [];
    for await (const ev of streamCompiledAgent(
      agent as never,
      { messages: [] },
      {
        configurable: { thread_id: "agent:t1" },
        clarificationService: svc,
      },
    )) {
      events.push(ev);
    }

    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe("on_chat_model_stream");
    expect(String((events[0]?.data as { chunk?: { content?: string } })?.chunk?.content)).toMatch(
      /could not be resolved/i,
    );
  });
});

describe("abandonInterruptedClarification", () => {
  it("resumes with cancelled payload when checkpoint has interrupts", async () => {
    const streamFn = vi.fn(async function* () {
      yield ["updates", {}];
    });
    const agent = {
      getState: vi.fn(async () => ({
        tasks: [{ interrupts: [{ value: { clarification_id: "c1" } }] }],
      })),
      stream: streamFn,
    };

    await abandonInterruptedClarification(agent, {
      configurable: { thread_id: "agent:t1" },
    });

    expect(streamFn).toHaveBeenCalledTimes(1);
    const [input, config] = streamFn.mock.calls[0]!;
    expect(input).toMatchObject({ resume: JSON.stringify({ cancelled: true }) });
    expect(config).toMatchObject({
      configurable: { thread_id: "agent:t1" },
      streamMode: ["updates"],
    });
  });

  it("does nothing when there are no interrupts", async () => {
    const streamFn = vi.fn(async function* () {
      yield ["updates", {}];
    });
    const agent = {
      getState: vi.fn(async () => ({ tasks: [] })),
      stream: streamFn,
    };

    await abandonInterruptedClarification(agent, {
      configurable: { thread_id: "agent:t1" },
    });

    expect(streamFn).not.toHaveBeenCalled();
  });

  it("swallows errors from getState/stream", async () => {
    const agent = {
      getState: vi.fn(async () => {
        throw new Error("no checkpoint");
      }),
      stream: vi.fn(),
    };

    await expect(
      abandonInterruptedClarification(agent, {
        configurable: { thread_id: "agent:t1" },
      }),
    ).resolves.toBeUndefined();
  });
});

describe("AgentService.streamEvents cancel + checkpoint thread id", () => {
  const streamMock = vi.fn(async function* () {
    yield ["custom", "hi"];
  });

  beforeEach(() => {
    vi.resetModules();
    streamMock.mockClear();
    streamMock.mockImplementation(async function* () {
      yield ["custom", "hi"];
    });
  });

  it("cancels prior pending on checkpoint thread id when stream starts", async () => {
    vi.doMock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));
    vi.doMock("../../electron/agent/reactGraph", () => ({
      buildStreamingReactAgent: vi.fn(() => ({ stream: streamMock })),
    }));
    vi.doMock("../../electron/chatMemory/checkpointer", () => ({
      getProjectCheckpointer: vi.fn(),
    }));
    vi.doMock("../../electron/agent/agentflowPromptContext", () => ({
      getToolsForMode: vi.fn(() => []),
    }));
    vi.doMock("../../electron/agent/prompt", () => ({
      buildChatSystemPrompt: vi.fn(async () => "system"),
    }));

    const { clarificationService } = await import(
      "../../electron/agent/clarificationService"
    );
    const { AgentService } = await import("../../electron/agent/agentService");
    const { getToolsForMode } = await import(
      "../../electron/agent/agentflowPromptContext"
    );

    clarificationService.createPending("agent:uuid-only", "call_old", args);

    const service = new AgentService();
    service.configure({ apiKey: "test-key", workspaceRoot: "/tmp/ws" });

    const events = service.streamEvents("uuid-only", "hello", { mode: "agent" });
    await events.next();

    expect(clarificationService.getPendingForThread("agent:uuid-only")).toBeUndefined();
    expect(getToolsForMode).toHaveBeenCalledWith(
      expect.objectContaining({
        clarificationThreadId: "agent:uuid-only",
      }),
    );
  });

  it("resumeClarification throws ClarificationResumeError with 404 when missing", async () => {
    vi.doMock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));
    vi.doMock("../../electron/agent/reactGraph", () => ({
      buildStreamingReactAgent: vi.fn(() => ({ stream: streamMock })),
    }));
    vi.doMock("../../electron/chatMemory/checkpointer", () => ({
      getProjectCheckpointer: vi.fn(),
    }));
    vi.doMock("../../electron/agent/agentflowPromptContext", () => ({
      getToolsForMode: vi.fn(() => []),
    }));
    vi.doMock("../../electron/agent/prompt", () => ({
      buildChatSystemPrompt: vi.fn(async () => "system"),
    }));

    const { AgentService, ClarificationResumeError } = await import(
      "../../electron/agent/agentService"
    );
    const service = new AgentService();
    service.configure({ apiKey: "test-key", workspaceRoot: "/tmp/ws" });

    const gen = service.resumeClarification(
      "uuid-only",
      "missing",
      { selected_option_ids: ["yes"] },
      { mode: "agent" },
    );
    await expect(gen.next()).rejects.toMatchObject({
      name: "ClarificationResumeError",
      status: 404,
    });
    expect(ClarificationResumeError).toBeDefined();
  });
});
