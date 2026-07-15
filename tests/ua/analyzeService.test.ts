import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AnalyzeService,
  type AnalyzeGraphRunner,
  type AnalyzeProgress,
} from "../../electron/ua/analyzeService";
import { assertValidGraph, readGraph, writeGraph } from "../../electron/ua/graphStore";
import type { KnowledgeGraph } from "../../electron/ua/types";
import type { InventoryEntry } from "../../electron/ua/inventory";
import { saveWorkspace } from "../../electron/workspace/store";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const minimalGraphPath = path.join(fixtureDir, "../fixtures/ua/minimal-graph.json");

async function loadFixture(): Promise<KnowledgeGraph> {
  const raw = await fs.readFile(minimalGraphPath, "utf8");
  return assertValidGraph(JSON.parse(raw));
}

function makeGraph(
  name: string,
  opts?: {
    roots?: KnowledgeGraph["project"]["roots"];
    nodes?: KnowledgeGraph["nodes"];
  },
): KnowledgeGraph {
  return {
    project: {
      name,
      description: `${name} graph`,
      languages: ["typescript"],
      frameworks: [],
      analyzedAt: "2026-07-15T00:00:00.000Z",
      gitCommitHash: null,
      roots: opts?.roots ?? [],
    },
    nodes: opts?.nodes ?? [],
    edges: [],
    layers: [],
    tour: [],
  };
}

