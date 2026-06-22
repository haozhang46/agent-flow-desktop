import { projectIdFromRoot } from "./topology";

export type OpsConfig = {
  portainerUrl?: string | null;
  mesheryUrl?: string | null;
};

export type DockerOpsSummary = {
  configured: boolean;
  reachable: boolean;
  stackCount?: number | null;
  runningContainers?: number | null;
  endpointCount?: number | null;
  error?: string | null;
};

export type KubernetesOpsSummary = {
  configured: boolean;
  reachable: boolean;
  version?: string | null;
  connectionCount?: number | null;
  error?: string | null;
};

export type OpsSummary = {
  docker: DockerOpsSummary;
  kubernetes: KubernetesOpsSummary;
  intentNodeCount?: number | null;
};

export async function fetchOpsConfig(serverUrl: string): Promise<OpsConfig | null> {
  try {
    const base = serverUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/v1/ops/config`);
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as OpsConfig;
  } catch {
    return null;
  }
}

export async function fetchOpsSummary(
  serverUrl: string,
  workspaceRoot: string,
): Promise<OpsSummary | null> {
  try {
    const base = serverUrl.replace(/\/$/, "");
    const projectId = projectIdFromRoot(workspaceRoot);
    const res = await fetch(
      `${base}/v1/ops/summary?project=${encodeURIComponent(projectId)}`,
    );
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as OpsSummary;
  } catch {
    return null;
  }
}

export function createEmptyOpsSummary(): OpsSummary {
  return {
    docker: { configured: false, reachable: false },
    kubernetes: { configured: false, reachable: false },
    intentNodeCount: null,
  };
}
