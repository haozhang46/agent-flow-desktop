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

vi.mock("../../electron/chatMemory/generateTitle", () => ({
  generateThreadTitle: vi.fn().mockResolvedValue("Login help"),
}));

import { startAgentServer } from "../../electron/agent/server";

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

describe("chat memory routes", () => {
  let tmp: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-chatmem-routes-"));
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

  it("returns 400 when workspace not set", async () => {
    const noWorkspaceServer = startAgentServer({
      port: 0,
      getApiKey: () => "test-key",
      getWorkspaceRoot: () => "",
    });
    const noWorkspacePort = await listenPort(noWorkspaceServer);

    try {
      const res = await request(noWorkspacePort, "GET", "/v1/chat-memory/threads?scope=app");
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ detail: "workspace not set" });
    } finally {
      await new Promise<void>((resolve) => noWorkspaceServer.close(() => resolve()));
    }
  });

  it("creates app thread, lists, loads, saves messages, and reloads", async () => {
    const createRes = await request(
      port,
      "POST",
      "/v1/chat-memory/threads",
      JSON.stringify({ scope: "app", title: "Test Chat", mode: "agent" }),
    );
    expect(createRes.status).toBe(201);
    const created = JSON.parse(createRes.body) as { id: string; title: string };
    expect(created.title).toBe("Test Chat");
    expect(created.id).toBeTruthy();

    const listRes = await request(port, "GET", "/v1/chat-memory/threads?scope=app");
    expect(listRes.status).toBe(200);
    const list = JSON.parse(listRes.body) as Array<{ id: string }>;
    expect(list.some((t) => t.id === created.id)).toBe(true);

    const loadRes = await request(
      port,
      "GET",
      `/v1/chat-memory/threads/${created.id}?scope=app`,
    );
    expect(loadRes.status).toBe(200);
    const loaded = JSON.parse(loadRes.body) as {
      meta: { id: string };
      messages: unknown[];
    };
    expect(loaded.meta.id).toBe(created.id);
    expect(loaded.messages).toEqual([]);

    const saveRes = await request(
      port,
      "PUT",
      `/v1/chat-memory/threads/${created.id}/messages?scope=app`,
      JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
      }),
    );
    expect(saveRes.status).toBe(200);
    expect(JSON.parse(saveRes.body)).toEqual({ ok: true });

    const reloadRes = await request(
      port,
      "GET",
      `/v1/chat-memory/threads/${created.id}?scope=app`,
    );
    expect(reloadRes.status).toBe(200);
    const reloaded = JSON.parse(reloadRes.body) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(reloaded.messages).toHaveLength(1);
    expect(reloaded.messages[0]).toEqual({ role: "user", content: "hello" });
  });

  it("generates auto title after first turn", async () => {
    const createRes = await request(
      port,
      "POST",
      "/v1/chat-memory/threads",
      JSON.stringify({ scope: "app", title: "New Chat", mode: "agent" }),
    );
    const created = JSON.parse(createRes.body) as { id: string };

    await request(
      port,
      "PUT",
      `/v1/chat-memory/threads/${created.id}/messages?scope=app`,
      JSON.stringify({
        messages: [
          { role: "user", content: "Fix login" },
          { role: "assistant", content: "Sure, checking auth." },
        ],
      }),
    );

    const genRes = await request(
      port,
      "POST",
      `/v1/chat-memory/threads/${created.id}/generate-title?scope=app`,
    );
    expect(genRes.status).toBe(200);
    const meta = JSON.parse(genRes.body) as { title: string; titleSource: string };
    expect(meta.title).toBe("Login help");
    expect(meta.titleSource).toBe("auto");
  });

  it("returns 409 when user renamed title", async () => {
    const createRes = await request(
      port,
      "POST",
      "/v1/chat-memory/threads",
      JSON.stringify({ scope: "app", title: "Custom", mode: "agent" }),
    );
    const created = JSON.parse(createRes.body) as { id: string };

    await request(
      port,
      "PATCH",
      `/v1/chat-memory/threads/${created.id}?scope=app`,
      JSON.stringify({ title: "My title", titleSource: "user" }),
    );

    const genRes = await request(
      port,
      "POST",
      `/v1/chat-memory/threads/${created.id}/generate-title?scope=app`,
    );
    expect(genRes.status).toBe(409);
  });
});
