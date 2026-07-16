import { type BaseMessage } from "@langchain/core/messages";
import {
  Command,
  isGraphInterrupt,
  type CompiledStateGraph,
  type Interrupt,
} from "@langchain/langgraph";

/** LangGraph reserved interrupt channel (not always re-exported from package root). */
const INTERRUPT = "__interrupt__";
import {
  clarificationService as defaultClarificationService,
  type ClarificationService,
} from "./clarificationService";
import type {
  ClarificationAnswer,
  PendingClarification,
} from "./clarificationTypes";
import { streamChunkText } from "./streamChunk";

export type AgentGraphStreamEvent = {
  event: string;
  data?: Record<string, unknown>;
  name?: string;
  run_id?: string;
};

type MessagesState = { messages: BaseMessage[] };

export type StreamCompiledAgentConfig = Record<string, unknown> & {
  configurable?: { thread_id?: string; [key: string]: unknown };
  clarificationService?: ClarificationService;
};

export type PrepareResumeResult =
  | { ok: true; serialized: string; pending: PendingClarification }
  | { ok: false; status: 400 | 404 | 409; detail: string };

export function clarificationEventFromPending(
  threadId: string,
  pending: PendingClarification,
): { event: "clarification"; data: Record<string, unknown> } {
  return {
    event: "clarification",
    data: {
      clarification_id: pending.clarificationId,
      thread_id: threadId,
      question: pending.question,
      options: pending.options,
      allow_multiple: pending.allow_multiple,
      allow_free_text: pending.allow_free_text,
      status: "pending",
    },
  };
}

export function prepareResume(
  service: ClarificationService,
  threadId: string,
  clarificationId: string,
  answer: ClarificationAnswer,
): PrepareResumeResult {
  const pending = service.getPending(threadId, clarificationId);
  if (!pending || pending.status === "cancelled") {
    return { ok: false, status: 404, detail: "Clarification not found" };
  }
  if (pending.status === "answered") {
    return { ok: false, status: 409, detail: "Clarification already answered" };
  }

  const validation = service.validateAnswer(pending, answer);
  if (!validation.ok) {
    return { ok: false, status: validation.status, detail: validation.detail };
  }

  // Keep pending until the resume stream completes successfully so mid-stream
  // failures can retry without a 409.
  const serialized = service.serializeAnswerForTool(pending, answer);
  return { ok: true, serialized, pending };
}

function resolvePendingFromInterrupts(
  threadId: string,
  interrupts: Interrupt[],
  service: ClarificationService,
): PendingClarification | undefined {
  const fromService = service.getPendingForThread(threadId);
  if (fromService) return fromService;

  for (const item of interrupts) {
    const value = item?.value;
    if (!value || typeof value !== "object") continue;
    const clarificationId = (value as { clarification_id?: unknown }).clarification_id;
    if (typeof clarificationId !== "string") continue;
    const existing = service.getPending(threadId, clarificationId);
    if (existing) return existing;

    const question = (value as { question?: unknown }).question;
    const options = (value as { options?: unknown }).options;
    if (typeof question !== "string" || !Array.isArray(options)) continue;

    return {
      threadId,
      clarificationId,
      status: "pending",
      question,
      options: options as PendingClarification["options"],
      allow_multiple: Boolean((value as { allow_multiple?: unknown }).allow_multiple),
      allow_free_text:
        (value as { allow_free_text?: unknown }).allow_free_text !== false,
    };
  }
  return undefined;
}

function interruptsFromUpdate(payload: unknown): Interrupt[] | null {
  if (!payload || typeof payload !== "object") return null;
  if (!(INTERRUPT in payload)) return null;
  const raw = (payload as Record<string, unknown>)[INTERRUPT];
  return Array.isArray(raw) ? (raw as Interrupt[]) : null;
}

function* emitClarificationFromInterrupts(
  threadId: string,
  interrupts: Interrupt[],
  service: ClarificationService,
): Generator<AgentGraphStreamEvent> {
  const pending = resolvePendingFromInterrupts(threadId, interrupts, service);
  if (!pending) {
    yield {
      event: "on_chat_model_stream",
      data: {
        chunk: {
          content:
            "Error: clarification interrupt could not be resolved (missing pending state)",
        },
      },
    };
    return;
  }
  yield clarificationEventFromPending(threadId, pending);
  yield { event: "awaiting_clarification" };
}

export function buildResumeCommand(serialized: string): Command {
  return new Command({ resume: serialized });
}

