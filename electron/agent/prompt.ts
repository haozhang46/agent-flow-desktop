import fs from "node:fs/promises";
import path from "node:path";
import { loadSkillBodies } from "../skills/loader";
import { buildAgentflowChatContext, type AgentflowPromptOptions, type ChatMode } from "./agentflowPromptContext";

export type { ChatMode };

export type ChatPromptContext = Pick<
  AgentflowPromptOptions,
  "resourceServerUrl" | "workflowId" | "stepId"
>;

const MODE_PREAMBLES: Record<ChatMode, string> = {
  ask: [
    "You are a helpful coding assistant.",
    "Answer clearly and concisely.",
    "You cannot use tools; rely on the conversation and provided skill instructions only.",
  ].join("\n"),
  plan: [
    "You are a planning assistant for software projects.",
    "Use the read-only tools listed below to explore the workspace when helpful.",
    "Do not run shell commands or modify files.",
    "Ask clarifying questions when requirements are ambiguous.",
    "When ready, output a markdown implementation plan with numbered steps and a short test plan.",
  ].join("\n"),
  agent: [
    "You are an autonomous dev agent for this Agent Flow workspace.",
    "Follow the .agentflow workflow step, gates, topology, and tool catalog in context.",
    "Use workspace_* tools to adjust step UI; call workspace_list_registry before adding components.",
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
