import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { getProjectCheckpointer } from "../chatMemory/checkpointer";
import { getToolsForMode } from "./agentflowPromptContext";
import { clarificationService } from "./clarificationService";
import type { ClarificationAnswer } from "./clarificationTypes";
import {
  classifyCreateComponentIntent,
  guidanceForIntentResult,
  type IntentRouterResult,
} from "./intentRouter";
import {
  buildChatSystemPrompt,
  buildStepChatSystemPrompt,
  type ChatMode,
} from "./prompt";
import { getRecursionLimit } from "./recursionLimit";
import { buildStreamingReactAgent } from "./reactGraph";
import { streamChunkText } from "./streamChunk";
import {
  abandonInterruptedClarification,
  buildResumeCommand,
  ClarificationResumeError,
  prepareResume,
  streamCompiledAgent,
  type AgentGraphStreamEvent,
} from "./streamAgentGraph";

export { ClarificationResumeError };
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = "deepseek-v4-pro";
const DEEPSEEK_REASONING_EFFORT = "max";

function createDeepSeekChatModel(
  apiKey: string,
  options: { streaming?: boolean } = {},
): ChatOpenAI {
  return new ChatOpenAI({
    model: DEEPSEEK_MODEL,
    apiKey,
    streaming: options.streaming ?? false,
    modelKwargs: {
      reasoning_effort: DEEPSEEK_REASONING_EFFORT,
      extra_body: { thinking: { type: "enabled" } },
    },
    configuration: { baseURL: DEEPSEEK_BASE_URL },
  });
}

export type AgentConfig = {
  apiKey: string;
  workspaceRoot: string;
  projectRoot?: string;
  resourceServerUrl?: string | null;
};

export type ChatStreamOptions = {
  mode: ChatMode;
  skills?: string[];
  stepId?: string;
  workflowId?: string;
};

type CompiledAgent = ReturnType<typeof buildStreamingReactAgent>;

export class AgentService {
  private checkpointer: SqliteSaver | null = null;
  private checkpointerProjectRoot: string | null = null;
  private config: AgentConfig | null = null;

  private resolveProjectRoot(config: AgentConfig): string {
    return config.projectRoot ?? config.workspaceRoot;
  }

  private getCheckpointer(projectRoot: string): SqliteSaver {
    if (this.checkpointerProjectRoot !== projectRoot || !this.checkpointer) {
      this.checkpointerProjectRoot = projectRoot;
      this.checkpointer = getProjectCheckpointer(projectRoot);
    }
    return this.checkpointer;
  }

  configure(config: AgentConfig): void {
    this.config = config;
    // Tools are thread-scoped (ask_question closes over threadId) and rebuilt per stream.
  }

  clear(): void {
    this.config = null;
    this.checkpointer = null;
    this.checkpointerProjectRoot = null;
  }

  async probeDeepSeek(): Promise<void> {
    if (!this.config?.apiKey) throw new Error("API key not set");
    const model = createDeepSeekChatModel(this.config.apiKey);
    await model.invoke([new HumanMessage("ping")]);
  }

  private ensureConfigured(): AgentConfig {
    if (!this.config) {
      throw new Error("Agent not configured: set DeepSeek API key first");
    }
    return this.config;
  }

  private buildAgentForStream(
    mode: ChatMode,
    clarificationThreadId: string,
    options: Pick<ChatStreamOptions, "workflowId" | "stepId">,
  ): CompiledAgent {
    const config = this.ensureConfigured();
    const projectRoot = this.resolveProjectRoot(config);
    const checkpointer = this.getCheckpointer(projectRoot);
    const model = createDeepSeekChatModel(config.apiKey, { streaming: true });
    const tools = getToolsForMode({
      mode,
      workspaceRoot: config.workspaceRoot,
      resourceServerUrl: config.resourceServerUrl,
      workflowId: options.workflowId,
      stepId: options.stepId,
      clarificationThreadId,
    });
    return buildStreamingReactAgent({
      llm: model,
      tools,
      checkpointer,
    });
  }

  resolveCheckpointThreadId(threadId: string, mode: ChatMode): string {
    if (threadId.includes(":")) {
      return threadId;
    }
    return `${mode}:${threadId}`;
  }