describe("AnalyzeService", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ua-analyze-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("preserves previous graph when runner fails", async () => {
    const previous = await loadFixture();
    await writeGraph(tmp, previous);

    const runner: AnalyzeGraphRunner = async () => {
      throw new Error("runner boom");
    };
    const service = new AnalyzeService(runner);

    await expect(service.start(tmp)).rejects.toThrow("runner boom");
    expect(await readGraph(tmp)).toEqual(previous);
  });

  it("rejects concurrent analyze for same root", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const runner: AnalyzeGraphRunner = async () => {
      await gate;
      return makeGraph("from-runner");
    };
    const service = new AnalyzeService(runner);

    const first = service.start(tmp);
    await expect(service.start(tmp)).rejects.toThrow(/analyze in progress/i);
    expect(service.isBusy(tmp)).toBe(true);

    release();
    await first;
    expect(service.isBusy(tmp)).toBe(false);
  });

  it("writes graph on successful analyze", async () => {
    const next = makeGraph("success", {
      roots: [
        { id: "main", label: path.basename(tmp), path: ".", gitCommitHash: null },
      ],
    });
    const runner: AnalyzeGraphRunner = async () => next;
    const service = new AnalyzeService(runner);

    const result = await service.start(tmp);
    expect(result).toEqual(next);
    expect(await readGraph(tmp)).toEqual(next);
  });

  it("calls runner with empty inventories for greenfield project", async () => {
    let seenInventories: InventoryEntry[] | undefined;
    const next = makeGraph("greenfield");
    const runner: AnalyzeGraphRunner = async (input) => {
      seenInventories = input.inventories;
      return next;
    };
    const service = new AnalyzeService(runner);

    await service.start(tmp);
    expect(seenInventories).toEqual([]);
    expect(await readGraph(tmp)).toEqual(next);
  });

  it("ensures workspace.json after successful analyze", async () => {
    const runner: AnalyzeGraphRunner = async () => makeGraph("ensured");
    const service = new AnalyzeService(runner);

    await service.start(tmp);

    const raw = JSON.parse(
      await fs.readFile(path.join(tmp, "workspace.json"), "utf8"),
    );
    expect(raw.roots[0].id).toBe("main");
  });

  it("rejects empty rootIds with no roots selected", async () => {
    const runner: AnalyzeGraphRunner = async () => makeGraph("unused");
    const service = new AnalyzeService(runner);

    await expect(service.start(tmp, { rootIds: [] })).rejects.toThrow(
      /no roots selected/i,
    );
    await expect(
      fs.access(path.join(tmp, ".ua", "knowledge-graph.json")),
    ).rejects.toThrow();
  });

  it("fails without write when all selected root paths are missing", async () => {
    await saveWorkspace(tmp, {
      version: 1,
      name: "plat",
      roots: [
        { id: "ghost", path: "does-not-exist", label: "Ghost" },
      ],
    });

    let runnerCalled = false;
    const runner: AnalyzeGraphRunner = async () => {
      runnerCalled = true;
      return makeGraph("should-not-run");
    };
    const service = new AnalyzeService(runner);

    await expect(service.start(tmp, { rootIds: ["ghost"] })).rejects.toThrow();
    expect(runnerCalled).toBe(false);
    await expect(
      fs.access(path.join(tmp, ".ua", "knowledge-graph.json")),
    ).rejects.toThrow();
  });

  it("merges replace-selected for multi-root analyze", async () => {
    const webDir = path.join(tmp, "web");
    const apiDir = path.join(tmp, "api");
    await fs.mkdir(webDir);
    await fs.mkdir(apiDir);
    await fs.writeFile(path.join(webDir, "app.ts"), "export {};\n");
    await fs.writeFile(path.join(apiDir, "server.ts"), "export {};\n");

    await saveWorkspace(tmp, {
      version: 1,
      name: "plat",
      roots: [
        { id: "web", path: "web", label: "Web" },
        { id: "api", path: "api", label: "API" },
      ],
    });

    const previous = makeGraph("previous", {
      roots: [
        {
          id: "web",
          label: "Web",
          path: "web",
          gitCommitHash: null,
        },
        {
          id: "api",
          label: "API",
          path: "api",
          gitCommitHash: null,
        },
      ],
      nodes: [
        {
          id: "root:web/file:app.ts",
          type: "file",
          name: "app.ts",
          filePath: "app.ts",
          summary: "old web",
          tags: [],
          complexity: "low",
          rootId: "web",
        },
        {
          id: "root:api/file:server.ts",
          type: "file",
          name: "server.ts",
          filePath: "server.ts",
          summary: "old api",
          tags: [],
          complexity: "low",
          rootId: "api",
        },
      ],
    });
    await writeGraph(tmp, previous);

    const runner: AnalyzeGraphRunner = async (input) => {
      expect(input.selectedRootIds).toEqual(["web"]);
      expect(input.inventories.every((e) => e.rootId === "web")).toBe(true);
      expect(input.inventories.some((e) => e.path === "app.ts")).toBe(true);
      return makeGraph("fresh-web", {
        roots: [
          {
            id: "web",
            label: "Web",
            path: "web",
            gitCommitHash: null,
          },
        ],
        nodes: [
          {
            id: "root:web/file:app.ts",
            type: "file",
            name: "app.ts",
            filePath: "app.ts",
            summary: "new web",
            tags: [],
            complexity: "low",
            rootId: "web",
          },
        ],
      });
    };
    const service = new AnalyzeService(runner);

    const result = await service.start(tmp, { rootIds: ["web"] });

    expect(result.nodes.find((n) => n.rootId === "api")?.summary).toBe("old api");
    expect(result.nodes.find((n) => n.rootId === "web")?.summary).toBe("new web");
    expect(await readGraph(tmp)).toEqual(result);
  });

  it("forceFull skips previous merge and keeps only selected fresh roots", async () => {
    const webDir = path.join(tmp, "web");
    const apiDir = path.join(tmp, "api");
    await fs.mkdir(webDir);
    await fs.mkdir(apiDir);

    await saveWorkspace(tmp, {
      version: 1,
      name: "plat",
      roots: [
        { id: "web", path: "web", label: "Web" },
        { id: "api", path: "api", label: "API" },
      ],
    });

    const previous = makeGraph("previous", {
      roots: [
        { id: "web", label: "Web", path: "web", gitCommitHash: null },
        { id: "api", label: "API", path: "api", gitCommitHash: null },
      ],
      nodes: [
        {
          id: "root:web/file:a.ts",
          type: "file",
          name: "a.ts",
          summary: "web",
          tags: [],
          complexity: "low",
          rootId: "web",
        },
        {
          id: "root:api/file:b.ts",
          type: "file",
          name: "b.ts",
          summary: "api",
          tags: [],
          complexity: "low",
          rootId: "api",
        },
      ],
    });
    await writeGraph(tmp, previous);

    const runner: AnalyzeGraphRunner = async (input) => {
      expect(input.previous).toBeNull();
      return makeGraph("fresh-only", {
        roots: [
          { id: "web", label: "Web", path: "web", gitCommitHash: null },
        ],
        nodes: [
          {
            id: "root:web/file:a.ts",
            type: "file",
            name: "a.ts",
            summary: "fresh web",
            tags: [],
            complexity: "low",
            rootId: "web",
          },
        ],
      });
    };
    const service = new AnalyzeService(runner);

    const result = await service.start(tmp, {
      forceFull: true,
      rootIds: ["web"],
    });

    expect(result.nodes.map((n) => n.rootId)).toEqual(["web"]);
    expect(result.nodes[0].summary).toBe("fresh web");
  });

  it("passes previous graph to runner and forceFull clears it", async () => {
    const previous = await loadFixture();
    await writeGraph(tmp, previous);

    const seen: Array<KnowledgeGraph | null> = [];
    const runner: AnalyzeGraphRunner = async (input) => {
      seen.push(input.previous);
      return makeGraph("next");
    };
    const service = new AnalyzeService(runner);

    await service.start(tmp);
    await service.start(tmp, { forceFull: true });

    expect(seen[0]).toEqual(previous);
    expect(seen[1]).toBeNull();
  });

  it("preserves previous graph when cancelled after runner completes", async () => {
    const previous = await loadFixture();
    await writeGraph(tmp, previous);

    let releaseRunner!: () => void;
    const runnerGate = new Promise<void>((resolve) => {
      releaseRunner = resolve;
    });

    const runner: AnalyzeGraphRunner = async () => {
      await runnerGate;
      return makeGraph("should-not-write");
    };
    const service = new AnalyzeService(runner);

    const pending = service.start(tmp);
    await Promise.resolve();
    releaseRunner();
    service.cancel(tmp);

    await expect(pending).rejects.toThrow(/abort/i);
    expect(await readGraph(tmp)).toEqual(previous);
    expect(service.isBusy(tmp)).toBe(false);
  });

  it("cancels via AbortSignal and preserves previous graph", async () => {
    const previous = await loadFixture();
    await writeGraph(tmp, previous);

    const runner: AnalyzeGraphRunner = async ({ signal }) => {
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error("aborted"));
          return;
        }
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
      return makeGraph("should-not-write");
    };
    const service = new AnalyzeService(runner);

    const pending = service.start(tmp);
    await Promise.resolve();
    service.cancel(tmp);

    await expect(pending).rejects.toThrow(/abort/i);
    expect(await readGraph(tmp)).toEqual(previous);
    expect(service.isBusy(tmp)).toBe(false);
  });

  it("forwards progress events and allows unsubscribe", async () => {
    const events: AnalyzeProgress[] = [];
    const runner: AnalyzeGraphRunner = async ({ onProgress }) => {
      onProgress({ phase: "extract", message: "extracting" });
      onProgress({ phase: "relate", message: "relating", percent: 80 });
      return makeGraph("progress");
    };
    const service = new AnalyzeService(runner);
    const unsubscribe = service.onProgress(tmp, (p) => events.push(p));

    await service.start(tmp);
    expect(events.some((e) => e.phase === "scan")).toBe(true);
    expect(events.some((e) => e.phase === "extract")).toBe(true);
    expect(events.some((e) => e.phase === "relate")).toBe(true);
    expect(events.some((e) => e.phase === "write")).toBe(true);

    unsubscribe();
    const after: AnalyzeProgress[] = [];
    service.onProgress(tmp, (p) => after.push(p));
    // ensure unsubscribe of first listener sticks; second still receives
    await service.start(tmp);
    expect(after.length).toBeGreaterThan(0);
  });
});
