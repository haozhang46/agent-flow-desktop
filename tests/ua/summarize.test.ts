import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertValidGraph } from "../../electron/ua/graphStore";
import {
  summarizeGraph,
  curatedSubgraphMarkdown,
} from "../../electron/ua/summarize";
import type { KnowledgeGraph } from "../../electron/ua/types";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const minimalGraphPath = path.join(fixtureDir, "../fixtures/ua/minimal-graph.json");

async function loadFixture(): Promise<KnowledgeGraph> {
  const raw = await fs.readFile(minimalGraphPath, "utf8");
  return assertValidGraph(JSON.parse(raw));
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
});
