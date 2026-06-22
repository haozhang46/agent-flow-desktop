import type { ChatResponseChunk } from "@agent-flow/shared-ui";
import type { SseEvent } from "@agent-flow/shared-ui";
import {
  fetchSkillCatalog,
  openChatStream,
  type AgentChatRequest,
} from "./chatTransport";
import type { ChatMode } from "./useChatThreadMeta";

export type ChatStreamOptions = Pick<
  AgentChatRequest,
  "mode" | "skills" | "workflowId" | "stepId"
>;

/** @deprecated Prefer `useChatStream()` */
export function useLocalChat() {
  async function* streamChatEvents(
    threadId: string,
    message: string,
    options: ChatStreamOptions,
  ): AsyncGenerator<SseEvent> {
    yield* await openChatStream({
      kind: "agent",
      message,
      checkpointThreadId: threadId,
      ...options,
    });
  }

  async function* streamChat(
    threadId: string,
    message: string,
    options: ChatStreamOptions = { mode: "agent" },
  ): AsyncGenerator<ChatResponseChunk> {
    for await (const event of streamChatEvents(threadId, message, options)) {
      if (event.type === "message") {
        yield event.chunk;
      }
    }
  }

  return { streamChat, streamChatEvents, fetchSkillCatalog };
}
