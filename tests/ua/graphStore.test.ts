import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertValidGraph,
  normalizeGraph,
  readGraph,
  readUaConfig,
  writeGraph,
  writeUaConfig,
} from "../../electron/ua/graphStore";
import type { KnowledgeGraph } from "../../electron/ua/types";
import { graphPath, resolveUaDir } from "../../electron/ua/paths";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const minimalGraphPath = path.join(fixtureDir, "../fixtures/ua/minimal-graph.json");

async function loadFixture(): Promise<KnowledgeGraph> {
  const raw = await fs.readFile(minimalGraphPath, "utf8");
  return assertValidGraph(JSON.parse(raw));
}

describe("graphStore", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ua-graph-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("round-trips writeGraph and readGraph", async () => {
    const graph = await loadFixture();
    await writeGraph(tmp, graph);
    const loaded = await readGraph(tmp);
    expect(loaded).toEqual(graph);
  });

  it("returns null from readGraph when graph file is missing", async () => {
    expect(await readGraph(tmp)).toBeNull();
  });

  it("throws via assertValidGraph for invalid data", () => {
    expect(() => assertValidGraph({ nodes: "not-an-array" })).toThrow();
    expect(() => assertValidGraph(null)).toThrow();
  });

  it("writes atomically via tmp file then rename", async () => {
    const graph = await loadFixture();
    const uaDir = await resolveUaDir(tmp);
    const dest = graphPath(uaDir);
    const tmpDest = `${dest}.tmp`;

    const renameSpy = vi.spyOn(fs, "rename");

    await writeGraph(tmp, graph);

    expect(renameSpy).toHaveBeenCalledWith(tmpDest, dest);
    await expect(fs.access(tmpDest)).rejects.toThrow();

    renameSpy.mockRestore();
  });

  it("defaults readUaConfig to zh when config is missing", async () => {
    expect(await readUaConfig(tmp)).toEqual({ outputLanguage: "zh" });
  });

  it("round-trips writeUaConfig and readUaConfig", async () => {
    const config = { outputLanguage: "en" as const };
    await writeUaConfig(tmp, config);
    expect(await readUaConfig(tmp)).toEqual(config);
  });

  it("normalizeGraph defaults missing node rootId to main", () => {
    const normalized = normalizeGraph({
      project: {
        name: "legacy",
        description: "pre multi-root",
        languages: [],
        frameworks: [],
        analyzedAt: "2026-07-15T00:00:00.000Z",
        gitCommitHash: "abc123",
      },
      nodes: [
        {
          id: "file:a.ts",
          type: "file",
          name: "a.ts",
          summary: "s",
          tags: [],
          complexity: "low",
        },
      ],
      edges: [],
      layers: [],
      tour: [],
    }) as {
      nodes: { rootId: string }[];
      project: {
        roots: { id: string; label: string; path: string; gitCommitHash: string | null }[];
      };
    };

    expect(normalized.nodes[0]!.rootId).toBe("main");
    expect(normalized.project.roots).toEqual([
      {
        id: "main",
        label: "legacy",
        path: ".",
        gitCommitHash: "abc123",
      },
    ]);
  });

  it("assertValidGraph migrates pre-multi-root graphs on parse", () => {
    const graph = assertValidGraph({
      project: {
        name: "legacy-app",
        description: "old format",
        languages: ["ts"],
        frameworks: [],
        analyzedAt: "2026-07-15T00:00:00.000Z",
        gitCommitHash: null,
      },
      nodes: [
        {
          id: "file:src/main.ts",
          type: "file",
          name: "main.ts",
          filePath: "src/main.ts",
          summary: "entry",
          tags: [],
          complexity: "low",
        },
      ],
      edges: [],
      layers: [],
      tour: [],
    });

    expect(graph.nodes[0]!.rootId).toBe("main");
    expect(graph.project.roots).toEqual([
      {
        id: "main",
        label: "legacy-app",
        path: ".",
        gitCommitHash: null,
      },
    ]);
  });

  it("readGraph migrates legacy on-disk graphs missing rootId/roots", async () => {
    const uaDir = await resolveUaDir(tmp);
    await fs.mkdir(uaDir, { recursive: true });
    await fs.writeFile(
      graphPath(uaDir),
      JSON.stringify({
        project: {
          name: "disk-legacy",
          description: "from disk",
          languages: [],
          frameworks: [],
          analyzedAt: "2026-07-15T00:00:00.000Z",
          gitCommitHash: "deadbeef",
        },
        nodes: [
          {
            id: "file:index.ts",
            type: "file",
            name: "index.ts",
            summary: "s",
            tags: [],
            complexity: "low",
          },
        ],
        edges: [],
        layers: [],
        tour: [],
      }),
      "utf8",
    );

    const loaded = await readGraph(tmp);
    expect(loaded).not.toBeNull();
    expect(loaded!.nodes[0]!.rootId).toBe("main");
    expect(loaded!.project.roots[0]).toEqual({
      id: "main",
      label: "disk-legacy",
      path: ".",
      gitCommitHash: "deadbeef",
    });
  });
});
