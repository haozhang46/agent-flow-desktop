import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("electron", () => ({
  dialog: {
    showMessageBox: vi.fn().mockResolvedValue({ response: 1 }),
  },
}));

import { startAgentServer } from "../../electron/agent/server";
import type { AnalyzeGraphRunner } from "../../electron/ua/analyzeService";
import type { WorkflowDraft } from "../../electron/ua/draft";
import { writeGraph, assertValidGraph } from "../../electron/ua/graphStore";
import {
  resetUaRuntimeForTests,
  setUaRunnersForTests,
} from "../../electron/ua/runtime";
import type { KnowledgeGraph } from "../../electron/ua/types";
import type { WorkflowDefinition } from "../../electron/workflow/types";
import { getActiveWorkflowId } from "../../electron/workflow/loader";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const minimalGraphPath = path.join(fixtureDir, "../fixtures/ua/minimal-graph.json");

async function loadFixture(): Promise<KnowledgeGraph> {
  const raw = await fs.readFile(minimalGraphPath, "utf8");
  return assertValidGraph(JSON.parse(raw));
}

function request(
  port: number,
  method: string,
  urlPath: string,
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        method,
        path: urlPath,
        headers: body
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            }
          : {},
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function listenPort(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.on("listening", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) {
        resolve(addr.port);
      } else {
        reject(new Error("server address unavailable"));
      }
    });
    server.on("error", reject);
  });
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
    ],
    edges: [],
    resources: [],
  };
}

function makeDraft(overrides?: Partial<WorkflowDraft>): WorkflowDraft {
  const workflow = overrides?.workflow ?? makeWorkflow();
  return {
    workflow,
    prompts: overrides?.prompts ?? {
      "prompts/plan.md": "# Plan\n\nPlan the work.",
    },
    workspaces: overrides?.workspaces,
    meta: overrides?.meta ?? {
      source: "ua-graph",
      analyzedAt: "2026-07-15T00:00:00.000Z",
      gitCommitHash: null,
      goal: "Ship a demo",
    },
  };
}

async function waitFor(
  fn: () => Promise<boolean>,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("waitFor timeout");
}

