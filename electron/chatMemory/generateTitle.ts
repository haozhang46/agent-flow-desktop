import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { ChatMessage } from "./types";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = "deepseek-v4-pro";
const MAX_TITLE_LENGTH = 60;

export type TitleGeneratorDeps = {
  invoke: (messages: (SystemMessage | HumanMessage)[]) => Promise<{ content: unknown }>;
};

function createDefaultInvoke(apiKey: string): TitleGeneratorDeps["invoke"] {
  const model = new ChatOpenAI({
    model: DEEPSEEK_MODEL,
    apiKey,
    streaming: false,
    temperature: 0.3,
    configuration: { baseURL: DEEPSEEK_BASE_URL },
  });
  return (messages) => model.invoke(messages);
}

function buildPrompt(messages: ChatMessage[]): string {
  const user = messages.find((m) => m.role === "user")?.content ?? "";
  const assistant = messages.find((m) => m.role === "assistant")?.content ?? "";
  return [
    "Generate a short chat thread title (3-8 words) summarizing this conversation opener.",
    "Use the same language as the user message.",
    "No quotes, no trailing punctuation.",
    "",
    `User: ${user}`,
    assistant ? `Assistant: ${assistant}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeTitle(raw: unknown): string {
  const text =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw
            .map((part) =>
              typeof part === "object" && part !== null && "text" in part
                ? String((part as { text: unknown }).text)
                : "",
            )
            .join("")
        : String(raw ?? "");
  const trimmed = text.trim().replace(/^["']|["']$/g, "").replace(/[.!?]+$/g, "");
  if (!trimmed) {
    throw new Error("empty title from LLM");
  }
  return trimmed.slice(0, MAX_TITLE_LENGTH);
}

export async function generateThreadTitle(
  messages: ChatMessage[],
  apiKey: string,
  deps?: Partial<TitleGeneratorDeps>,
): Promise<string> {
  const invoke = deps?.invoke ?? createDefaultInvoke(apiKey);
  const response = await invoke([
    new SystemMessage(
      "You write concise chat thread titles. Reply with the title only, nothing else.",
    ),
    new HumanMessage(buildPrompt(messages)),
  ]);
  return normalizeTitle(response.content);
}

export function truncatePreviewTitle(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "New Chat";
  return trimmed.slice(0, MAX_TITLE_LENGTH);
}
