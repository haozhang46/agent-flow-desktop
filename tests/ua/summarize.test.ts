import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertValidGraph } from "../../electron/ua/graphStore";
import {
  summarizeGraph,
  curatedSubgraphMarkdown,
  curateSubgraph,
} from "../../electron/ua/summarize";
import type { GraphNode, KnowledgeGraph } from "../../electron/ua/types";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const minimalGraphPath = path.join(fixtureDir, "../fixtures/ua/minimal-graph.json");

async function loadFixture(): Promise<KnowledgeGraph> {
  const raw = await fs.readFile(minimalGraphPath, "utf8");
  return assertValidGraph(JSON.parse(raw));
}

function makeNode(
  id: string,
  tags: string[] = [],
  rootId = "main",
): GraphNode {
  return {
    id,
    type: "file",
    name: id,
    summary: `Summary for ${id}`,
    tags,
    complexity: "low",
    rootId,
  };
}

function makeGraph(
  nodes: GraphNode[],
  edges: KnowledgeGraph["edges"] = [],
  layers: KnowledgeGraph["layers"] = [],
  roots: KnowledgeGraph["project"]["roots"] = [
    { id: "main", label: "Main", path: ".", gitCommitHash: null },
  ],
): KnowledgeGraph {
  return {
    project: {
      name: "test-app",
      description: "Test graph",
      languages: ["typescript"],
      frameworks: [],
      analyzedAt: "2026-07-15T00:00:00.000Z",
      gitCommitHash: null,
      roots,
    },
    nodes,
    edges,
    layers,
    tour: [],
  };
}

describe("summarizeGraph", () => {
  it("summarizes fixture graph with layer and sample nodes", async () => {
    const graph = await loadFixture();
    const summary = summarizeGraph(graph);

    expect(summary.projectName).toBe("fixture-app");
    expect(summary.nodeCount).toBe(1);
    expect(summary.edgeCount).toBe(0);
    expect(summary.layers).toEqual([
      { id: "layer:ui", name: "UI", nodeCount: 1 },
    ]);
    expect(summary.sampleNodes[0]?.id).toBe("file:src/main.ts");
    expect(summary.analyzedAt).toBe("2026-07-15T00:00:00.000Z");
  });
});

describe("curatedSubgraphMarkdown", () => {
  it("includes project name, layer name, and node details", async () => {
    const graph = await loadFixture();
    const md = curatedSubgraphMarkdown(graph);

    expect(md).toContain("fixture-app");
    expect(md).toContain("UI");
    expect(md).toContain("file:src/main.ts");
    expect(md).toContain("file");
    expect(md).toContain("App entry");
  });

  it("returns greenfield blurb when maxNodes is 0", async () => {
    const graph = await loadFixture();
    const md = curatedSubgraphMarkdown(graph, 0);

    expect(md).toMatch(/empty|greenfield/i);
    expect(md).toContain("fixture-app");
  });

  it("excludes edges when one endpoint is outside curated set", () => {
    const nodes = [
      makeNode("node:a"),
      makeNode("node:b"),
      makeNode("node:c"),
    ];
    const graph = makeGraph(
      nodes,
      [
        { source: "node:a", target: "node:b", type: "imports" },
        { source: "node:a", target: "node:c", type: "imports" },
        { source: "node:b", target: "node:c", type: "imports" },
      ],
      [{ id: "layer:core", name: "Core", description: "", nodeIds: ["node:a", "node:b", "node:c"] }],
    );

    const md = curatedSubgraphMarkdown(graph, 2);

    expect(md).toContain("node:a");
    expect(md).toContain("node:b");
    expect(md).not.toContain("node:c");
    expect(md).toContain("`node:a` → `node:b`");
    expect(md).not.toContain("`node:a` → `node:c`");
    expect(md).not.toContain("`node:b` → `node:c`");
  });

  it("prefers layer members and domain-tagged nodes in curation order", () => {
    const nodes = [
      makeNode("z-no-layer"),
      makeNode("a-layer-domain", ["domain-core"]),
      makeNode("b-layer", ["entry"]),
      makeNode("c-domain", ["domain-api"]),
    ];
    const graph = makeGraph(nodes, [], [
      {
        id: "layer:ui",
        name: "UI",
        description: "",
        nodeIds: ["a-layer-domain", "b-layer"],
      },
    ]);

    const md = curatedSubgraphMarkdown(graph, 2);
    const summary = summarizeGraph(graph);

    const nodeSection = md.split("## Edges")[0] ?? "";
    expect(nodeSection.indexOf("a-layer-domain")).toBeLessThan(
      nodeSection.indexOf("b-layer"),
    );
    expect(nodeSection).not.toContain("c-domain");
    expect(nodeSection).not.toContain("z-no-layer");

    expect(summary.sampleNodes.slice(0, 2).map((n) => n.id)).toEqual([
      "a-layer-domain",
      "b-layer",
    ]);
  });

  it("filters curated nodes by rootIds and keeps cross-edges only when both ends selected", () => {
    const nodes = [
      makeNode("root:web/file:a.ts", [], "web"),
      makeNode("root:web/file:b.ts", [], "web"),
      makeNode("root:api/file:c.ts", [], "api"),
    ];
    const graph = makeGraph(
      nodes,
      [
        {
          source: "root:web/file:a.ts",
          target: "root:web/file:b.ts",
          type: "imports",
        },
        {
          source: "root:web/file:a.ts",
          target: "root:api/file:c.ts",
          type: "calls",
        },
      ],
      [
        {
          id: "layer:all",
          name: "All",
          description: "",
          nodeIds: nodes.map((n) => n.id),
        },
      ],
      [
        { id: "web", label: "Web", path: "web", gitCommitHash: "aaa" },
        { id: "api", label: "API", path: "api", gitCommitHash: "bbb" },
      ],
    );

    const md = curateSubgraph(graph, 40, ["web"]);

    expect(md).toContain("root:web/file:a.ts");
    expect(md).toContain("root:web/file:b.ts");
    expect(md).not.toContain("root:api/file:c.ts");
    expect(md).toContain("`root:web/file:a.ts` → `root:web/file:b.ts`");
    expect(md).not.toContain("`root:web/file:a.ts` → `root:api/file:c.ts`");
  });
});
