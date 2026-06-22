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

vi.mock("../../electron/agent/fileChatService", () => ({
  streamFileChat: vi.fn(async function* () {
    yield { type: "message", content: "Updated AGENTS.md" };
    yield { type: "done" };
  }),
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

function requestSse(
  port: number,
  urlPath: string,
  body: string,
): Promise<{ status: number; events: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        method: "POST",
        path: urlPath,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, events: data }));
      },
    );
    req.on("error", reject);
    req.write(body);
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

describe("POST /v1/workspace/file-chat", () => {
  let tmp: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-filechat-srv-"));
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

  it("returns 400 when paths missing", async () => {
    const res = await requestSse(
      port,
      "/v1/workspace/file-chat",
      JSON.stringify({ message: "hi", threadId: "thread-1" }),
    );
    expect(res.status).toBe(400);
    expect(res.events).toContain("paths required");
  });

  it("returns 400 when threadId missing", async () => {
    const res = await requestSse(
      port,
      "/v1/workspace/file-chat",
      JSON.stringify({ paths: ["AGENTS.md"], message: "hi" }),
    );
    expect(res.status).toBe(400);
    expect(res.events).toContain("threadId required");
  });

  it("streams SSE done without changing workflow step status", async () => {
    await request(port, "GET", "/v1/workflow/state");

    const statePath = path.join(tmp, ".agentflow/state.json");
    const before = JSON.parse(await fs.readFile(statePath, "utf8")) as {
      stepStatuses: Record<string, string>;
    };

    const res = await requestSse(
      port,
      "/v1/workspace/file-chat",
      JSON.stringify({
        paths: ["AGENTS.md"],
        message: "--- AGENTS.md ---\n# stub\n--- end AGENTS.md ---\n\n初始化",
        skills: ["brainstorming"],
        threadId: "client-thread-1",
        stepId: "init",
      }),
    );

    expect(res.status).toBe(200);
    expect(res.events).toContain("event: message");
    expect(res.events).toContain("event: done");

    const after = JSON.parse(await fs.readFile(statePath, "utf8")) as {
      stepStatuses: Record<string, string>;
    };
    expect(after.stepStatuses).toEqual(before.stepStatuses);
  });
});
