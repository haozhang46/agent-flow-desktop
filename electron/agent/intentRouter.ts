export type ChatIntent = "create_custom_component_type" | "other";

export type IntentRouterResult = {
  intent: ChatIntent;
  confidence: "high" | "low";
  reason: string;
};

/**
 * Spec patterns use `\b`, but JS word boundaries do not apply before CJK.
 * Keep `\b` for Latin tokens; omit it for Chinese alternatives so phrases like
 * "新建…组件" / "组件类型" still classify as high create.
 */
const CREATE_PATTERN_A =
  /(?:\b(?:new|create)|生成|新建|自定义).{0,40}(?:\b(?:component|panel|widget)|组件|面板)/i;
const CREATE_PATTERN_B =
  /(?:\bcomponent|组件).{0,40}(?:\btype|类型)/i;
const COMPONENT_MENTION =
  /(?:\b(?:component|panel|widget)|组件|面板|workspace\s*ui)/i;

/** Pure first-pass classifier for unit tests and when no LLM is provided. */
export function heuristicCreateComponentIntent(text: string): IntentRouterResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { intent: "other", confidence: "high", reason: "empty message" };
  }

  if (CREATE_PATTERN_A.test(trimmed) || CREATE_PATTERN_B.test(trimmed)) {
    return {
      intent: "create_custom_component_type",
      confidence: "high",
      reason: "matched create-custom-component heuristic",
    };
  }

  if (COMPONENT_MENTION.test(trimmed)) {
    return {
      intent: "create_custom_component_type",
      confidence: "low",
      reason: "component/UI mention without clear create intent",
    };
  }

  return {
    intent: "other",
    confidence: "high",
    reason: "no create-component signals",
  };
}

export type IntentLlm = {
  invoke: (input: string) => Promise<unknown>;
};

/**
 * Classify user intent for custom workspace component type creation.
 * Uses heuristic first; optional LLM refinement is reserved for production.
 * On any failure, degrades to normal agent (`other` / high).
 */
export async function classifyCreateComponentIntent(
  userText: string,
  _llm?: IntentLlm,
): Promise<IntentRouterResult> {
  try {
    return heuristicCreateComponentIntent(userText);
  } catch {
    return {
      intent: "other",
      confidence: "high",
      reason: "intent router failure; degrade to normal agent",
    };
  }
}

/** High-confidence create-type path guidance (scope ask → draft → approve). */
export const CREATE_TYPE_MODE_GUIDANCE = [
  "[Intent: create_custom_component_type — high confidence]",
  "You are in create-type mode for a custom workspace component type.",
  "Before calling workspace_register_component_type, call ask_question to confirm scope with options: project | workflow | global.",
  "Then draft the declarative schema (type id, label, propsFields).",
  "Never write or register without explicit user approval via the Desktop approval card.",
  "Do not generate Vue SFCs; Phase-1 is declarative JSON types only.",
].join("\n");

/** Low-confidence path: force intent confirmation via ask_question. */
export const LOW_CONFIDENCE_INTENT_GUIDANCE = [
  "[Intent: ambiguous component/UI mention — low confidence]",
  "Before using any other tools, call ask_question to confirm the user's intent with exactly these options:",
  "1) create a new custom component type",
  "2) use an existing component type",
  "3) other (not about component types)",
  "Do not call workspace_register_component_type until the user confirms create-type intent and scope.",
].join("\n");

export function guidanceForIntentResult(result: IntentRouterResult): string | null {
  if (result.intent === "create_custom_component_type" && result.confidence === "high") {
    return CREATE_TYPE_MODE_GUIDANCE;
  }
  if (result.confidence === "low") {
    return LOW_CONFIDENCE_INTENT_GUIDANCE;
  }
  return null;
}
