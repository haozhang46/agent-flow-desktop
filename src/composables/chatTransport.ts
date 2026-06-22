import { parseSseStream, type SseEvent } from "@agent-flow/shared-ui";
import type { ChatMode } from "./useChatThreadMeta";

export async function getAgentApiBase(): Promise<string> {
  const port = await window.desktop.getSidecarPort();
  return `http://127.0.0.1:${port}`;
}

async function postSse(
  path: string,
  body: Record<string, unknown>,
  errorLabel: string,
): Promise<AsyncGenerator<SseEvent>> {
  const res = await fetch(`${await getAgentApiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    throw new Error(`${errorLabel}: ${res.status}`);
  }

  return parseSseStream(res.body);
}

export type AgentChatRequest = {
  message: string;
  checkpointThreadId: string;
  mode: ChatMode;
  skills?: string[];
  workflowId?: string;
  stepId?: string;
};

export type FileChatRequest = {
  message: string;
  paths: string[];
  skills?: string[];
  stepId?: string;
  uiThreadId?: string;
  workflowId?: string;
};

export type ChatStreamRequest =
  | ({ kind: "agent" } & AgentChatRequest)
  | ({ kind: "file" } & FileChatRequest);

export async function openChatStream(request: ChatStreamRequest): Promise<AsyncGenerator<SseEvent>> {
  if (request.kind === "file") {
    const body: Record<string, unknown> = {
      paths: request.paths,
      message: request.message,
    };
    if (request.skills?.length) body.skills = request.skills;
    if (request.stepId) body.stepId = request.stepId;
    if (request.uiThreadId) body.threadId = request.uiThreadId;
    if (request.workflowId) body.workflowId = request.workflowId;
    return postSse("/v1/workspace/file-chat", body, "File chat failed");
  }

  const body: Record<string, unknown> = {
    message: request.message,
    thread_id: request.checkpointThreadId,
    mode: request.mode,
  };
  if (request.skills?.length) body.skills = request.skills;
  if (request.workflowId) body.workflowId = request.workflowId;
  if (request.stepId) body.stepId = request.stepId;
  return postSse("/v1/chat", body, "Chat request failed");
}

export async function fetchSkillCatalog(): Promise<{ name: string; description: string }[]> {
  const res = await fetch(`${await getAgentApiBase()}/v1/skills?detailed=1`);
  if (!res.ok) throw new Error(`Skills fetch failed: ${res.status}`);
  return res.json() as Promise<{ name: string; description: string }[]>;
}