const CANCELLED_RESUME = JSON.stringify({ cancelled: true });

/** Minimal agent surface used to clear a leftover interrupt after cancel. */
export type InterruptibleAgent = {
  getState: (config: {
    configurable?: { thread_id?: string; [key: string]: unknown };
  }) => Promise<{ tasks?: Array<{ interrupts?: unknown[] }> }>;
  stream: (
    input: unknown,
    config: unknown,
  ) => Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>;
};

/**
 * Best-effort: if the checkpoint is still interrupted after cancelThread,
 * resume with a cancelled payload so a new HumanMessage turn can proceed.
 * Swallows errors when there is nothing to resume.
 */
export async function abandonInterruptedClarification(
  agent: InterruptibleAgent,
  config: { configurable?: { thread_id?: string; [key: string]: unknown } },
): Promise<void> {
  try {
    const state = await agent.getState(config);
    const interrupted = (state.tasks ?? []).some(
      (task) => Array.isArray(task.interrupts) && task.interrupts.length > 0,
    );
    if (!interrupted) return;

    const stream = await agent.stream(buildResumeCommand(CANCELLED_RESUME), {
      ...config,
      streamMode: ["updates"],
    });
    for await (const _ of stream) {
      // drain resume so the interrupt is cleared
    }
  } catch {
    // nothing to resume, or resume failed — new turn may still proceed
  }
}

export async function* streamCompiledAgent(
  agent: CompiledStateGraph<MessagesState, Partial<MessagesState>>,
  input: { messages: BaseMessage[] } | Command,
  config: StreamCompiledAgentConfig,
): AsyncGenerator<AgentGraphStreamEvent> {
  const threadId =
    typeof config.configurable?.thread_id === "string"
      ? config.configurable.thread_id
      : "";
  const service = config.clarificationService ?? defaultClarificationService;

  const { clarificationService: _omit, ...streamConfig } = config;

  let stream: AsyncIterable<unknown>;
  try {
    stream = await agent.stream(input as { messages: BaseMessage[] }, {
      ...streamConfig,
      streamMode: ["custom", "updates"],
    });
  } catch (err) {
    if (isGraphInterrupt(err) && threadId) {
      yield* emitClarificationFromInterrupts(threadId, err.interrupts ?? [], service);
      return;
    }
    throw err;
  }

  const seenToolStarts = new Set<string>();

  try {
    for await (const raw of stream) {
      if (!Array.isArray(raw) || raw.length !== 2) continue;
      const [mode, payload] = raw as [string, unknown];

      if (mode === "custom") {
        const text =
          typeof payload === "string" ? payload : streamChunkText(payload);
        if (text) {
          yield { event: "on_chat_model_stream", data: { chunk: { content: text } } };
        }
        continue;
      }

      if (mode !== "updates" || !payload || typeof payload !== "object") continue;

      const interrupts = interruptsFromUpdate(payload);
      if (interrupts && threadId) {
        yield* emitClarificationFromInterrupts(threadId, interrupts, service);
        return;
      }

      const update = payload as Record<string, { messages?: BaseMessage[] } | undefined>;

      const agentMessages = update.agent?.messages ?? [];
      for (const msg of agentMessages) {
        const toolCalls =
          "tool_calls" in msg && Array.isArray(msg.tool_calls)
            ? (msg.tool_calls as Array<{ id?: string; name?: string }>)
            : [];
        for (const call of toolCalls) {
          const runId = call.id ?? `${call.name}:${seenToolStarts.size}`;
          if (seenToolStarts.has(runId)) continue;
          seenToolStarts.add(runId);
          yield { event: "on_tool_start", name: call.name, run_id: runId };
        }
      }

      const toolMessages = update.tools?.messages ?? [];
      for (const msg of toolMessages) {
        if (!("tool_call_id" in msg)) continue;
        yield {
          event: "on_tool_end",
          name: msg.name ?? "",
          run_id: msg.tool_call_id ?? "",
          data: { output: msg.content },
        };
      }
    }
  } catch (err) {
    if (isGraphInterrupt(err) && threadId) {
      yield* emitClarificationFromInterrupts(threadId, err.interrupts ?? [], service);
      return;
    }
    throw err;
  }
}

export class ClarificationResumeError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(status: 400 | 404 | 409, detail: string) {
    super(detail);
    this.name = "ClarificationResumeError";
    this.status = status;
  }
}