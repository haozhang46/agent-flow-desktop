import { describe, expect, it } from "vitest";
import { mergeReplaceSelected } from "../../electron/ua/mergeGraph";
import type { KnowledgeGraph } from "../../electron/ua/types";

function node(id: string, rootId: string): KnowledgeGraph["nodes"][number] {
  return {
    id,
    type: "file",
    name: id,
    filePath: "x.ts",
    summary: "s",
    tags: [],
    complexity: "low",
    rootId,
  };
}

const baseProject = {
  name: "w",
  description: "d",
  languages: [] as string[],
  frameworks: [] as string[],
  analyzedAt: "2026-07-15T00:00:00.000Z",
  gitCommitHash: null as string | null,
  roots: [] as { id: string; label: string; path: string; gitCommitHash: string | null }[],
};

describe("mergeReplaceSelected", () => {
  it("keeps other roots when replacing selected", () => {
    const previous: KnowledgeGraph = {
      project: {
        ...baseProject,
        roots: [
          { id: "web", label: "Web", path: "../web", gitCommitHash: "aaa" },
          { id: "api", label: "API", path: "../api", gitCommitHash: "bbb" },
        ],
      },
      nodes: [node("root:web/file:a", "web"), node("root:api/file:b", "api")],
      edges: [{ source: "root:web/file:a", target: "root:api/file:b", type: "calls" }],
      layers: [],
      tour: [],
    };
    const fresh: KnowledgeGraph = {
      project: {
        ...baseProject,
        roots: [{ id: "api", label: "API", path: "../api", gitCommitHash: "ccc" }],
      },
      nodes: [node("root:api/file:b2", "api")],
      edges: [],
      layers: [],
      tour: [],
    };
    const merged = mergeReplaceSelected(previous, fresh, ["api"]);
    expect(merged.nodes.map((n) => n.id).sort()).toEqual([
      "root:api/file:b2",
      "root:web/file:a",
    ]);
    expect(merged.edges).toEqual([]); // dangling cross-edge dropped
    expect(merged.project.roots.find((r) => r.id === "api")!.gitCommitHash).toBe("ccc");
  });
});
