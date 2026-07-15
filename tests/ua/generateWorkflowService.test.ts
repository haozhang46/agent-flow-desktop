import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "yaml";
import { assertValidGraph, writeGraph } from "../../electron/ua/graphStore";
import {
  WorkflowDraftSchema,
  assertValidDraft,
  type WorkflowDraft,
} from "../../electron/ua/draft";
import {
  generateDraft,
  applyDraft,
  type GenerateWorkflowRunner,
  GREENFIELD_DEFAULT_GOAL,
} from "../../electron/ua/generateWorkflowService";
import { AnalyzeService } from "../../electron/ua/analyzeService";
import { acquireProjectLock, releaseProjectLock } from "../../electron/ua/projectLock";
import type { KnowledgeGraph } from "../../electron/ua/types";
import type { WorkflowDefinition } from "../../electron/workflow/types";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const minimalGraphPath = path.join(fixtureDir, "../fixtures/ua/minimal-graph.json");

async function loadFixture(): Promise<KnowledgeGraph> {
  const raw = await fs.readFile(minimalGraphPath, "utf8");
  return assertValidGraph(JSON.parse(raw));
}

function makeWorkflow(id = "ua-generated"): WorkflowDefinition {
  return {
    version: 1,
    id,
    title: "UA Generated",
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
      "prompts/plan.md": "# Plan\n\nPlan the work.",
      "prompts/build.md": "# Build\n\nBuild the work.",
    },
    workspaces: overrides?.workspaces,
    meta: overrides?.meta ?? {
      source: "ua-graph",
      analyzedAt: "2026-07-15T00:00:00.000Z",
      gitCommitHash: null,
      gitCommitHashes: {},
      rootIds: ["main"],
      goal: "Ship a demo",
    },
  };
}

describe("WorkflowDraftSchema", () => {
  it("accepts a valid draft with matching prompt paths", () => {
    const draft = makeDraft();
    expect(() => assertValidDraft(draft)).not.toThrow();
    expect(WorkflowDraftSchema.parse(draft).workflow.steps).toHaveLength(2);
  });

  it("rejects when prompt_template does not match prompts/<stepId>.md", () => {
    const draft = makeDraft({
      workflow: {
        ...makeWorkflow(),
        steps: [
          {
            id: "plan",
            title: "Plan",
            executor: "deepseek",
            skills: [],
            prompt_template: "prompts/wrong.md",
            outputs: [],
            gates: [],
            requires_resources: [],
          },
        ],
        edges: [],
      },
      prompts: { "prompts/wrong.md": "body" },
    });
    expect(() => assertValidDraft(draft)).toThrow(/prompts\/plan\.md/i);
  });

  it("rejects when prompts map is missing a step body", () => {
    const draft = makeDraft({
      prompts: {
        "prompts/plan.md": "# Plan",
        // missing prompts/build.md
      },
    });
    expect(() => assertValidDraft(draft)).toThrow(/prompts\/build\.md/i);
  });
});