  private async buildSystemPrompt(
    mode: ChatMode,
    clarificationThreadId: string,
    options: ChatStreamOptions,
  ): Promise<string> {
    const chatContext = {
      resourceServerUrl: this.config!.resourceServerUrl,
      workflowId: options.workflowId,
      stepId: options.stepId,
      clarificationThreadId,
    };
    if (options.stepId && options.workflowId) {
      return buildStepChatSystemPrompt(
        mode,
        this.config!.workspaceRoot,
        options.stepId,
        options.workflowId,
        options.skills ?? [],
        chatContext,
      );
    }
    return buildChatSystemPrompt(
      mode,
      this.config!.workspaceRoot,
      options.skills ?? [],
      chatContext,
    );
  }

  /**
   * Phase-1 intent_router: classify before agent stream.
   * On failure, degrade to normal agent (null → no extra guidance).
   */
  private async resolveCreateComponentIntent(
    message: string,
  ): Promise<IntentRouterResult | null> {
    try {
      return await classifyCreateComponentIntent(message);
    } catch {
      return null;
    }
  }

  async *streamEvents(
    threadId: string,
    message: string,
    options: ChatStreamOptions,
  ): AsyncGenerator<AgentGraphStreamEvent> {
    const mode = options.mode;
    const checkpointThreadId = this.resolveCheckpointThreadId(threadId, mode);
    clarificationService.cancelThread(checkpointThreadId);

    const agent = this.buildAgentForStream(mode, checkpointThreadId, options);
    const baseSystemPrompt = await this.buildSystemPrompt(
      mode,
      checkpointThreadId,
      options,
    );
    const intent = await this.resolveCreateComponentIntent(message);
    const intentGuidance = intent ? guidanceForIntentResult(intent) : null;
    const systemPrompt = intentGuidance
      ? `${baseSystemPrompt}\n\n---\n\n${intentGuidance}`
      : baseSystemPrompt;

    const config = {
      configurable: {
        thread_id: checkpointThreadId,
        createTypeMode:
          intent?.intent === "create_custom_component_type" &&
          intent.confidence === "high",
      },
      recursionLimit: getRecursionLimit(),
    };

    await abandonInterruptedClarification(agent, config);

    const input = {
      messages: [
        new HumanMessage(`${systemPrompt}\n\n---\n\n${message}`),
      ],
    };

    let assistantText = "";
    let awaitingClarification = false;

    for await (const event of streamCompiledAgent(agent, input, config)) {
      yield event;
      if (event.event === "awaiting_clarification") {
        awaitingClarification = true;
      }
      if (event.event === "on_chat_model_stream") {
        const chunk = event.data?.chunk as { content?: unknown } | undefined;
        assistantText += streamChunkText(chunk?.content);
      }
    }

    if (!awaitingClarification && mode === "plan" && assistantText.trim()) {
      yield { event: "plan_ready", data: { content: assistantText.trim() } };
    }
  }

  async *resumeClarification(
    threadId: string,
    clarificationId: string,
    answer: ClarificationAnswer,
    options: ChatStreamOptions,
  ): AsyncGenerator<AgentGraphStreamEvent> {
    const mode = options.mode;
    const checkpointThreadId = this.resolveCheckpointThreadId(threadId, mode);
    const prepared = prepareResume(
      clarificationService,
      checkpointThreadId,
      clarificationId,
      answer,
    );
    if (!prepared.ok) {
      throw new ClarificationResumeError(prepared.status, prepared.detail);
    }

    const agent = this.buildAgentForStream(mode, checkpointThreadId, options);
    const config = {
      configurable: { thread_id: checkpointThreadId },
      recursionLimit: getRecursionLimit(),
    };

    let assistantText = "";
    let awaitingClarification = false;

    for await (const event of streamCompiledAgent(
      agent,
      buildResumeCommand(prepared.serialized),
      config,
    )) {
      yield event;
      if (event.event === "awaiting_clarification") {
        awaitingClarification = true;
      }
      if (event.event === "on_chat_model_stream") {
        const chunk = event.data?.chunk as { content?: unknown } | undefined;
        assistantText += streamChunkText(chunk?.content);
      }
    }

    clarificationService.markAnswered(checkpointThreadId, clarificationId);

    if (!awaitingClarification && mode === "plan" && assistantText.trim()) {
      yield { event: "plan_ready", data: { content: assistantText.trim() } };
    }
  }
}

export const agentService = new AgentService();
