import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { buildStreamingReactAgent } from "../agent/reactGraph";
import { streamChunkText } from "../agent/streamChunk";
import { buildDesktopLangChainTools } from "../agent/tools";
import { getRecursionLimit } from "../agent/recursionLimit";
import { streamCompiledAgent } from "../agent/streamAgentGraph";
import { AgentStreamFilter } from "../agent/agentStreamFilter";
import { getProjectCheckpointer } from "../chatMemory/checkpointer";
import type { StepContext, StepEvent, StepExecutor } from "./types";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

type StreamEvent = {
  event?: string;
  data?: { chunk?: { content?: string } };
  run_id?: string;
  name?: string;
};

function buildMessages(ctx: StepContext) {
  const messages = [];
  if (ctx.systemPrompt) {
    messages.push(new SystemMessage(ctx.systemPrompt));
  }
  messages.push(new HumanMessage(ctx.userPrompt));
  return messages;
}

async function* mapStreamToStepEvents(
  stream: AsyncIterable<StreamEvent>,
): AsyncIterable<StepEvent> {
  const streamFilter = new AgentStreamFilter("agent");
  for await (const event of stream) {
    if (event.event === "on_chat_model_stream") {
      const content = streamChunkText(event.data?.chunk?.content);
      if (content) {
        for (const action of streamFilter.onModelChunk(content)) {
          yield { type: "message", content: action.content };
        }
      }
    } else if (event.event === "on_tool_start") {
      streamFilter.onToolStart();
      yield {
        type: "tool_start",
        name: event.name ?? "",
        call_id: event.run_id ?? "",
      };
    } else if (event.event === "on_tool_end") {
      const raw = event.data?.output;
      let output: string | undefined;
      if (typeof raw === "string") {
        output = raw;
      } else if (raw && typeof raw === "object" && "content" in raw) {
        const content = (raw as { content?: unknown }).content;
        output = typeof content === "string" ? content : JSON.stringify(content);
      } else if (raw !== undefined) {
        output = JSON.stringify(raw);
      }
      yield {
        type: "tool_end",
        name: event.name ?? "",
        call_id: event.run_id ?? "",
        ok: true,
        output,
      };
    }
  }
  for (const action of streamFilter.finish()) {
    yield { type: "message", content: action.content };
  }
  yield { type: "done" };
}

export const deepseekExecutor: StepExecutor = {
  id: "deepseek",
  async *run(ctx: StepContext) {
    const model = new ChatOpenAI({
      model: "deepseek-chat",
      apiKey: ctx.apiKey,
      streaming: true,
      configuration: { baseURL: DEEPSEEK_BASE_URL },
    });

    const tools = buildDesktopLangChainTools({ workspaceRoot: ctx.workspaceRoot });
    const checkpointer = getProjectCheckpointer(ctx.workspaceRoot);
    const agent = buildStreamingReactAgent({
      llm: model,
      tools,
      checkpointer,
    });

    yield* mapStreamToStepEvents(
      streamCompiledAgent(
        agent,
        { messages: buildMessages(ctx) },
        {
          configurable: { thread_id: `workflow:${ctx.threadId}:${ctx.stepId}` },
          recursionLimit: getRecursionLimit(),
        },
      ),
    );
  },
};
