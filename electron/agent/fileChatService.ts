import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { buildStreamingReactAgent } from "./reactGraph";
import { streamChunkText } from "./streamChunk";
import { getProjectCheckpointer } from "../chatMemory/checkpointer";
import type { StepEvent } from "../executors/types";
import { AgentStreamFilter } from "./agentStreamFilter";
import { clarificationService } from "./clarificationService";
import type { ClarificationAnswer } from "./clarificationTypes";
import { buildFileChatLangChainTools } from "./fileChatTools";
import { buildFileChatSystemPrompt } from "./prompt";
import { getRecursionLimit } from "./recursionLimit";
import {
  buildResumeCommand,
  ClarificationResumeError,
  prepareResume,
  streamCompiledAgent,
  type AgentGraphStreamEvent,
} from "./streamAgentGraph";
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

export type FileChatClarificationEvent = {
  type: "clarification";
  clarification_id: string;
  thread_id: string;
  question: string;
  options: Array<{ id: string; label: string }>;
  allow_multiple: boolean;
  allow_free_text: boolean;
  status: "pending";
};

export type FileChatStreamEvent =
  | StepEvent
  | FileChatClarificationEvent
  | { type: "done"; awaiting_clarification?: boolean };

type StreamEvent = AgentGraphStreamEvent;

function buildFileChatAgent(req: Pick<
  FileChatRequest,
  "workspaceRoot" | "projectRoot" | "paths" | "apiKey" | "checkpointThreadId"
>) {
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
  return buildStreamingReactAgent({
    llm: model,
    tools,
    checkpointer,
  });
}

async function* mapStreamToStepEvents(
  stream: AsyncIterable<StreamEvent>,
): AsyncIterable<FileChatStreamEvent> {
  const streamFilter = new AgentStreamFilter("agent");
  let awaitingClarification = false;

  for await (const event of stream) {
    if (event.event === "clarification") {
      const data = event.data ?? {};
      yield {
        type: "clarification",
        clarification_id: String(data.clarification_id ?? ""),
        thread_id: String(data.thread_id ?? ""),
        question: String(data.question ?? ""),
        options: Array.isArray(data.options)
          ? (data.options as Array<{ id: string; label: string }>)
          : [],
        allow_multiple: Boolean(data.allow_multiple),
        allow_free_text: data.allow_free_text !== false,
        status: "pending",
      };
      continue;
    }
    if (event.event === "awaiting_clarification") {
      awaitingClarification = true;
      continue;
    }
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
  yield awaitingClarification
    ? { type: "done", awaiting_clarification: true }
    : { type: "done" };
}

export async function* streamFileChat(req: FileChatRequest): AsyncIterable<FileChatStreamEvent> {
  if (!req.paths.length) {
    yield { type: "message", content: "Error: paths required" };
    yield { type: "done" };
    return;
  }

  clarificationService.cancelThread(req.checkpointThreadId);

  const systemPrompt = await buildFileChatSystemPrompt(req.paths, req.skills ?? []);
  const agent = buildFileChatAgent(req);

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

export async function* resumeFileChatClarification(params: {
  request: Omit<FileChatRequest, "message">;
  clarificationId: string;
  answer: ClarificationAnswer;
}): AsyncIterable<FileChatStreamEvent> {
  const { request, clarificationId, answer } = params;
  const prepared = prepareResume(
    clarificationService,
    request.checkpointThreadId,
    clarificationId,
    answer,
  );
  if (!prepared.ok) {
    throw new ClarificationResumeError(prepared.status, prepared.detail);
  }

  const agent = buildFileChatAgent(request);
  yield* mapStreamToStepEvents(
    streamCompiledAgent(
      agent,
      buildResumeCommand(prepared.serialized),
      {
        configurable: { thread_id: request.checkpointThreadId },
        recursionLimit: getRecursionLimit(),
      },
    ),
  );
}
