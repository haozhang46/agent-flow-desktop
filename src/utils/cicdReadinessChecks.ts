import type { GateResult } from "../composables/useWorkflow";

export type ReadinessTopologyNode = {
  id: string;
  kind: string;
  source?: string;
};

export type ReadinessInput = {
  files: {
    dockerfile: boolean;
    workflows: boolean;
    compose: boolean;
  };
  topology: {
    nodes: ReadinessTopologyNode[];
  } | null;
  sourcesExist: Record<string, boolean>;
  gates: GateResult[];
};

export type ReadinessItem = {
  id: string;
  label: string;
  pass: boolean;
  detail?: string;
};

export type ReadinessReport = {
  ready: boolean;
  items: ReadinessItem[];
};

export function buildReadinessReport(input: ReadinessInput): ReadinessReport {
  const items: ReadinessItem[] = [];

  items.push({
    id: "dockerfile",
    label: "Dockerfile exists",
    pass: input.files.dockerfile,
  });

  items.push({
    id: "workflows",
    label: "GitHub Actions workflow(s)",
    pass: input.files.workflows,
  });

  const serviceNodes =
    input.topology?.nodes.filter((n) => n.kind === "service" || n.kind === "worker") ?? [];
  items.push({
    id: "topology-services",
    label: "Topology has service node(s)",
    pass: serviceNodes.length > 0,
    detail: serviceNodes.length ? `${serviceNodes.length} service(s)` : undefined,
  });

  for (const node of input.topology?.nodes ?? []) {
    if (!node.source) continue;
    const exists = input.sourcesExist[node.source] ?? false;
    items.push({
      id: `source-${node.id}`,
      label: `${node.id} source: ${node.source}`,
      pass: exists,
      detail: exists ? undefined : "Directory not found",
    });
  }

  for (const gate of input.gates) {
    items.push({
      id: `gate-${gate.id}`,
      label: `Gate: ${gate.id}`,
      pass: gate.status === "PASS" || gate.status === "SKIP",
      detail: gate.message ?? undefined,
    });
  }

  items.push({
    id: "compose",
    label: "docker-compose.yml (optional)",
    pass: input.files.compose,
    detail: input.files.compose ? undefined : "Not found",
  });

  const required = items.filter((i) => i.id !== "compose");
  return {
    ready: required.every((i) => i.pass),
    items,
  };
}
