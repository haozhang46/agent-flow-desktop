import { type BaseMessage } from "@langchain/core/messages";
import type { CompiledStateGraph } from "@langchain/langgraph";
import { streamChunkText } from "./streamChunk";

export type AgentGraphStreamEvent = {
  event: string;
  data?: Record<string, unknown>;
  name?: string;
  run_id?: string;
};

type MessagesState = { messages: BaseMessage[] };

export async function* streamCompiledAgent(
  agent: CompiledStateGraph<MessagesState, Partial<MessagesState>>,
  input: { messages: BaseMessage[] },
  config: Record<string, unknown>,
): AsyncGenerator<AgentGraphStreamEvent> {
  const stream = await agent.stream(input, {
    ...config,
    streamMode: ["custom", "updates"],
  });

  const seenToolStarts = new Set<string>();

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
}
