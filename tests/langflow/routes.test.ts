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

vi.mock("../../electron/langflow/service", () => ({
  getLangflowStatus: vi.fn(),
  listWorkspaceFlows: vi.fn(),
  createWorkspaceFlow: vi.fn(),
  setActiveWorkspaceFlow: vi.fn(),
}));

import { startAgentServer } from "../../electron/agent/server";
import {
  createWorkspaceFlow,
  getLangflowStatus,
  listWorkspaceFlows,
  setActiveWorkspaceFlow,
} from "../../electron/langflow/service";

const mockedGetLangflowStatus = vi.mocked(getLangflowStatus);
const mockedListWorkspaceFlows = vi.mocked(listWorkspaceFlows);
const mockedCreateWorkspaceFlow = vi.mocked(createWorkspaceFlow);
const mockedSetActiveWorkspaceFlow = vi.mocked(setActiveWorkspaceFlow);

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

describe("langflow routes", () => {
  let tmp: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-langflow-routes-"));
    mockedGetLangflowStatus.mockReset();
    mockedListWorkspaceFlows.mockReset();
    mockedCreateWorkspaceFlow.mockReset();
    mockedSetActiveWorkspaceFlow.mockReset();

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

  it("GET /v1/langflow/status returns langflow status", async () => {
    mockedGetLangflowStatus.mockResolvedValue({
      ok: true,
      baseUrl: "http://localhost:7860",
      mode: "external",
    });

    const res = await request(port, "GET", "/v1/langflow/status");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      ok: true,
      baseUrl: "http://localhost:7860",
      mode: "external",
    });
    expect(mockedGetLangflowStatus).toHaveBeenCalledOnce();
  });

  it("GET /v1/langflow/flows returns flows and activeFlowId", async () => {
    mockedListWorkspaceFlows.mockResolvedValue({
      flows: [{ id: "flow-1", name: "Pipeline A" }],
      activeFlowId: "flow-1",
    });

    const res = await request(port, "GET", "/v1/langflow/flows");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      flows: [{ id: "flow-1", name: "Pipeline A" }],
      activeFlowId: "flow-1",
    });
    expect(mockedListWorkspaceFlows).toHaveBeenCalledWith(tmp);
  });

  it("POST /v1/langflow/flows creates a flow", async () => {
    mockedCreateWorkspaceFlow.mockResolvedValue({ id: "flow-new", name: "New Flow" });

    const res = await request(port, "POST", "/v1/langflow/flows", JSON.stringify({ name: "New Flow" }));
    expect(res.status).toBe(201);
    expect(JSON.parse(res.body)).toEqual({ id: "flow-new", name: "New Flow" });
    expect(mockedCreateWorkspaceFlow).toHaveBeenCalledWith(tmp, "New Flow");
  });

  it("POST /v1/langflow/active sets active flow and returns workflow", async () => {
    const workflow = {
      version: 1 as const,
      id: "flow-abc",
      title: "My Pipeline",
      steps: [
        {
          id: "prd",
          title: "PRD",
          executor: "deepseek" as const,
          skills: [],
          outputs: [],
          gate: "manual" as const,
          requires_resources: [],
        },
      ],
      edges: [],
      resources: [],
    };
    mockedSetActiveWorkspaceFlow.mockResolvedValue(workflow);

    const res = await request(
      port,
      "POST",
      "/v1/langflow/active",
      JSON.stringify({ flowId: "flow-abc" }),
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual(workflow);
    expect(mockedSetActiveWorkspaceFlow).toHaveBeenCalledWith(tmp, "flow-abc");
  });

  it("POST /v1/langflow/active returns 400 on service error", async () => {
    mockedSetActiveWorkspaceFlow.mockRejectedValue(
      new Error("Flow has no step nodes with data.metadata.id"),
    );

    const res = await request(
      port,
      "POST",
      "/v1/langflow/active",
      JSON.stringify({ flowId: "empty-flow" }),
    );
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({
      detail: "Flow has no step nodes with data.metadata.id",
    });
  });
});
