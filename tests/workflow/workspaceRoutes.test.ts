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
import {
  createWorkflowFromTemplate,
  initProjectFromTemplate,
} from "../../electron/workflow/loader";
import { workspacePath } from "../../electron/workflow/workspaceLoader";

function workspacePutPath(workflowId: string, stepId: string): string {
  return `/v1/workflows/${workflowId}/workspaces/${stepId}?confirmed=1`;
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

const FE_DEV_WORKSPACE = {
  version: 1,
  stepId: "fe-dev",
  layout: "tabs",
  components: [
    {
      id: "code",
      type: "code-explorer",
      label: "代码",
      props: { root: "fe", writable: false },
    },
  ],
};

describe("workspace API routes", () => {
  let tmp: string;
  let server: http.Server;
  let port: number;
  let workflowId: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-ws-routes-"));
    await initProjectFromTemplate(tmp, "default-dev-cicd");
    workflowId = "default-dev-cicd";
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

  it("GET /v1/workspace/registry returns component metadata", async () => {
    const res = await request(port, "GET", "/v1/workspace/registry");
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as {
      components: Array<{ type: string; label: string; propsFields: unknown[] }>;
    };
    expect(Array.isArray(body.components)).toBe(true);
    expect(body.components.some((c) => c.type === "code-explorer")).toBe(true);
    expect(body.components.find((c) => c.type === "code-explorer")?.propsFields.length).toBeGreaterThan(
      0,
    );
  });

  it("POST /v1/workspace/component-types/apply requires confirmed", async () => {
    const typeDef = {
      type: "my-checklist",
      label: "Checklist",
      description: "d",
      category: "custom",
      defaultProps: {},
      propsFields: [],
    };
    const denied = await request(
      port,
      "POST",
      "/v1/workspace/component-types/apply",
      JSON.stringify({ scope: "project", typeDef }),
    );
    expect(denied.status).toBe(400);
    expect(denied.body).toMatch(/agentflow_write_requires_confirmation/);

    const res = await request(
      port,
      "POST",
      "/v1/workspace/component-types/apply",
      JSON.stringify({ scope: "project", typeDef, confirmed: true }),
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { ok: boolean; path: string };
    expect(body.ok).toBe(true);
    expect(body.path).toContain(`${path.sep}.agentflow${path.sep}component-types${path.sep}my-checklist.json`);
    const saved = JSON.parse(await fs.readFile(body.path, "utf8")) as { type: string };
    expect(saved.type).toBe("my-checklist");
  });

  it("PUT workspace with custom component type succeeds after apply", async () => {
    const typeDef = {
      type: "my-checklist",
      label: "Checklist",
      description: "d",
      category: "custom",
      defaultProps: {},
      propsFields: [{ key: "title", label: "Title", type: "string" }],
    };
    const applyRes = await request(
      port,
      "POST",
      "/v1/workspace/component-types/apply",
      JSON.stringify({ scope: "project", typeDef, confirmed: true }),
    );
    expect(applyRes.status).toBe(200);

    const customWorkspace = {
      version: 1,
      stepId: "fe-dev",
      layout: "tabs",
      components: [
        { id: "check", type: "my-checklist", props: { title: "ok" } },
      ],
    };
    const putRes = await request(
      port,
      "PUT",
      workspacePutPath(workflowId, "fe-dev"),
      JSON.stringify(customWorkspace),
    );
    expect(putRes.status).toBe(200);
    const getRes = await request(
      port,
      "GET",
      `/v1/workflows/${workflowId}/workspaces/fe-dev`,
    );
    expect(getRes.status).toBe(200);
    const loaded = JSON.parse(getRes.body) as typeof customWorkspace;
    expect(loaded.components[0]?.type).toBe("my-checklist");
  });

  it("GET /v1/workflows/{id}/workspaces returns bundled step ids after init", async () => {
    const res = await request(port, "GET", `/v1/workflows/${workflowId}/workspaces`);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { workflowId: string; stepIds: string[] };
    expect(body.workflowId).toBe(workflowId);
    expect(body.stepIds).toEqual([
      "architecture",
      "be-dev",
      "cicd",
      "fe-dev",
      "prd",
      "review",
      "test",
      "test-2",
    ]);
  });

  it("PUT then GET round-trips workspace on legacy path", async () => {
    const putRes = await request(
      port,
      "PUT",
      workspacePutPath(workflowId, "fe-dev"),
      JSON.stringify(FE_DEV_WORKSPACE),
    );
    expect(putRes.status).toBe(200);
    const saved = JSON.parse(putRes.body) as typeof FE_DEV_WORKSPACE;
    expect(saved.stepId).toBe("fe-dev");

    const legacyPath = workspacePath(tmp, workflowId, "fe-dev", true);
    const exists = await fs
      .access(legacyPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    const getRes = await request(port, "GET", `/v1/workflows/${workflowId}/workspaces/fe-dev`);
    expect(getRes.status).toBe(200);
    const loaded = JSON.parse(getRes.body) as typeof FE_DEV_WORKSPACE;
    expect(loaded).toEqual(FE_DEV_WORKSPACE);
  });

  it("GET /v1/workflows/{id}/workspaces lists saved step ids including bundled defaults", async () => {
    await request(
      port,
      "PUT",
      workspacePutPath(workflowId, "fe-dev"),
      JSON.stringify(FE_DEV_WORKSPACE),
    );
    await request(
      port,
      "PUT",
      workspacePutPath(workflowId, "prd"),
      JSON.stringify({
        version: 1,
        stepId: "prd",
        layout: "stack",
        components: [{ id: "doc", type: "markdown-doc", props: {} }],
      }),
    );

    const res = await request(port, "GET", `/v1/workflows/${workflowId}/workspaces`);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { stepIds: string[] };
    expect(body.stepIds).toEqual([
      "architecture",
      "be-dev",
      "cicd",
      "fe-dev",
      "prd",
      "review",
      "test",
      "test-2",
    ]);
  });

  it("GET missing workspace returns 404", async () => {
    const res = await request(port, "GET", `/v1/workflows/${workflowId}/workspaces/missing-step`);
    expect(res.status).toBe(404);
    const body = JSON.parse(res.body) as { detail: string };
    expect(body.detail).toContain("missing-step");
  });

  it("PUT invalid workspace returns 400 with Zod detail", async () => {
    const res = await request(
      port,
      "PUT",
      workspacePutPath(workflowId, "fe-dev"),
      JSON.stringify({
        version: 1,
        stepId: "fe-dev",
        layout: "tabs",
        components: [{ id: "code", type: "code-explorer", props: {} }],
      }),
    );
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body) as { detail: string; errors?: unknown[] };
    expect(body.detail).toBeTruthy();
    expect(body.errors?.length).toBeGreaterThan(0);
  });

  it("PUT invalid JSON returns 400", async () => {
    const res = await request(
      port,
      "PUT",
      workspacePutPath(workflowId, "fe-dev"),
      "{not-json",
    );
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body) as { detail: string };
    expect(body.detail).toBe("invalid JSON");
  });

  it("PUT stepId mismatch returns 400", async () => {
    const res = await request(
      port,
      "PUT",
      workspacePutPath(workflowId, "fe-dev"),
      JSON.stringify({
        version: 1,
        stepId: "prd",
        layout: "tabs",
        components: [{ id: "doc", type: "markdown-doc", props: {} }],
      }),
    );
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body) as { detail: string };
    expect(body.detail).toMatch(/stepId mismatch/i);
  });

  it("GET unknown workflow returns 404", async () => {
    const res = await request(port, "GET", "/v1/workflows/unknown-wf/workspaces");
    expect(res.status).toBe(404);
    const body = JSON.parse(res.body) as { detail: string };
    expect(body.detail).toContain("unknown-wf");
  });
});

