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
import type { WorkspaceFile } from "../../electron/workspace/types";

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

describe("Workspace HTTP routes /v1/workspace", () => {
  let tmp: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ws-routes-"));
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

  it("GET /v1/workspace returns synthetic main root when missing", async () => {
    const res = await request(port, "GET", "/v1/workspace");
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as {
      workspace: WorkspaceFile;
      roots: { id: string; label: string; path: string; absolutePath: string }[];
    };
    expect(body.workspace.roots).toEqual([
      { id: "main", path: ".", label: path.basename(tmp) },
    ]);
    expect(body.roots).toHaveLength(1);
    expect(body.roots[0]).toMatchObject({
      id: "main",
      path: ".",
      label: path.basename(tmp),
      absolutePath: path.resolve(tmp),
    });
  });

  it("PUT /v1/workspace saves and returns workspace + resolved roots", async () => {
    const sibling = await fs.mkdtemp(path.join(os.tmpdir(), "api-"));
    const file: WorkspaceFile = {
      version: 1,
      name: "plat",
      roots: [
        { id: "main", path: ".", label: "Main" },
        { id: "api", path: path.relative(tmp, sibling), label: "API" },
      ],
      defaults: { analyzeRootIds: ["main", "api"] },
    };

    const res = await request(
      port,
      "PUT",
      "/v1/workspace",
      JSON.stringify(file),
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as {
      workspace: WorkspaceFile;
      roots: { id: string; absolutePath: string }[];
    };
    expect(body.workspace.name).toBe("plat");
    expect(body.workspace.roots.map((r) => r.id)).toEqual(["main", "api"]);
    expect(body.roots.find((r) => r.id === "api")?.absolutePath).toBe(
      path.resolve(sibling),
    );

    const raw = JSON.parse(
      await fs.readFile(path.join(tmp, "workspace.json"), "utf8"),
    ) as WorkspaceFile;
    expect(raw.name).toBe("plat");

    const get = await request(port, "GET", "/v1/workspace");
    expect(JSON.parse(get.body).workspace.name).toBe("plat");

    await fs.rm(sibling, { recursive: true, force: true });
  });

  it("PUT /v1/workspace rejects invalid body", async () => {
    const res = await request(
      port,
      "PUT",
      "/v1/workspace",
      JSON.stringify({ version: 2 }),
    );
    expect(res.status).toBe(400);
  });

  it("does not steal /v1/workspace/registry", async () => {
    const res = await request(port, "GET", "/v1/workspace/registry");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).components).toBeDefined();
  });
});
