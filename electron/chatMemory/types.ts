export type ToolRunStatus = "running" | "done" | "error";

export interface ToolRun {
  callId: string;
  name: string;
  status: ToolRunStatus;
  output?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  attachments?: string[];
  toolRuns?: ToolRun[];
}

export type ChatMode = "ask" | "plan" | "agent";

export type TitleSource = "default" | "preview" | "auto" | "user";

export interface ChatThreadMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  checkpointThreadId: string;
  titleSource?: TitleSource;
  mode?: ChatMode;
  skills?: string[];
}

export type AppScope = { scope: "app" };
export type FreeScope = { scope: "free"; workflowId: string };
export type StepScope = { scope: "step"; workflowId: string; stepId: string };
export type ThreadScope = AppScope | FreeScope | StepScope;

export type CreateThreadInput =
  | (AppScope & { title?: string; mode?: ChatMode; skills?: string[] })
  | (FreeScope & { title?: string })
  | (StepScope & { title?: string });
