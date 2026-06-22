export type LangflowStatus = {
  ok: boolean;
  baseUrl: string;
  mode: "external" | "spawned" | "off";
  detail?: string;
};

export type LangflowFlowSummary = {
  id: string;
  name: string;
  updated_at?: string;
};

async function apiBase(): Promise<string> {
  const port = await window.desktop.getSidecarPort();
  return `http://127.0.0.1:${port}`;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string };
    if (body.detail) return body.detail;
  } catch {
    /* ignore */
  }
  return res.statusText || `HTTP ${res.status}`;
}

export function useLangflow() {
  async function fetchStatus(): Promise<LangflowStatus> {
    const res = await fetch(`${await apiBase()}/v1/langflow/status`);
    if (!res.ok) {
      throw new Error(`Langflow status failed (${res.status}): ${await parseError(res)}`);
    }
    return res.json() as Promise<LangflowStatus>;
  }

  async function fetchFlows(): Promise<{
    flows: LangflowFlowSummary[];
    activeFlowId?: string;
  }> {
    const res = await fetch(`${await apiBase()}/v1/langflow/flows`);
    if (!res.ok) {
      throw new Error(`Failed to load flows (${res.status}): ${await parseError(res)}`);
    }
    return res.json() as Promise<{ flows: LangflowFlowSummary[]; activeFlowId?: string }>;
  }

  async function createFlow(name?: string): Promise<LangflowFlowSummary> {
    const res = await fetch(`${await apiBase()}/v1/langflow/flows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(name ? { name } : {}),
    });
    if (!res.ok) {
      throw new Error(`Create flow failed (${res.status}): ${await parseError(res)}`);
    }
    return res.json() as Promise<LangflowFlowSummary>;
  }

  async function setActive(flowId: string): Promise<void> {
    const res = await fetch(`${await apiBase()}/v1/langflow/active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flowId }),
    });
    if (!res.ok) {
      throw new Error(`Set active failed (${res.status}): ${await parseError(res)}`);
    }
  }

  return { fetchStatus, fetchFlows, createFlow, setActive };
}