describe("generateDraft", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ua-generate-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("throws when no graph exists", async () => {
    const runner: GenerateWorkflowRunner = async () => makeDraft();
    await expect(generateDraft(tmp, "goal", runner)).rejects.toThrow(/graph/i);
  });

  it("passes summary + curated markdown and uses greenfield default goal when null", async () => {
    await writeGraph(tmp, await loadFixture());
    let seen: {
      summaryMarkdown: string;
      curatedMarkdown: string;
      goal: string | null;
    } | null = null;

    const runner: GenerateWorkflowRunner = async (input) => {
      seen = input;
      return makeDraft({
        meta: {
          source: "ua-graph",
          analyzedAt: "2026-07-15T00:00:00.000Z",
          gitCommitHash: null,
          gitCommitHashes: {},
          rootIds: ["main"],
          goal: input.goal,
        },
      });
    };

    const draft = await generateDraft(tmp, null, runner);
    expect(seen).not.toBeNull();
    expect(seen!.goal).toBe(GREENFIELD_DEFAULT_GOAL);
    expect(seen!.summaryMarkdown).toMatch(/fixture-app/i);
    expect(seen!.curatedMarkdown).toMatch(/file:src\/main\.ts/);
    expect(draft.meta.goal).toBe(GREENFIELD_DEFAULT_GOAL);
  });

  it("uses provided goal and validates runner output", async () => {
    await writeGraph(tmp, await loadFixture());
    const runner: GenerateWorkflowRunner = async ({ goal }) =>
      makeDraft({
        meta: {
          source: "ua-graph",
          analyzedAt: "2026-07-15T00:00:00.000Z",
          gitCommitHash: null,
          gitCommitHashes: {},
          rootIds: ["main"],
          goal,
        },
      });

    const draft = await generateDraft(tmp, "  Add auth  ", runner);
    expect(draft.meta.goal).toBe("Add auth");
    expect(draft.workflow.steps[0].prompt_template).toBe("prompts/plan.md");
  });

  it("rejects invalid runner drafts", async () => {
    await writeGraph(tmp, await loadFixture());
    const runner: GenerateWorkflowRunner = async () => ({
      workflow: { version: 1, id: "x", title: "x", steps: [], edges: [] },
      prompts: {},
      meta: {
        source: "ua-graph",
        analyzedAt: null,
        gitCommitHash: null,
        gitCommitHashes: {},
        rootIds: [],
        goal: null,
      },
    });
    await expect(generateDraft(tmp, "g", runner)).rejects.toThrow();
  });

  it("throws analyze in progress when analyze lock held", async () => {
    await writeGraph(tmp, await loadFixture());
    acquireProjectLock(tmp, "analyze");
    try {
      const runner: GenerateWorkflowRunner = async () => makeDraft();
      await expect(generateDraft(tmp, "g", runner)).rejects.toThrow(
        /analyze in progress/i,
      );
    } finally {
      releaseProjectLock(tmp, "analyze");
    }
  });

  it("fails when a selected rootId has zero nodes", async () => {
    const graph = await loadFixture();
    await writeGraph(tmp, {
      ...graph,
      project: {
        ...graph.project,
        roots: [
          ...graph.project.roots,
          { id: "api", label: "API", path: "api", gitCommitHash: "deadbeef" },
        ],
      },
    });
    const runner: GenerateWorkflowRunner = async () => makeDraft();
    await expect(
      generateDraft(tmp, "goal", runner, { rootIds: ["api"] }),
    ).rejects.toThrow(/not analyzed/i);
  });

  it("curates only selected roots and records meta rootIds + hashes", async () => {
    const graph = await loadFixture();
    await writeGraph(tmp, {
      ...graph,
      project: {
        ...graph.project,
        roots: [
          { id: "main", label: "Main", path: ".", gitCommitHash: "aaa111" },
          { id: "api", label: "API", path: "api", gitCommitHash: "bbb222" },
        ],
      },
      nodes: [
        ...graph.nodes,
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
    });

    let curated: string | null = null;
    const runner: GenerateWorkflowRunner = async (input) => {
      curated = input.curatedMarkdown;
      return makeDraft({
        meta: {
          source: "ua-graph",
          analyzedAt: graph.project.analyzedAt,
          gitCommitHash: null,
          gitCommitHashes: {},
          rootIds: [],
          goal: input.goal,
        },
      });
    };

    const draft = await generateDraft(tmp, "Ship", runner, {
      rootIds: ["main"],
    });

    expect(curated).toContain("file:src/main.ts");
    expect(curated).not.toContain("root:api/file:server.ts");
    expect(draft.meta.rootIds).toEqual(["main"]);
    expect(draft.meta.gitCommitHashes).toEqual({ main: "aaa111" });
    expect(draft.meta.gitCommitHash).toBe("aaa111");
  });
});

