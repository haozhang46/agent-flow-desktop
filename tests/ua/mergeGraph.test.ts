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

  it("drops fresh over-emission of kept roots", () => {
    const previous: KnowledgeGraph = {
      project: {
        ...baseProject,
        roots: [
          { id: "web", label: "Web", path: "../web", gitCommitHash: "aaa" },
          { id: "api", label: "API", path: "../api", gitCommitHash: "bbb" },
        ],
      },
      nodes: [node("root:web/file:a", "web"), node("root:api/file:b", "api")],
      edges: [],
      layers: [],
      tour: [],
    };
    const fresh: KnowledgeGraph = {
      project: {
        ...baseProject,
        roots: [
          { id: "web", label: "Web", path: "../web", gitCommitHash: "aaa-stale" },
          { id: "api", label: "API", path: "../api", gitCommitHash: "ccc" },
        ],
      },
      // Over-emits a kept-root node that must not replace previous web content
      nodes: [
        node("root:web/file:a-over", "web"),
        node("root:api/file:b2", "api"),
      ],
      edges: [],
      layers: [],
      tour: [],
    };
    const merged = mergeReplaceSelected(previous, fresh, ["api"]);
    expect(merged.nodes.map((n) => n.id).sort()).toEqual([
      "root:api/file:b2",
      "root:web/file:a",
    ]);
    expect(merged.project.roots.find((r) => r.id === "web")!.gitCommitHash).toBe("aaa");
  });

  it("prevents duplicate edges on re-analyze with stable node ids", () => {
    const previous: KnowledgeGraph = {
      project: {
        ...baseProject,
        roots: [
          { id: "web", label: "Web", path: "../web", gitCommitHash: "aaa" },
          { id: "api", label: "API", path: "../api", gitCommitHash: "bbb" },
        ],
      },
      nodes: [
        node("root:web/file:a", "web"),
        node("root:api/file:b", "api"),
        node("root:api/file:c", "api"),
      ],
      edges: [
        { source: "root:api/file:b", target: "root:api/file:c", type: "calls" },
        { source: "root:web/file:a", target: "root:api/file:b", type: "imports" },
      ],
      layers: [],
      tour: [],
    };
    const fresh: KnowledgeGraph = {
      project: {
        ...baseProject,
        roots: [{ id: "api", label: "API", path: "../api", gitCommitHash: "ccc" }],
      },
      nodes: [node("root:api/file:b", "api"), node("root:api/file:c", "api")],
      edges: [
        { source: "root:api/file:b", target: "root:api/file:c", type: "calls" },
      ],
      layers: [],
      tour: [],
    };
    const merged = mergeReplaceSelected(previous, fresh, ["api"]);
    expect(merged.edges).toEqual([
      { source: "root:api/file:b", target: "root:api/file:c", type: "calls" },
    ]);
  });

  it("sets project.gitCommitHash from selectedRootIds[0]", () => {
    const previous: KnowledgeGraph = {
      project: {
        ...baseProject,
        gitCommitHash: "old-rollup",
        roots: [
          { id: "web", label: "Web", path: "../web", gitCommitHash: "aaa" },
          { id: "api", label: "API", path: "../api", gitCommitHash: "bbb" },
        ],
      },
      nodes: [node("root:web/file:a", "web"), node("root:api/file:b", "api")],
      edges: [],
      layers: [],
      tour: [],
    };
    const fresh: KnowledgeGraph = {
      project: {
        ...baseProject,
        gitCommitHash: "fresh-rollup-should-not-win",
        roots: [
          { id: "api", label: "API", path: "../api", gitCommitHash: "ccc" },
          { id: "web", label: "Web", path: "../web", gitCommitHash: "ddd" },
        ],
      },
      nodes: [node("root:api/file:b2", "api")],
      edges: [],
      layers: [],
      tour: [],
    };
    const merged = mergeReplaceSelected(previous, fresh, ["api", "web"]);
    expect(merged.project.gitCommitHash).toBe("ccc");

    const emptySelection = mergeReplaceSelected(previous, fresh, []);
    expect(emptySelection.project.gitCommitHash).toBeNull();
  });
});
