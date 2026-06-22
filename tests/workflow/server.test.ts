import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("electron", () => ({
  dialog: {
    showMessageBox: vi.fn().mockResolvedValue({ response: 1 }),
  },
}));

import { startAgentServer } from "../../electron/agent/server";
import { initProjectFromTemplate } from "../../electron/workflow/loader";

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

describe("agent server workflow API", () => {
  let tmp: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-srv-"));
    await initProjectFromTemplate(tmp, "default-dev-cicd");
    server = startAgentServer({
      port: 0,
      getApiKey: () => "test-key",
      getWorkspaceRoot: () => tmp,
    });
    port = await listenPort(server);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("GET /v1/skills returns skill list", async () => {
    const res = await request(port, "GET", "/v1/skills");
    expect(res.status).toBe(200);
    const skills = JSON.parse(res.body) as string[];
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBeGreaterThan(0);
    expect(skills).toContain("test-driven-development");
  });

  it("GET /v1/workflows returns list with active flag", async () => {
    const res = await request(port, "GET", "/v1/workflows");
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as {
      workflows: Array<{ id: string; isActive: boolean }>;
      activeWorkflowId: string;
    };
    expect(Array.isArray(body.workflows)).toBe(true);
    expect(body.workflows.length).toBeGreaterThan(0);
    expect(typeof body.activeWorkflowId).toBe("string");
    expect(body.workflows.some((w) => w.isActive)).toBe(true);
  });

  it("GET /v1/workflows/templates lists built-in templates", async () => {
    const res = await request(port, "GET", "/v1/workflows/templates");
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { templates: Array<{ id: string }> };
    expect(body.templates.some((t) => t.id === "default-dev-cicd")).toBe(true);
  });

  it("POST /v1/workflows/from-template creates workflow", async () => {
    const res = await request(
      port,
      "POST",
      "/v1/workflows/from-template",
      JSON.stringify({ templateId: "default-dev-cicd", newId: "test-wf" }),
    );
    expect(res.status).toBe(201);
    const body = JSON.parse(res.body) as { workflowId: string };
    expect(body.workflowId).toBe("test-wf");
  });

  it("POST /v1/workflows/:id/activate switches active", async () => {
    await request(
      port,
      "POST",
      "/v1/workflows/from-template",
      JSON.stringify({ templateId: "default-dev-cicd", newId: "test-wf" }),
    );
    const res = await request(port, "POST", "/v1/workflows/test-wf/activate");
    expect(res.status).toBe(200);
    const list = await request(port, "GET", "/v1/workflows");
    const parsed = JSON.parse(list.body) as { activeWorkflowId: string };
    expect(parsed.activeWorkflowId).toBe("test-wf");
  });

  it("GET /v1/workflows/current returns workflow definition", async () => {
    const res = await request(port, "GET", "/v1/workflows/current");
    expect(res.status).toBe(200);
    const wf = JSON.parse(res.body) as { id: string; steps: unknown[] };
    expect(wf.id).toBe("default-dev-cicd");
    expect(wf.steps.length).toBeGreaterThan(0);
  });

  it("GET /v1/workflow/state returns initial run state", async () => {
    const res = await request(port, "GET", "/v1/workflow/state");
    expect(res.status).toBe(200);
    const state = JSON.parse(res.body) as { workflowId: string; currentStepId: string };
    expect(state.workflowId).toBe("default-dev-cicd");
    expect(state.currentStepId).toBe("prd");
  });

  it("POST /v1/workflows/init materializes default workflow on empty project", async () => {
    const emptyTmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-empty-"));
    const emptyServer = startAgentServer({
      port: 0,
      getApiKey: () => "test-key",
      getWorkspaceRoot: () => emptyTmp,
    });
    const emptyPort = await listenPort(emptyServer);

    const listBefore = await request(emptyPort, "GET", "/v1/workflows");
    expect(listBefore.status).toBe(200);
    const before = JSON.parse(listBefore.body) as { workflows: unknown[] };
    expect(before.workflows).toHaveLength(0);

    const initRes = await request(
      emptyPort,
      "POST",
      "/v1/workflows/init",
      JSON.stringify({ templateId: "default-dev-cicd" }),
    );
    expect(initRes.status).toBe(200);
    const initBody = JSON.parse(initRes.body) as { workflowId: string };
    expect(initBody.workflowId).toBe("default-dev-cicd");

    const stateRes = await request(emptyPort, "GET", "/v1/workflow/state");
    expect(stateRes.status).toBe(200);

    emptyServer.close();
    await fs.rm(emptyTmp, { recursive: true, force: true });
  });

  it("GET /v1/resources/context returns resolved resources", async () => {
    const res = await request(port, "GET", "/v1/resources/context");
    expect(res.status).toBe(200);
    const context = JSON.parse(res.body) as {
      markdown: string;
      resources: Array<{ type: string; name: string }>;
    };
    expect(context.resources.length).toBeGreaterThan(0);
    expect(context.resources.some((r) => r.name === "app-db")).toBe(true);
    expect(context.markdown).toContain("## Available Server Resources");
  });

  it("GET /v1/workflow/dispatch returns dispatcher decision", async () => {
    const res = await request(port, "GET", "/v1/workflow/dispatch");
    expect(res.status).toBe(200);
    const decision = JSON.parse(res.body) as { action: string; stepId: string };
    expect(decision.action).toBe("run");
    expect(decision.stepId).toBe("prd");
  });

  it("POST /v1/workflow/intent sets FAST_PATH active steps", async () => {
    const res = await request(
      port,
      "POST",
      "/v1/workflow/intent",
      JSON.stringify({ intent: "BUG_FIX", risk: "LOW" }),
    );
    expect(res.status).toBe(200);
    const state = JSON.parse(res.body) as { activeStepIds: string[]; currentStepId: string };
    expect(state.activeStepIds).toEqual(["be-dev", "test", "cicd"]);
    expect(state.currentStepId).toBe("be-dev");
  });

  it("POST /v1/eval/run returns harness score", async () => {
    const res = await request(port, "POST", "/v1/eval/run", "{}");
    expect(res.status).toBe(200);
    const report = JSON.parse(res.body) as { totalScore: number; dimensions: unknown[] };
    expect(typeof report.totalScore).toBe("number");
    expect(report.dimensions.length).toBe(4);
  });

  it("GET /v1/workspace/list returns project entries", async () => {
    await fs.mkdir(path.join(tmp, "docs"), { recursive: true });
    await fs.writeFile(path.join(tmp, "docs/PRD.md"), "# PRD\n\nContent here.", "utf8");

    const res = await request(port, "GET", "/v1/workspace/list?path=docs");
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body) as {
      entries: Array<{ name: string; type: string }>;
      exists: boolean;
    };
    expect(data.entries.some((e) => e.name === "PRD.md")).toBe(true);
    expect(data.exists).toBe(true);
  });

  it("GET /v1/workspace/list returns empty entries when path missing", async () => {
    const res = await request(port, "GET", "/v1/workspace/list?path=backend/migrations");
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body) as {
      entries: unknown[];
      exists: boolean;
    };
    expect(data.entries).toEqual([]);
    expect(data.exists).toBe(false);
  });

  it("PUT /v1/workspace/file writes and reads back", async () => {
    const writeRes = await request(
      port,
      "PUT",
      "/v1/workspace/file",
      JSON.stringify({ path: "docs/new.md", content: "# New doc" }),
    );
    expect(writeRes.status).toBe(200);

    const readRes = await request(port, "GET", "/v1/workspace/file?path=docs/new.md");
    expect(readRes.status).toBe(200);
    const file = JSON.parse(readRes.body) as { content: string };
    expect(file.content).toBe("# New doc");
  });

  it("GET /v1/workspace/deployment returns deployment summary", async () => {
    const res = await request(port, "GET", "/v1/workspace/deployment");
    expect(res.status).toBe(200);
    const config = JSON.parse(res.body) as { platform: string; databases: unknown[] };
    expect(config.platform).toBeDefined();
    expect(config.databases.length).toBeGreaterThan(0);
  });
});