describe("applyDraft", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ua-apply-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("creates workflow directory with yaml, prompts, meta, and workspaces", async () => {
    const draft = makeDraft({
      workspaces: {
        plan: { widgets: [{ type: "markdown", path: "docs/plan.md" }] },
      },
    });

    const { workflowId } = await applyDraft(tmp, draft);
    expect(workflowId).toBe("ua-generated");

    const root = path.join(tmp, ".agentflow/workflows/ua-generated");
    const wfRaw = await fs.readFile(path.join(root, "workflow.yaml"), "utf8");
    const wf = yaml.parse(wfRaw) as WorkflowDefinition;
    expect(wf.id).toBe("ua-generated");
    expect(wf.steps).toHaveLength(2);

    expect(await fs.readFile(path.join(root, "prompts/plan.md"), "utf8")).toMatch(
      /Plan the work/,
    );
    expect(await fs.readFile(path.join(root, "prompts/build.md"), "utf8")).toMatch(
      /Build the work/,
    );

    const meta = JSON.parse(await fs.readFile(path.join(root, "meta.json"), "utf8"));
    expect(meta.source).toBe("ua-graph");

    const ws = JSON.parse(
      await fs.readFile(path.join(root, "workspaces/plan.workspace.json"), "utf8"),
    );
    expect(ws.widgets).toHaveLength(1);
  });

  it("suffixes id on collision using preferredId", async () => {
    const first = makeDraft({ workflow: makeWorkflow("demo") });
    await applyDraft(tmp, first, "demo");
    const second = await applyDraft(tmp, first, "demo");
    expect(second.workflowId).toBe("demo-2");

    const yamlPath = path.join(tmp, ".agentflow/workflows/demo-2/workflow.yaml");
    const wf = yaml.parse(await fs.readFile(yamlPath, "utf8")) as WorkflowDefinition;
    expect(wf.id).toBe("demo-2");
  });

  it("falls back to ua-generated when draft id is empty", async () => {
    const draft = makeDraft({ workflow: makeWorkflow("") });
    const { workflowId } = await applyDraft(tmp, draft);
    expect(workflowId).toBe("ua-generated");
  });

  it("rejects prompt map keys with path traversal", async () => {
    const draft = makeDraft({
      prompts: {
        "prompts/plan.md": "# Plan",
        "prompts/build.md": "# Build",
        "../evil.md": "evil",
      },
    });
    await expect(applyDraft(tmp, draft)).rejects.toThrow(/\.\./i);

    const evilPath = path.join(tmp, "evil.md");
    await expect(fs.access(evilPath)).rejects.toThrow();
  });

  it("rejects absolute prompt paths in prompts map", async () => {
    const draft = makeDraft({
      prompts: {
        "prompts/plan.md": "# Plan",
        "prompts/build.md": "# Build",
        "/etc/passwd": "evil",
      },
    });
    await expect(applyDraft(tmp, draft)).rejects.toThrow(/absolute path/i);
  });

  it("rejects unexpected prompt paths not referenced by steps", async () => {
    const draft = makeDraft({
      prompts: {
        "prompts/plan.md": "# Plan",
        "prompts/build.md": "# Build",
        "prompts/extra.md": "extra",
      },
    });
    await expect(applyDraft(tmp, draft)).rejects.toThrow(/Unexpected prompt path/i);
  });

  it("rejects workspace stepIds with path traversal", async () => {
    const draft = makeDraft({
      workspaces: {
        "../evil": { widgets: [] },
      },
    });
    await expect(applyDraft(tmp, draft)).rejects.toThrow(/Invalid workspace stepId/i);
  });

  it("rejects workspace stepIds containing path separators", async () => {
    const draft = makeDraft({
      workspaces: {
        "plan/evil": { widgets: [] },
      },
    });
    await expect(applyDraft(tmp, draft)).rejects.toThrow(/Invalid workspace stepId/i);
  });

  it("rejects unknown step rootId against workspace roots", async () => {
    const draft = makeDraft({
      workflow: {
        ...makeWorkflow(),
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
            rootId: "ghost-root",
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
          },
        ],
      },
    });
    await expect(applyDraft(tmp, draft)).rejects.toThrow(/rootId|unknown root/i);
  });
});

describe("analyze vs generate mutual exclusion", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ua-lock-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("analyze throws generate in progress when generate lock held", async () => {
    acquireProjectLock(tmp, "generate");
    try {
      const service = new AnalyzeService(async () => {
        throw new Error("should not run");
      });
      await expect(service.start(tmp)).rejects.toThrow(/generate in progress/i);
    } finally {
      releaseProjectLock(tmp, "generate");
    }
  });

  it("concurrent analyze throws analyze in progress", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const service = new AnalyzeService(async () => {
      await gate;
      return {
        project: {
          name: "x",
          description: "x",
          languages: [],
          frameworks: [],
          analyzedAt: "2026-07-15T00:00:00.000Z",
          gitCommitHash: null,
          roots: [],
        },
        nodes: [],
        edges: [],
        layers: [],
        tour: [],
      };
    });

    const first = service.start(tmp);
    await expect(service.start(tmp)).rejects.toThrow(/analyze in progress/i);
    release();
    await first;
  });
});
