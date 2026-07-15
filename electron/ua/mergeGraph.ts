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
    if (selected.has(root.id)) {
      byId.set(root.id, root);
    }
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

function edgeKey(edge: KnowledgeGraph["edges"][number]): string {
  return `${edge.source}\0${edge.target}\0${edge.type}`;
}

export function mergeReplaceSelected(
  previous: KnowledgeGraph | null,
  fresh: KnowledgeGraph,
  selectedRootIds: string[],
): KnowledgeGraph {
  const selected = new Set(selectedRootIds);

  const keptNodes =
    previous?.nodes.filter((node) => !selected.has(node.rootId)) ?? [];
  const freshNodes = fresh.nodes.filter((node) => selected.has(node.rootId));
  const nodes = [...keptNodes, ...freshNodes];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const previousNodeById = new Map(
    (previous?.nodes ?? []).map((node) => [node.id, node]),
  );
  const replacedIds = new Set(
    (previous?.nodes ?? [])
      .filter((node) => selected.has(node.rootId))
      .map((node) => node.id),
  );
  for (const node of freshNodes) {
    replacedIds.add(node.id);
  }

  const keptEdges = (previous?.edges ?? []).filter((edge) => {
    if (replacedIds.has(edge.source) || replacedIds.has(edge.target)) {
      return false;
    }
    const sourceNode = previousNodeById.get(edge.source);
    const targetNode = previousNodeById.get(edge.target);
    if (sourceNode && selected.has(sourceNode.rootId)) return false;
    if (targetNode && selected.has(targetNode.rootId)) return false;
    return nodeIds.has(edge.source) && nodeIds.has(edge.target);
  });

  const freshEdges = fresh.edges.filter((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return false;
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) return false;
    return selected.has(sourceNode.rootId) && selected.has(targetNode.rootId);
  });

  const edgeMap = new Map<string, KnowledgeGraph["edges"][number]>();
  for (const edge of [...keptEdges, ...freshEdges]) {
    edgeMap.set(edgeKey(edge), edge);
  }
  const edges = [...edgeMap.values()];

  const layers = mergeLayersOrTour(
    previous?.layers ?? [],
    fresh.layers,
    nodeIds,
  );
  const tour = mergeLayersOrTour(previous?.tour ?? [], fresh.tour, nodeIds);

  const roots = mergeRoots(previous, fresh, selectedRootIds);
  const primaryId = selectedRootIds[0];
  const primaryRoot =
    primaryId === undefined
      ? undefined
      : roots.find((root) => root.id === primaryId);

  return {
    ...fresh,
    project: {
      ...fresh.project,
      roots,
      gitCommitHash: primaryRoot?.gitCommitHash ?? null,
    },
    nodes,
    edges,
    layers,
    tour,
  };
}
