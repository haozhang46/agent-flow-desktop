import fs from "node:fs/promises";
import path from "node:path";
import { loadSkillBodies } from "../skills/loader";
import { buildAgentflowChatContext, type AgentflowPromptOptions, type ChatMode } from "./agentflowPromptContext";
import {
  CREATE_TYPE_MODE_GUIDANCE,
  LOW_CONFIDENCE_INTENT_GUIDANCE,
  type IntentRouterResult,
  guidanceForIntentResult,
} from "./intentRouter";

export type { ChatMode };
export {
  CREATE_TYPE_MODE_GUIDANCE,
  LOW_CONFIDENCE_INTENT_GUIDANCE,
  guidanceForIntentResult,
};

export type ChatPromptContext = Pick<
  AgentflowPromptOptions,
  "resourceServerUrl" | "workflowId" | "stepId" | "clarificationThreadId"
>;

const MODE_PREAMBLES: Record<ChatMode, string> = {
  ask: [
    "You are a helpful coding assistant.",
    "Answer clearly and concisely.",
    "Tools are available in this mode; call ask_question when a high-stakes or ambiguous choice needs an explicit user decision.",
    "Otherwise rely on the conversation and provided skill instructions.",
  ].join("\n"),
  plan: [
    "You are a planning assistant for software projects.",
    "Use the read-only tools listed below to explore the workspace when helpful.",
    "Do not run shell commands or modify files.",
    "Call ask_question when a high-stakes or ambiguous choice needs an explicit user decision.",
    "When ready, output a markdown implementation plan with numbered steps and a short test plan.",
  ].join("\n"),
  agent: [
    "You are an autonomous dev agent for this Agent Flow workspace.",
    "Follow the .agentflow workflow step, gates, topology, and tool catalog in context.",
    "Use workspace_* tools to adjust step UI; call workspace_list_registry before adding components.",
    "Call ask_question when a high-stakes or ambiguous choice needs an explicit user decision.",
    "Mutating workspace_* / ops_deploy_* / .agentflow writes: always propose changes; the Desktop UI approval card must confirm before anything under .agentflow/ is saved.",
    "Follow project conventions in AGENTS.md when present.",
  ].join("\n"),
};

const FILE_CHAT_PREAMBLE = [
  "You are editing specific project files attached by the user.",
  "You may only read and write the allowed paths listed below.",
  "Do not list directories, run shell commands, or modify other files.",
  "If a file is empty or a stub, help the user initialize it through dialogue before writing.",
].join("\n");

export async function buildFileChatSystemPrompt(
  allowedPaths: string[],
  skillNames: string[] = [],
): Promise<string> {
  const parts: string[] = [
    FILE_CHAT_PREAMBLE,
    `Allowed paths:\n${allowedPaths.map((p) => `- ${p}`).join("\n")}`,
  ];

  if (skillNames.length > 0) {
    const bodies = await loadSkillBodies(skillNames);
    parts.push(...bodies);
  }

  return parts.filter(Boolean).join("\n\n---\n\n");
}

export async function buildChatSystemPrompt(
  mode: ChatMode,
  workspaceRoot: string,
  skillNames: string[] = [],
  chatContext: ChatPromptContext = {},
): Promise<string> {
  const parts: string[] = [MODE_PREAMBLES[mode]];

  const agentflowContext = await buildAgentflowChatContext({
    mode,
    workspaceRoot,
    resourceServerUrl: chatContext.resourceServerUrl,
    workflowId: chatContext.workflowId,
    stepId: chatContext.stepId,
    clarificationThreadId: chatContext.clarificationThreadId,
  });
  parts.push(agentflowContext);

  if (mode === "agent" || mode === "plan") {
    try {
      parts.push(await fs.readFile(path.join(workspaceRoot, "AGENTS.md"), "utf8"));
    } catch {
      // optional
    }
  }

  if (skillNames.length > 0) {
    const bodies = await loadSkillBodies(skillNames);
    parts.push(...bodies);
  }

  return parts.filter(Boolean).join("\n\n---\n\n");
}

export async function buildStepChatSystemPrompt(
  mode: ChatMode,
  workspaceRoot: string,
  stepId: string,
  workflowId: string,
  skillNames: string[] = [],
  chatContext: ChatPromptContext = {},
): Promise<string> {
  return buildChatSystemPrompt(mode, workspaceRoot, skillNames, {
    ...chatContext,
    workflowId,
    stepId,
  });
}

/** Append intent-router guidance when create-type / low-confidence paths apply. */
export function withIntentRouterGuidance(
  systemPrompt: string,
  intent: IntentRouterResult | null | undefined,
): string {
  if (!intent) return systemPrompt;
  const guidance = guidanceForIntentResult(intent);
  if (!guidance) return systemPrompt;
  return `${systemPrompt}\n\n---\n\n${guidance}`;
}