describe("UA HTTP routes /v1/ua/*", () => {
  let tmp: string;
  let server: http.Server;
  let port: number;
  let apiKey: string | null;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ua-routes-"));
    apiKey = "test-key";
    resetUaRuntimeForTests();

    const fixture = await loadFixture();
    setUaRunnersForTests({
      analyzeRunner: async ({ onProgress, signal }) => {
        onProgress({ phase: "extract", message: "stub extract", percent: 40 });
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 80);
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("Analyze aborted"));
          });
        });
        onProgress({ phase: "relate", message: "stub relate", percent: 80 });
        return fixture;
      },
      generateRunner: async ({ goal }) =>
        makeDraft({
          meta: {
            source: "ua-graph",
            analyzedAt: "2026-07-15T00:00:00.000Z",
            gitCommitHash: null,
            goal,
          },
        }),
    });

    server = startAgentServer({
      port: 0,
      getApiKey: () => apiKey,
      getWorkspaceRoot: () => tmp,
    });
    port = await listenPort(server);
  });

  afterEach(async () => {
    resetUaRuntimeForTests();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("GET /v1/ua/status returns empty status without graph", async () => {
    const res = await request(port, "GET", "/v1/ua/status");
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as {
      hasGraph: boolean;
      busy: boolean;
      busyKind: string | null;
      summary: unknown;
      analyzedAt: string | null;
    };
    expect(body.hasGraph).toBe(false);
    expect(body.busy).toBe(false);
    expect(body.busyKind).toBeNull();
    expect(body.summary).toBeNull();
    expect(body.analyzedAt).toBeNull();
  });

  it("GET /v1/ua/graph and /summary return 404 without graph", async () => {
    const graph = await request(port, "GET", "/v1/ua/graph");
    expect(graph.status).toBe(404);
    const summary = await request(port, "GET", "/v1/ua/summary");
    expect(summary.status).toBe(404);
  });

  it("GET /v1/ua/graph and /summary return data when graph exists", async () => {
    const fixture = await loadFixture();
    await writeGraph(tmp, fixture);

    const graphRes = await request(port, "GET", "/v1/ua/graph");
    expect(graphRes.status).toBe(200);
    expect(JSON.parse(graphRes.body).project.name).toBe("fixture-app");

    const summaryRes = await request(port, "GET", "/v1/ua/summary");
    expect(summaryRes.status).toBe(200);
    const summary = JSON.parse(summaryRes.body) as {
      projectName: string;
      nodeCount: number;
    };
    expect(summary.projectName).toBe("fixture-app");
    expect(summary.nodeCount).toBe(1);

    const status = await request(port, "GET", "/v1/ua/status");
    const statusBody = JSON.parse(status.body) as {
      hasGraph: boolean;
      analyzedAt: string | null;
      summary: { projectName: string } | null;
    };
    expect(statusBody.hasGraph).toBe(true);
    expect(statusBody.analyzedAt).toBe("2026-07-15T00:00:00.000Z");
    expect(statusBody.summary?.projectName).toBe("fixture-app");
  });

  it("POST /v1/ua/analyze returns 401 without API key", async () => {
    apiKey = null;
    const res = await request(port, "POST", "/v1/ua/analyze", "{}");
    expect(res.status).toBe(401);
  });

  it("POST /v1/ua/analyze starts and reports progress", async () => {
    const start = await request(port, "POST", "/v1/ua/analyze", "{}");
    expect(start.status).toBe(202);
    expect(JSON.parse(start.body)).toEqual({ started: true });

    await waitFor(async () => {
      const status = await request(port, "GET", "/v1/ua/status");
      const body = JSON.parse(status.body) as { busy: boolean; busyKind: string | null };
      return body.busy && body.busyKind === "analyze";
    });

    await waitFor(async () => {
      const progress = await request(port, "GET", "/v1/ua/analyze/progress");
      return progress.status === 200;
    });

    const progress = await request(port, "GET", "/v1/ua/analyze/progress");
    expect(progress.status).toBe(200);
    const snap = JSON.parse(progress.body) as { phase: string; message: string };
    expect(["scan", "extract", "relate", "write"]).toContain(snap.phase);

    await waitFor(async () => {
      const status = await request(port, "GET", "/v1/ua/status");
      const body = JSON.parse(status.body) as { busy: boolean; hasGraph: boolean };
      return !body.busy && body.hasGraph;
    });

    const graph = await request(port, "GET", "/v1/ua/graph");
    expect(graph.status).toBe(200);
  });

  it("POST /v1/ua/analyze returns 409 when busy", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const slowRunner: AnalyzeGraphRunner = async ({ onProgress }) => {
      onProgress({ phase: "extract", message: "holding" });
      await gate;
      return loadFixture();
    };
    setUaRunnersForTests({ analyzeRunner: slowRunner });

    const first = await request(port, "POST", "/v1/ua/analyze", "{}");
    expect(first.status).toBe(202);

    await waitFor(async () => {
      const status = await request(port, "GET", "/v1/ua/status");
      return JSON.parse(status.body).busy === true;
    });

    const second = await request(port, "POST", "/v1/ua/analyze", "{}");
    expect(second.status).toBe(409);

    release();
    await waitFor(async () => {
      const status = await request(port, "GET", "/v1/ua/status");
      return JSON.parse(status.body).busy === false;
    });
  });

  it("POST /v1/ua/analyze/cancel aborts running analyze", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    setUaRunnersForTests({
      analyzeRunner: async ({ signal }) => {
        await new Promise<void>((resolve, reject) => {
          gate.then(() => resolve());
          signal.addEventListener("abort", () =>
            reject(new Error("Analyze aborted")),
          );
        });
        return loadFixture();
      },
    });

    await request(port, "POST", "/v1/ua/analyze", "{}");
    await waitFor(async () => {
      const status = await request(port, "GET", "/v1/ua/status");
      return JSON.parse(status.body).busy === true;
    });

    const cancel = await request(port, "POST", "/v1/ua/analyze/cancel", "{}");
    expect(cancel.status).toBe(200);

    release();
    await waitFor(async () => {
      const status = await request(port, "GET", "/v1/ua/status");
      return JSON.parse(status.body).busy === false;
    });

    const graph = await request(port, "GET", "/v1/ua/graph");
    expect(graph.status).toBe(404);
  });

  it("GET /v1/ua/analyze/progress returns 204 when no snapshot", async () => {
    const res = await request(port, "GET", "/v1/ua/analyze/progress");
    expect(res.status).toBe(204);
    expect(res.body).toBe("");
  });

  it("POST /v1/ua/generate-workflow returns draft", async () => {
    await writeGraph(tmp, await loadFixture());
    const res = await request(
      port,
      "POST",
      "/v1/ua/generate-workflow",
      JSON.stringify({ goal: "Ship faster" }),
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { draft: WorkflowDraft };
    expect(body.draft.workflow.steps.length).toBeGreaterThan(0);
    expect(body.draft.meta.goal).toBe("Ship faster");
  });

  it("POST /v1/ua/generate-workflow returns 401 without API key", async () => {
    apiKey = null;
    const res = await request(port, "POST", "/v1/ua/generate-workflow", "{}");
    expect(res.status).toBe(401);
  });

  it("POST /v1/ua/generate-workflow returns 404 without graph", async () => {
    const res = await request(port, "POST", "/v1/ua/generate-workflow", "{}");
    expect(res.status).toBe(404);
  });

  it("POST /v1/ua/apply-workflow writes workflow and optionally activates", async () => {
    const draft = makeDraft();
    const res = await request(
      port,
      "POST",
      "/v1/ua/apply-workflow",
      JSON.stringify({ draft, activate: true }),
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { workflowId: string };
    expect(body.workflowId).toBe("ua-generated");

    const yamlPath = path.join(
      tmp,
      ".agentflow/workflows/ua-generated/workflow.yaml",
    );
    await expect(fs.stat(yamlPath)).resolves.toBeTruthy();
    expect(await getActiveWorkflowId(tmp)).toBe("ua-generated");
  });

  it("POST /v1/ua/apply-workflow rejects invalid draft", async () => {
    const res = await request(
      port,
      "POST",
      "/v1/ua/apply-workflow",
      JSON.stringify({ draft: { workflow: { id: "x" } } }),
    );
    expect(res.status).toBe(400);
  });
});
