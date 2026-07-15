import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readGraph } from "../../electron/ua/graphStore";
import { assertValidGraph } from "../../electron/ua/graphStore";
import {
  applyDraft,
  generateDraft,
  GREENFIELD_DEFAULT_GOAL,
} from "../../electron/ua/generateWorkflowService";
import {
  getGenerateRunner,
  resetUaRuntimeForTests,
  setUaRunnersForTests,
  startUaAnalyze,
} from "../../electron/ua/runtime";
import type { WorkflowDraft } from "../../electron/ua/draft";
import type { KnowledgeGraph } from "../../electron/ua/types";
import type { WorkflowDefinition } from "../../electron/workflow/types";
import { listTemplates, loadWorkflow } from "../../electron/workflow/loader";
import { saveWorkspace } from "../../electron/workspace/store";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const minimalGraphPath = path.join(fixtureDir, "../fixtures/ua/minimal-graph.json");

async function loadFixture(): Promise<KnowledgeGraph> {
  const raw = await fs.readFile(minimalGraphPath, "utf8");
  return assertValidGraph(JSON.parse(raw));
}

function makeWorkflow(
  id = "e2e-workflow",
  opts?: { buildRootId?: string },
): WorkflowDefinition {
  return {
    version: 1,
    id,
    title: "E2E Generated",
    steps: [
      {
        id: "plan",
        title: "Plan",
        executor: "deepseek",
        skills: [],
        prompt_template: "prompts/plan.md",
        outputs: ["docs/plan.md"],
        gates: [],
        requires_resources: [],
      },
      {
        id: "build",
        title: "Build",
        executor: "claude-code",
        skills: [],
        prompt_template: "prompts/build.md",
        outputs: ["src/"],
        gates: [],
        requires_resources: [],
        ...(opts?.buildRootId ? { rootId: opts.buildRootId } : {}),
      },
    ],
    edges: [{ from: "plan", to: "build" }],
    resources: [],
  };
}

function makeDraft(overrides?: Partial<WorkflowDraft>): WorkflowDraft {
  const workflow = overrides?.workflow ?? makeWorkflow();
  return {
    workflow,
    prompts: overrides?.prompts ?? {
      "prompts/plan.md": "# Plan\n\nPlan from graph.",
      "prompts/build.md": "# Build\n\nBuild from graph.",
    },
    workspaces: overrides?.workspaces,
    meta: overrides?.meta ?? {
      source: "ua-graph",
      analyzedAt: "2026-07-15T00:00:00.000Z",
      gitCommitHash: null,
      gitCommitHashes: { main: null },
      rootIds: ["main"],
      goal: GREENFIELD_DEFAULT_GOAL,
    },
  };
}

describe("UA analyze → generate → apply (e2e)", () => {
  let tmp: string;
  const getApiKey = () => "test-key";

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ua-e2e-"));
    resetUaRuntimeForTests();

    const fixture = await loadFixture();
    setUaRunnersForTests({
      analyzeRunner: async ({ onProgress, inventories }) => {
        expect(inventories).toEqual([]);
        onProgress({ phase: "extract", message: "stub extract" });
        onProgress({ phase: "relate", message: "stub relate" });
        return fixture;
      },
      generateRunner: async ({ goal, summaryMarkdown, curatedMarkdown }) => {
        expect(goal).toBe(GREENFIELD_DEFAULT_GOAL);
        expect(summaryMarkdown).toMatch(/fixture-app/i);
        expect(curatedMarkdown).toMatch(/file:src\/main\.ts/);
        return makeDraft({
          meta: {
            source: "ua-graph",
            analyzedAt: fixture.project.analyzedAt,
            gitCommitHash: null,
            gitCommitHashes: { main: null },
            rootIds: ["main"],
            goal,
          },
        });
      },
    });
  });

  afterEach(async () => {
    resetUaRuntimeForTests();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("writes graph, generates draft, applies workflow, and preserves templates", async () => {
    expect(await readGraph(tmp)).toBeNull();

    const graph = await startUaAnalyze(tmp, undefined, getApiKey);
    expect((graph as KnowledgeGraph).project.name).toBe("fixture-app");
    expect(await readGraph(tmp)).toEqual(graph);

    const draft = await generateDraft(tmp, null, getGenerateRunner(getApiKey));
    expect(draft.workflow.steps).toHaveLength(2);
    expect(draft.prompts["prompts/plan.md"]).toMatch(/Plan from graph/);

    const { workflowId } = await applyDraft(tmp, draft);
    expect(workflowId).toBe("e2e-workflow");

    const loaded = await loadWorkflow(tmp, workflowId);
    expect(loaded.steps.map((s) => s.id)).toEqual(["plan", "build"]);
    expect(loaded.edges).toEqual([{ from: "plan", to: "build" }]);

    const planBody = await fs.readFile(
      path.join(tmp, ".agentflow/workflows/e2e-workflow/prompts/plan.md"),
      "utf8",
    );
    expect(planBody).toMatch(/Plan from graph/);

    const templates = await listTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.some((t) => t.id === "default-dev-cicd")).toBe(true);
  });
});

