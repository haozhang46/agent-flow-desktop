import { ref } from "vue";
import type { ChatMessage, ToolEvent, SseEvent, ClarificationSsePayload } from "@agent-flow/shared-ui";
import {
  fetchSkillCatalog,
  openChatStream,
  type ChatStreamRequest,
} from "./chatTransport";
import type { ChatMode } from "./useChatThreadMeta";
import { useClarification, type ClarificationAnswer } from "./useClarification";

export { fetchSkillCatalog, openChatStream, submitClarification } from "./chatTransport";
export type {
  AgentChatRequest,
  ChatStreamRequest,
  FileChatRequest,
  ClarificationAnswerBody,
} from "./chatTransport";
export type { ClarificationAnswer, ClarificationCardStatus } from "./useClarification";

export type ChatStreamMemory = {
  addAssistantChunk: (content: string, citations?: string[]) => void;
  beginAssistantReply: () => void;
  applyToolStart: (event: ToolEvent) => void;
  applyToolEnd: (event: ToolEvent) => void;
};

export type ConsumeChatStreamOptions = {
  memory: ChatStreamMemory;
  mode: ChatMode;
  streamMessageTokens?: boolean;
  onPlanReady?: (content: string) => void;
  onMessageChunk?: (content: string) => void;
  onToolStart?: (event: ToolEvent) => void;
  onToolEnd?: (event: ToolEvent) => void | Promise<void>;
  onClarification?: (payload: ClarificationSsePayload) => void;
};

export type ConsumeChatStreamResult = {
  awaitingClarification: boolean;
};

export async function consumeChatStream(
  stream: AsyncGenerator<SseEvent>,
  options: ConsumeChatStreamOptions,
): Promise<ConsumeChatStreamResult> {
  const streamTokens = options.streamMessageTokens ?? options.mode !== "plan";
  let awaitingClarification = false;

  for await (const event of stream) {
    if (event.type === "message") {
      const content = event.chunk.content ?? "";
      if (!content) continue;
      if (streamTokens) {
        options.memory.addAssistantChunk(content, event.chunk.citations);
      }
      options.onMessageChunk?.(content);
    } else if (event.type === "plan_ready") {
      options.onPlanReady?.(event.content);
    } else if (event.type === "clarification") {
      options.onClarification?.(event.clarification);
    } else if (event.type === "done") {
      awaitingClarification = event.awaiting_clarification === true;
    } else if (options.mode === "agent" && event.type === "tool_start") {
      options.memory.applyToolStart(event.event);
      options.onToolStart?.(event.event);
    } else if (options.mode === "agent" && event.type === "tool_end") {
      options.memory.applyToolEnd(event.event);
      await options.onToolEnd?.(event.event);
    }
  }

  return { awaitingClarification };
}

export function assistantHasActivity(
  msgs: Pick<ChatMessage, "role" | "content" | "toolRuns">[],
): boolean {
  const last = msgs[msgs.length - 1];
  return (
    last?.role === "assistant" &&
    ((last.content?.length ?? 0) > 0 || (last.toolRuns?.length ?? 0) > 0)
  );
}

/** Hide generic "Thinking…" once an assistant bubble exists (even empty, with cursor). */
export function shouldShowThinking(
  msgs: Pick<ChatMessage, "role">[],
  sending: boolean,
): boolean {
  if (!sending) return false;
  return msgs[msgs.length - 1]?.role !== "assistant";
}

export type SendChatOptions = ConsumeChatStreamOptions & {
  request: ChatStreamRequest;
  errorPrefix?: string;
  /** Called before opening a new chat stream (e.g. cancel pending clarification). */
  onBeforeSend?: () => void;
};

export function useChatStream(
  clarificationOptions?: Parameters<typeof useClarification>[0],
) {
  const sending = ref(false);
  const clarification = useClarification(clarificationOptions);

  async function send(options: SendChatOptions): Promise<{ error?: string; awaitingClarification?: boolean }> {
    options.onBeforeSend?.();
    if (clarification.pending.value) {
      clarification.cancelPending();
    }
    sending.value = true;
    try {
      const stream = await openChatStream(options.request);
      const result = await consumeChatStream(stream, {
        ...options,
        onClarification: (payload) => {
          clarification.applyClarificationEvent(payload);
          options.onClarification?.(payload);
        },
      });
      return { awaitingClarification: result.awaitingClarification };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const prefix = options.errorPrefix ?? "Error";
      options.memory.addAssistantChunk(`${prefix}: ${message}`);
      return { error: message };
    } finally {
      sending.value = false;
    }
  }

  async function answerClarification(
    answer: ClarificationAnswer,
    options: ConsumeChatStreamOptions,
  ): Promise<{ error?: string; awaitingClarification?: boolean }> {
    sending.value = true;
    try {
      const stream = await clarification.submit(answer);
      const result = await consumeChatStream(stream, {
        ...options,
        onClarification: (payload) => {
          clarification.applyClarificationEvent(payload);
          options.onClarification?.(payload);
        },
      });
      if (!result.awaitingClarification) {
        clarification.markAnswered();
      }
      return { awaitingClarification: result.awaitingClarification };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      clarification.restorePending(message);
      return { error: message };
    } finally {
      sending.value = false;
    }
  }

  return {
    sending,
    send,
    answerClarification,
    clarification,
    fetchSkillCatalog,
    assistantHasActivity,
  };
}
