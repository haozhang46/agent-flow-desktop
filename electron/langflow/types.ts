export type LangflowConfig = {
  baseUrl: string;
  apiKey: string;
};

export type LangflowProjectState = {
  projectId?: string;
  activeFlowId?: string;
  lastSyncedAt?: string;
};

export type LangflowFlowSummary = {
  id: string;
  name: string;
  updated_at?: string;
};

export type LangflowStatus = {
  ok: boolean;
  baseUrl: string;
  mode: "external" | "spawned" | "off";
  detail?: string;
};
