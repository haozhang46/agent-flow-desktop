import { randomBytes } from "node:crypto";
import {
  tool,
  type StructuredToolInterface,
  type ToolRunnableConfig,
} from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import type { ClarificationService } from "./clarificationService";
import {
  AskQuestionArgsSchema,
  ClarificationAnswerSchema,
  type AskQuestionArgs,
} from "./clarificationTypes";

function resolveToolCallId(config?: ToolRunnableConfig): string {
  const id = config?.toolCall?.id;
  if (typeof id === "string" && id.length > 0) return id;
  return `call_${randomBytes(8).toString("hex")}`;
}

export function buildAskQuestionTool(params: {
  threadId: string;
  service: ClarificationService;
}): StructuredToolInterface {
  const { threadId, service } = params;

  return tool(
    async (args: AskQuestionArgs, config?: ToolRunnableConfig) => {
      if (service.getPendingForThread(threadId)) {
        return "clarification already pending";
      }

      const toolCallId = resolveToolCallId(config);
      const validated = AskQuestionArgsSchema.parse(args);

      try {
        service.createPending(threadId, toolCallId, validated);
      } catch {
        return "clarification already pending";
      }

      const answer = interrupt({
        clarification_id: toolCallId,
        ...validated,
      });

      if (typeof answer === "string") {
        return answer;
      }

      const pending = service.getPending(threadId, toolCallId);
      if (!pending) {
        return JSON.stringify(answer);
      }

      const parsed = ClarificationAnswerSchema.parse(answer);
      return service.serializeAnswerForTool(pending, parsed);
    },
    {
      name: "ask_question",
      description:
        "Ask the user a multiple-choice clarification question and hard-block until they answer. Use for ambiguous or high-stakes choices that need an explicit user decision.",
      schema: AskQuestionArgsSchema,
    },
  );
}
