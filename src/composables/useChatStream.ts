import { ref } from "vue";
import type { ChatMessage, ToolEvent, SseEvent } from "@agent-flow/shared-ui";
import {
  fetchSkillCatalog,
  openChatStream,
  type ChatStreamRequest,
} from "./chatTransport";
import type { ChatMode } from "./useChatThreadMeta";

export { fetchSkillCatalog, openChatStream } from "./chatTransport";
export type { AgentChatRequest, ChatStreamRequest, FileChatRequest } from "./chatTransport";

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
};

export async function consumeChatStream(
  stream: AsyncGenerator<SseEvent>,
  options: ConsumeChatStreamOptions,
): Promise<void> {
  const streamTokens = options.streamMessageTokens ?? options.mode !== "plan";

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
    } else if (options.mode === "agent" && event.type === "tool_start") {
      options.memory.applyToolStart(event.event);
      options.onToolStart?.(event.event);
    } else if (options.mode === "agent" && event.type === "tool_end") {
      options.memory.applyToolEnd(event.event);
      await options.onToolEnd?.(event.event);
    }
  }
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
};

export function useChatStream() {
  const sending = ref(false);

  async function send(options: SendChatOptions): Promise<{ error?: string }> {
    sending.value = true;
    try {
      const stream = await openChatStream(options.request);
      await consumeChatStream(stream, options);
      return {};
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const prefix = options.errorPrefix ?? "Error";
      options.memory.addAssistantChunk(`${prefix}: ${message}`);
      return { error: message };
    } finally {
      sending.value = false;
    }
  }

  return {
    sending,
    send,
    fetchSkillCatalog,
    assistantHasActivity,
  };
}
