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
import { clarificationService } from "../../electron/agent/clarificationService";
import { agentService } from "../../electron/agent/agentService";

const askArgs = {
  question: "Need web search?",
  options: [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" },
  ],
  allow_multiple: false,
  allow_free_text: true,
};

function request(
  port: number,
  method: string,
  urlPath: string,
  body?: string,
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
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
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: data,
            headers: res.headers,
          }),
        );
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

function clarificationPath(threadId: string, clarificationId: string): string {
  return `/v1/threads/${encodeURIComponent(threadId)}/clarifications/${encodeURIComponent(clarificationId)}`;
}

describe("clarification answer routes", () => {
  let tmp: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-clarify-routes-"));
    clarificationService.cancelThread("ask:t1");
    clarificationService.cancelThread("agent:t1");
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
    vi.restoreAllMocks();
  });

  it("returns 404 when clarification is unknown", async () => {
    const res = await request(
      port,
      "POST",
      clarificationPath("ask:t1", "missing"),
      JSON.stringify({ selected_option_ids: ["yes"] }),
    );
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual(
      expect.objectContaining({ detail: expect.any(String) }),
    );
  });

  it("returns 400 when selected_option_ids are invalid", async () => {
    clarificationService.createPending("ask:t1", "call_1", askArgs);
    const res = await request(
      port,
      "POST",
      clarificationPath("ask:t1", "call_1"),
      JSON.stringify({ selected_option_ids: ["not-a-real-option"] }),
    );
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual(
      expect.objectContaining({ detail: expect.any(String) }),
    );
  });

  it("returns 409 when clarification was already answered", async () => {
    clarificationService.createPending("ask:t1", "call_1", askArgs);
    clarificationService.markAnswered("ask:t1", "call_1");
    const res = await request(
      port,
      "POST",
      clarificationPath("ask:t1", "call_1"),
      JSON.stringify({ selected_option_ids: ["yes"] }),
    );
    expect(res.status).toBe(409);
    expect(JSON.parse(res.body)).toEqual(
      expect.objectContaining({ detail: expect.any(String) }),
    );
  });

  it("returns 400 when body fails schema validation", async () => {
    const res = await request(
      port,
      "POST",
      clarificationPath("ask:t1", "call_1"),
      JSON.stringify({ selected_option_ids: "yes" }),
    );
    expect(res.status).toBe(400);
  });

  it("resumes with SSE stream on success", async () => {
    clarificationService.createPending("ask:t1", "call_1", askArgs);

    async function* fakeResume() {
      yield {
        event: "on_chat_model_stream" as const,
        data: { chunk: { content: "ok" } },
      };
    }

    vi.spyOn(agentService, "resumeClarification").mockImplementation(
      (async function* () {
        yield* fakeResume();
      }) as typeof agentService.resumeClarification,
    );

    const res = await request(
      port,
      "POST",
      clarificationPath("ask:t1", "call_1"),
      JSON.stringify({ selected_option_ids: ["yes"], mode: "ask" }),
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.body).toContain("event: message");
    expect(res.body).toContain("event: done");
    expect(agentService.resumeClarification).toHaveBeenCalledWith(
      "ask:t1",
      "call_1",
      { selected_option_ids: ["yes"] },
      expect.objectContaining({ mode: "ask" }),
    );
  });
});

describe("chat SSE clarification events", () => {
  let tmp: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-clarify-chat-"));
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
    vi.restoreAllMocks();
  });

  it("emits clarification SSE and done.awaiting_clarification from /v1/chat", async () => {
    async function* fakeStream() {
      yield {
        event: "clarification" as const,
        data: {
          clarification_id: "call_1",
          thread_id: "ask:t-chat",
          question: "Need web search?",
          options: askArgs.options,
          allow_multiple: false,
          allow_free_text: true,
          status: "pending",
        },
      };
      yield { event: "awaiting_clarification" as const };
    }

    vi.spyOn(agentService, "streamEvents").mockImplementation(
      (async function* () {
        yield* fakeStream();
      }) as typeof agentService.streamEvents,
    );

    const res = await request(
      port,
      "POST",
      "/v1/chat",
      JSON.stringify({
        thread_id: "t-chat",
        message: "hello",
        mode: "ask",
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body).toContain("event: clarification");
    expect(res.body).toContain('"clarification_id":"call_1"');
    expect(res.body).toContain("event: done");
    expect(res.body).toContain('"awaiting_clarification":true');
  });
});
