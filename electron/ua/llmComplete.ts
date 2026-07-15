import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { streamChunkText } from "../agent/streamChunk";
import { loadSkillBodies } from "../skills/loader";
import type { GenerateWorkflowRunner } from "./generateWorkflowService";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = "deepseek-v4-pro";
const DEEPSEEK_REASONING_EFFORT = "max";

export function createDeepSeekChatModel(apiKey: string): ChatOpenAI {
  return new ChatOpenAI({
    model: DEEPSEEK_MODEL,
    apiKey,
    streaming: false,
    modelKwargs: {
      reasoning_effort: DEEPSEEK_REASONING_EFFORT,
      extra_body: { thinking: { type: "enabled" } },
    },
    configuration: { baseURL: DEEPSEEK_BASE_URL },
  });
}

export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i);
  if (fenced) {
    return fenced[1].trim();
  }
  const embedded = trimmed.match(/```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```/i);
  if (embedded) {
    return embedded[1].trim();
  }
  return trimmed;
}

/** Parse model content into a JSON value (object/array/primitive). */
export function parseLlmJsonContent(content: unknown): unknown {
  if (content !== null && typeof content === "object" && !Array.isArray(content)) {
    // Already a plain object (some stubs / structured outputs)
    return content;
  }
  const text = streamChunkText(content);
  const stripped = stripMarkdownFences(text);
  return JSON.parse(stripped);
}

export type CompleteJsonFn = (
  system: string,
  user: string,
) => Promise<unknown>;

/**
 * Non-streaming DeepSeek JSON completion.
 * Returns parsed JSON (or a raw object if the model already returned one).
 */
export function createCompleteJson(
  getApiKey: () => string | null,
): CompleteJsonFn {
  return async (system, user) => {
    const apiKey = getApiKey()?.trim() ?? "";
    if (!apiKey) {
      throw new Error("API key not set");
    }

    const model = createDeepSeekChatModel(apiKey);
    const response = await model.invoke([
      new SystemMessage(system),
      new HumanMessage(user),
    ]);
    return parseLlmJsonContent(response.content);
  };
}

export type LlmGenerateRunnerDeps = {
  getApiKey: () => string | null;
  completeJson?: CompleteJsonFn;
};

export function createLlmGenerateRunner(
  deps: LlmGenerateRunnerDeps,
): GenerateWorkflowRunner {
  const completeJson = deps.completeJson ?? createCompleteJson(deps.getApiKey);

  return async (input) => {
    if (!deps.getApiKey()?.trim()) {
      throw new Error("API key not set");
    }

    const [skillBody] = await loadSkillBodies(["generate-workflow-from-graph"]);
    const user = [
      "## Goal",
      input.goal ?? "",
      "",
      "## Summary",
      input.summaryMarkdown,
      "",
      "## Curated subgraph",
      input.curatedMarkdown,
    ].join("\n");

    const raw = await completeJson(skillBody, user);
    if (typeof raw === "string") {
      return parseLlmJsonContent(raw);
    }
    return raw;
  };
}
