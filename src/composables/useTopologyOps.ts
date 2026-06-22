import type { OpsAuditEntry } from "../../electron/resources/opsAudit";
import type { OpsConfig, TopologyWithAccess, WorkspaceOpsBundle } from "../../electron/resources/opsTypes";
import { confirmAgentflowMutation } from "../utils/confirmAgentflowWrite";

export type { OpsConfig, TopologyWithAccess, WorkspaceOpsBundle, OpsAuditEntry };
export type TopologyNodeWithAccess = TopologyWithAccess["nodes"][number];

async function apiBase(): Promise<string> {
  const port = await window.desktop.getSidecarPort();
  return `http://127.0.0.1:${port}`;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${await apiBase()}${path}`, init);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function useTopologyOps() {
  async function bootstrapOps(): Promise<WorkspaceOpsBundle> {
    return apiJson("/v1/workspace/ops/bootstrap");
  }

  async function loadOps(): Promise<WorkspaceOpsBundle> {
    return apiJson("/v1/workspace/ops");
  }

  async function saveOps(
    topology: TopologyWithAccess,
    ops: OpsConfig,
    options: { confirmed?: boolean } = {},
  ): Promise<{ ok: boolean }> {
    if (!options.confirmed) {
      const ok = confirmAgentflowMutation("Save topology and ops configuration");
      if (!ok) throw new Error("user_denied");
    }
    return apiJson("/v1/workspace/ops", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topology, ops, confirmed: true }),
    });
  }

  async function listLogFiles(nodeId?: string): Promise<{ files: { name: string; path: string }[] }> {
    const q = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : "";
    return apiJson(`/v1/workspace/ops/logs${q}`);
  }

  async function readLogFile(filePath: string): Promise<{ content: string }> {
    return apiJson(`/v1/workspace/ops/logs?path=${encodeURIComponent(filePath)}`);
  }

  async function fetchLogSnapshot(nodeId: string): Promise<{
    content: string;
    savedPath?: string;
    error?: string;
  }> {
    return apiJson("/v1/workspace/ops/logs/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId }),
    });
  }

  async function fetchNodeStatus(nodeId: string): Promise<{
    output: string;
    reachable: boolean;
    error?: string;
  }> {
    return apiJson(`/v1/workspace/ops/status?nodeId=${encodeURIComponent(nodeId)}`);
  }

  async function deployNode(nodeId: string): Promise<{
    output: string;
    exitCode: number;
    logFile?: string;
    error?: string;
  }> {
    return apiJson("/v1/workspace/ops/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId, confirm: true }),
    });
  }

  async function deployAll(): Promise<{
    output: string;
    exitCode: number;
    error?: string;
  }> {
    return apiJson("/v1/workspace/ops/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deployAll: true, confirm: true }),
    });
  }

  async function sshExec(hostRef: string, command: string): Promise<{
    output: string;
    exitCode: number;
    error?: string;
  }> {
    return apiJson("/v1/workspace/ops/ssh/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostRef, command }),
    });
  }

  async function listAudit(limit = 50): Promise<{ entries: OpsAuditEntry[] }> {
    return apiJson(`/v1/workspace/ops/audit?limit=${limit}`);
  }

  async function syncToServer(): Promise<{ topology: TopologyWithAccess }> {
    return apiJson("/v1/workspace/ops/sync-server", { method: "POST" });
  }

  function followLogs(
    nodeId: string,
    handlers: {
      onChunk: (text: string) => void;
      onError?: (message: string) => void;
      onDone?: () => void;
    },
  ): () => void {
    let es: EventSource | null = null;
    void apiBase().then((base) => {
      es = new EventSource(
        `${base}/v1/workspace/ops/logs/stream?nodeId=${encodeURIComponent(nodeId)}`,
      );
      es.addEventListener("log", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as { text?: string };
          if (data.text) handlers.onChunk(data.text);
        } catch {
          /* ignore malformed */
        }
      });
      es.addEventListener("error", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as { message?: string };
          if (data.message) handlers.onError?.(data.message);
        } catch {
          /* EventSource connection error */
        }
      });
      es.addEventListener("done", () => {
        handlers.onDone?.();
        es?.close();
      });
    });
    return () => {
      es?.close();
    };
  }

  return {
    bootstrapOps,
    loadOps,
    saveOps,
    listLogFiles,
    readLogFile,
    fetchLogSnapshot,
    fetchNodeStatus,
    deployNode,
    deployAll,
    sshExec,
    followLogs,
    listAudit,
    syncToServer,
  };
}
