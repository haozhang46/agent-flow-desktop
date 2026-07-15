import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertValidGraph,
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
});