describe("workspace API routes (modern workflow)", () => {
  let tmp: string;
  let server: http.Server;
  let port: number;
  let workflowId: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-ws-modern-"));
    await initProjectFromTemplate(tmp, "default-dev-cicd");
    workflowId = await createWorkflowFromTemplate(tmp, "default-dev-cicd", "modern-wf");
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

  it("saves workspace under workflows/{id}/workspaces/", async () => {
    const putRes = await request(
      port,
      "PUT",
      workspacePutPath(workflowId, "be-dev"),
      JSON.stringify({
        version: 1,
        stepId: "be-dev",
        layout: "stack",
        components: [{ id: "code", type: "code-explorer", props: { root: "backend" } }],
      }),
    );
    expect(putRes.status).toBe(200);

    const modernPath = workspacePath(tmp, workflowId, "be-dev", false);
    const exists = await fs
      .access(modernPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
    expect(modernPath).toContain(path.join(".agentflow", "workflows", workflowId, "workspaces"));
  });

  it("lists bundled workspaces copied from template on create", async () => {
    const res = await request(port, "GET", `/v1/workflows/${workflowId}/workspaces`);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { stepIds: string[] };
    expect(body.stepIds).toContain("fe-dev");
    expect(body.stepIds.length).toBe(8);

    const getFe = await request(port, "GET", `/v1/workflows/${workflowId}/workspaces/fe-dev`);
    expect(getFe.status).toBe(200);
    const feDev = JSON.parse(getFe.body) as { components: Array<{ type: string }> };
    expect(feDev.components.map((c) => c.type)).toEqual([
      "fe-architecture-plan",
      "markdown-doc",
      "topology-context",
      "agent-rules-editor",
      "style-tokens-editor",
      "code-explorer",
    ]);
  });
});
