import { AIMessage, isAIMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  END,
  MessagesAnnotation,
  START,
  StateGraph,
  getWriter,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { streamChunkText } from "./streamChunk";

type MessagesState = typeof MessagesAnnotation.State;

type GraphRunnableConfig = RunnableConfig & {
  writer?: (chunk: unknown) => void;
};

function resolveStreamWriter(
  config: RunnableConfig,
): ((chunk: unknown) => void) | undefined {
  return (config as GraphRunnableConfig).writer ?? getWriter(config);
}

function shouldContinue(state: MessagesState): "tools" | typeof END {
  const last = state.messages[state.messages.length - 1];
  if (isAIMessage(last) && last.tool_calls?.length) {
    return "tools";
  }
  return END;
}

async function callModel(
  state: MessagesState,
  config: RunnableConfig,
  model: BaseChatModel,
  tools: StructuredToolInterface[],
): Promise<Partial<MessagesState>> {
  const runnable =
    tools.length > 0 && "bindTools" in model && typeof model.bindTools === "function"
      ? model.bindTools(tools)
      : model;

  const writer = resolveStreamWriter(config);
  let full: AIMessage | undefined;
  const stream = await runnable.stream(state.messages, config);
  for await (const chunk of stream) {
    const text = streamChunkText(chunk.content);
    if (text && writer) writer(text);
    full = full ? (full.concat(chunk) as AIMessage) : (chunk as AIMessage);
  }
  return { messages: [full ?? new AIMessage("")] };
}

export function buildStreamingReactAgent(params: {
  llm: BaseChatModel;
  tools: StructuredToolInterface[];
  checkpointer: SqliteSaver;
}) {
  const toolNode = new ToolNode(params.tools);
  const { llm, tools } = params;

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("agent", (state, config) => callModel(state, config, llm, tools))
    .addEdge(START, "agent");

  if (tools.length > 0) {
    graph
      .addNode("tools", toolNode)
      .addConditionalEdges("agent", shouldContinue, { tools: "tools", [END]: END })
      .addEdge("tools", "agent");
  } else {
    graph.addEdge("agent", END);
  }

  return graph.compile({ checkpointer: params.checkpointer });
}