describe("UA multi-root analyze → generate → apply (e2e)", () => {
  let tmp: string;
  const getApiKey = () => "test-key";

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ua-e2e-multi-"));
    resetUaRuntimeForTests();

    const webDir = path.join(tmp, "web");
    const apiDir = path.join(tmp, "api");
    await fs.mkdir(webDir);
    await fs.mkdir(apiDir);
    await fs.writeFile(path.join(webDir, "app.ts"), "export {};\n");
    await fs.writeFile(path.join(apiDir, "server.ts"), "export {};\n");

    await saveWorkspace(tmp, {
      version: 1,
      name: "e2e-platform",
      roots: [
        { id: "web", path: "web", label: "Web" },
        { id: "api", path: "api", label: "API" },
      ],
    });

    setUaRunnersForTests({
      analyzeRunner: async ({
        onProgress,
        inventories,
        selectedRootIds,
        rootMetas,
      }) => {
        expect(selectedRootIds).toEqual(["web", "api"]);
        expect(inventories.some((e) => e.rootId === "web" && e.path === "app.ts")).toBe(
          true,
        );
        expect(
          inventories.some((e) => e.rootId === "api" && e.path === "server.ts"),
        ).toBe(true);
        onProgress({ phase: "extract", message: "stub extract" });
        onProgress({ phase: "relate", message: "stub relate" });
        return {
          project: {
            name: "e2e-platform",
            description: "Multi-root e2e workspace",
            languages: ["typescript"],
            frameworks: [],
            analyzedAt: "2026-07-15T00:00:00.000Z",
            gitCommitHash: null,
            roots: rootMetas.map((meta) => ({ ...meta })),
          },
          nodes: [
            {
              id: "root:web/file:app.ts",
              type: "file",
              name: "app.ts",
              filePath: "app.ts",
              summary: "Web entry",
              tags: [],
              complexity: "low",
              rootId: "web",
            },
            {
              id: "root:api/file:server.ts",
              type: "file",
              name: "server.ts",
              filePath: "server.ts",
              summary: "API entry",
              tags: [],
              complexity: "low",
              rootId: "api",
            },
          ],
          edges: [],
          layers: [],
          tour: [],
        } satisfies KnowledgeGraph;
      },
      generateRunner: async ({ goal, curatedMarkdown }) => {
        expect(curatedMarkdown).toContain("root:web/file:app.ts");
        expect(curatedMarkdown).not.toContain("root:api/file:server.ts");
        return makeDraft({
          workflow: makeWorkflow("e2e-multi-root", { buildRootId: "web" }),
          meta: {
            source: "ua-graph",
            analyzedAt: "2026-07-15T00:00:00.000Z",
            gitCommitHash: null,
            gitCommitHashes: {},
            rootIds: [],
            goal,
          },
        });
      },
    });
  });

  afterEach(async () => {
    resetUaRuntimeForTests();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("selective generate records meta.rootIds and apply succeeds", async () => {
    const graph = (await startUaAnalyze(tmp, undefined, getApiKey)) as KnowledgeGraph;
    expect(graph.project.roots.map((r) => r.id)).toEqual(["web", "api"]);
    expect(graph.nodes.map((n) => n.id)).toEqual([
      "root:web/file:app.ts",
      "root:api/file:server.ts",
    ]);

    const draft = await generateDraft(tmp, null, getGenerateRunner(getApiKey), {
      rootIds: ["web"],
    });
    expect(draft.meta.rootIds).toEqual(["web"]);
    expect(draft.meta.gitCommitHashes).toEqual({ web: null });
    expect(draft.workflow.steps.find((s) => s.id === "build")?.rootId).toBe("web");

    const { workflowId } = await applyDraft(tmp, draft);
    expect(workflowId).toBe("e2e-multi-root");

    const loaded = await loadWorkflow(tmp, workflowId);
    expect(loaded.steps.find((s) => s.id === "build")?.rootId).toBe("web");

    const meta = JSON.parse(
      await fs.readFile(
        path.join(tmp, ".agentflow/workflows/e2e-multi-root/meta.json"),
        "utf8",
      ),
    );
    expect(meta.rootIds).toEqual(["web"]);
  });
});
