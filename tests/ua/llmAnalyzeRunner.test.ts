import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLlmAnalyzeRunner } from "../../electron/ua/llmAnalyzeRunner";
import { assertValidGraph, writeUaConfig } from "../../electron/ua/graphStore";
import type { KnowledgeGraph } from "../../electron/ua/types";
import type { InventoryEntry } from "../../electron/ua/inventory";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const minimalGraphPath = path.join(fixtureDir, "../fixtures/ua/minimal-graph.json");

async function loadFixture(): Promise<KnowledgeGraph> {
  const raw = await fs.readFile(minimalGraphPath, "utf8");
  return assertValidGraph(JSON.parse(raw));
}

describe("createLlmAnalyzeRunner", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ua-llm-analyze-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("throws when API key is not set", async () => {
    const runner = createLlmAnalyzeRunner({
      getApiKey: () => null,
      completeJson: async () => ({}),
    });

    await expect(
      runner({
        projectRoot: tmp,
        inventory: [],
        previous: null,
        onProgress: () => {},
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("API key not set");
  });

  it("loads understand skill and validates stub completeJson graph", async () => {
    const fixture = await loadFixture();
    let capturedSystem = "";
    let capturedUser = "";

    const runner = createLlmAnalyzeRunner({
      getApiKey: () => "test-key",
      completeJson: async (system, user) => {
        capturedSystem = system;
        capturedUser = user;
        return fixture;
      },
    });

    const inventory: InventoryEntry[] = [
      { path: "src/main.ts", bytes: 100 },
    ];

    const graph = await runner({
      projectRoot: tmp,
      inventory,
      previous: null,
      onProgress: () => {},
      signal: new AbortController().signal,
    });

    expect(graph).toEqual(fixture);
    expect(capturedSystem).toContain("understand");
    expect(capturedSystem).toContain("KnowledgeGraph");
    expect(capturedUser).toContain("src/main.ts");
    expect(capturedUser).toContain("outputLanguage");
  });

  it("strips markdown fences from string completeJson responses", async () => {
    const fixture = await loadFixture();
    const fenced = `\`\`\`json\n${JSON.stringify(fixture)}\n\`\`\``;

    const runner = createLlmAnalyzeRunner({
      getApiKey: () => "test-key",
      completeJson: async () => fenced,
    });

    const graph = await runner({
      projectRoot: tmp,
      inventory: [],
      previous: null,
      onProgress: () => {},
      signal: new AbortController().signal,
    });

    expect(graph).toEqual(fixture);
  });

  it("includes zh outputLanguage from ua config in user prompt", async () => {
    await writeUaConfig(tmp, { outputLanguage: "zh" });
    let capturedUser = "";

    const fixture = await loadFixture();
    const runner = createLlmAnalyzeRunner({
      getApiKey: () => "test-key",
      completeJson: async (_system, user) => {
        capturedUser = user;
        return fixture;
      },
    });

    await runner({
      projectRoot: tmp,
      inventory: [],
      previous: null,
      onProgress: () => {},
      signal: new AbortController().signal,
    });

    expect(capturedUser).toContain('"outputLanguage": "zh"');
  });

  it("rejects invalid graph from completeJson", async () => {
    const runner = createLlmAnalyzeRunner({
      getApiKey: () => "test-key",
      completeJson: async () => ({ not: "a graph" }),
    });

    await expect(
      runner({
        projectRoot: tmp,
        inventory: [],
        previous: null,
        onProgress: () => {},
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
  });
});
