import type { GraphEdge, GraphNode, KnowledgeGraph } from "./types";

export interface GraphSummary {
  projectName: string;
  description: string;
  nodeCount: number;
  edgeCount: number;
  layers: { id: string; name: string; nodeCount: number }[];
  sampleNodes: { id: string; name: string; type: string; summary: string }[];
  analyzedAt: string | null;
}

const DEFAULT_MAX_NODES = 40;
const MAX_SAMPLE_NODES = 10;

function layerNodeIds(graph: KnowledgeGraph): Set<string> {
  const ids = new Set<string>();
  for (const layer of graph.layers) {
    for (const nodeId of layer.nodeIds) {
      ids.add(nodeId);
    }
  }
  return ids;
}

function isDomainNode(node: GraphNode): boolean {
  return node.tags.some((tag) => tag.toLowerCase().includes("domain"));
}

function compareNodesForCuration(
  a: GraphNode,
  b: GraphNode,
  layerIds: Set<string>,
): number {
  const aInLayer = layerIds.has(a.id) ? 0 : 1;
  const bInLayer = layerIds.has(b.id) ? 0 : 1;
  if (aInLayer !== bInLayer) return aInLayer - bInLayer;

  const aDomain = isDomainNode(a) ? 0 : 1;
  const bDomain = isDomainNode(b) ? 0 : 1;
  if (aDomain !== bDomain) return aDomain - bDomain;

  return a.id.localeCompare(b.id);
}

function selectCuratedNodes(
  graph: KnowledgeGraph,
  maxNodes: number,
): GraphNode[] {
  const layerIds = layerNodeIds(graph);
  return [...graph.nodes]
    .sort((a, b) => compareNodesForCuration(a, b, layerIds))
    .slice(0, maxNodes);
}

function toSampleNode(node: GraphNode): GraphSummary["sampleNodes"][number] {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    summary: node.summary,
  };
}

export function summarizeGraph(graph: KnowledgeGraph): GraphSummary {
  const layerIds = layerNodeIds(graph);
  const sampleNodes = [...graph.nodes]
    .sort((a, b) => compareNodesForCuration(a, b, layerIds))
    .slice(0, MAX_SAMPLE_NODES)
    .map(toSampleNode);

  return {
    projectName: graph.project.name,
    description: graph.project.description,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    layers: graph.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      nodeCount: layer.nodeIds.length,
    })),
    sampleNodes,
    analyzedAt: graph.project.analyzedAt ?? null,
  };
}

function formatNodeLine(node: GraphNode): string {
  return `- \`${node.id}\` (${node.type}): ${node.summary}`;
}

function formatEdgeLine(edge: GraphEdge): string {
  return `- \`${edge.source}\` → \`${edge.target}\` (${edge.type})`;
}

function greenfieldBlurb(projectName: string): string {
  return [
    `# ${projectName}`,
    "",
    "This project has an empty curated subgraph — a greenfield view with no nodes selected.",
  ].join("\n");
}

export function curatedSubgraphMarkdown(
  graph: KnowledgeGraph,
  maxNodes: number = DEFAULT_MAX_NODES,
): string {
  if (maxNodes <= 0) {
    return greenfieldBlurb(graph.project.name);
  }

  const selected = selectCuratedNodes(graph, maxNodes);
  const selectedIds = new Set(selected.map((node) => node.id));
  const relevantLayers = graph.layers.filter((layer) =>
    layer.nodeIds.some((nodeId) => selectedIds.has(nodeId)),
  );
  const relevantEdges = graph.edges.filter(
    (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
  );

  const lines = [
    `# ${graph.project.name}`,
    "",
    graph.project.description,
    "",
    "## Layers",
    ...(relevantLayers.length > 0
      ? relevantLayers.map((layer) => `- **${layer.name}** (${layer.nodeIds.length} nodes)`)
      : ["- _(none)_"]),
    "",
    "## Nodes",
    ...(selected.length > 0
      ? selected.map(formatNodeLine)
      : ["- _(empty)_"]),
    "",
    "## Edges",
    ...(relevantEdges.length > 0
      ? relevantEdges.map(formatEdgeLine)
      : ["- _(none)_"]),
  ];

  return lines.join("\n");
}
