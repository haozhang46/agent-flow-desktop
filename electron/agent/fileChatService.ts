import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { buildStreamingReactAgent } from "./reactGraph";
import { streamChunkText } from "./streamChunk";
import { getProjectCheckpointer } from "../chatMemory/checkpointer";
import type { StepEvent } from "../executors/types";
import { AgentStreamFilter } from "./agentStreamFilter";
import { buildFileChatLangChainTools } from "./fileChatTools";
import { buildFileChatSystemPrompt } from "./prompt";
import { getRecursionLimit } from "./recursionLimit";
import { streamCompiledAgent, type AgentGraphStreamEvent } from "./streamAgentGraph";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

export type FileChatRequest = {
  workspaceRoot: string;
  projectRoot: string;
  paths: string[];
  message: string;
  skills?: string[];
  stepId?: string;
  checkpointThreadId: string;
  apiKey: string;
};

type StreamEvent = AgentGraphStreamEvent;

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

export async function* streamFileChat(req: FileChatRequest): AsyncIterable<StepEvent> {
  if (!req.paths.length) {
    yield { type: "message", content: "Error: paths required" };
    yield { type: "done" };
    return;
  }

  const systemPrompt = await buildFileChatSystemPrompt(req.paths, req.skills ?? []);
  const model = new ChatOpenAI({
    model: "deepseek-chat",
    apiKey: req.apiKey,
    streaming: true,
    configuration: { baseURL: DEEPSEEK_BASE_URL },
  });

  const tools = buildFileChatLangChainTools({
    workspaceRoot: req.workspaceRoot,
    allowedPaths: req.paths,
    clarificationThreadId: req.checkpointThreadId,
  });

  const checkpointer = getProjectCheckpointer(req.projectRoot);
  const agent = buildStreamingReactAgent({
    llm: model,
    tools,
    checkpointer,
  });

  yield* mapStreamToStepEvents(
    streamCompiledAgent(
      agent,
      {
        messages: [
          new SystemMessage(systemPrompt),
          new HumanMessage(req.message.trim() || "Help me with the attached file(s)."),
        ],
      },
      {
        configurable: { thread_id: req.checkpointThreadId },
        recursionLimit: getRecursionLimit(),
      },
    ),
  );
}
