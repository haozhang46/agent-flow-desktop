import type { KnowledgeGraph } from "./types";

function mergeRoots(
  previous: KnowledgeGraph | null,
  fresh: KnowledgeGraph,
  selectedRootIds: string[],
): KnowledgeGraph["project"]["roots"] {
  const selected = new Set(selectedRootIds);
  const byId = new Map<string, KnowledgeGraph["project"]["roots"][number]>();

  for (const root of previous?.project.roots ?? []) {
    if (!selected.has(root.id)) {
      byId.set(root.id, root);
    }
  }

  for (const root of fresh.project.roots) {
    byId.set(root.id, root);
  }

  return [...byId.values()];
}

function mergeLayersOrTour<
  T extends { nodeIds: string[] },
>(previous: T[], fresh: T[], nodeIds: Set<string>): T[] {
  const merged = [...previous, ...fresh];
  return merged
    .map((entry) => ({
      ...entry,
      nodeIds: entry.nodeIds.filter((id) => nodeIds.has(id)),
    }))
    .filter((entry) => entry.nodeIds.length > 0);
}

export function mergeReplaceSelected(
  previous: KnowledgeGraph | null,
  fresh: KnowledgeGraph,
  selectedRootIds: string[],
): KnowledgeGraph {
  const selected = new Set(selectedRootIds);

  const keptNodes =
    previous?.nodes.filter((node) => !selected.has(node.rootId)) ?? [];
  const nodes = [...keptNodes, ...fresh.nodes];
  const nodeIds = new Set(nodes.map((node) => node.id));

  const allEdges = [...(previous?.edges ?? []), ...fresh.edges];
  const edges = allEdges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );

  const layers = mergeLayersOrTour(
    previous?.layers ?? [],
    fresh.layers,
    nodeIds,
  );
  const tour = mergeLayersOrTour(previous?.tour ?? [], fresh.tour, nodeIds);

  const roots = mergeRoots(previous, fresh, selectedRootIds);
  const firstSelectedRoot = roots.find((root) => selected.has(root.id));

  return {
    ...fresh,
    project: {
      ...fresh.project,
      roots,
      gitCommitHash: firstSelectedRoot?.gitCommitHash ?? fresh.project.gitCommitHash,
    },
    nodes,
    edges,
    layers,
    tour,
  };
}
