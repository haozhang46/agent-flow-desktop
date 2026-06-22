// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ChatMessage } from "@agent-flow/shared-ui";
import { migrateLocalChatIfNeeded } from "../../src/composables/migrateLocalChat";

const SIDECAR_PORT = 9876;
const API_BASE = `http://127.0.0.1:${SIDECAR_PORT}`;
const LOCAL_THREAD_ID = "local-thread-1";
const SERVER_THREAD_ID = "server-thread-1";

const localMessages: ChatMessage[] = [
  { role: "user", content: "hello from local" },
  { role: "assistant", content: "hi there" },
];

describe("migrateLocalChatIfNeeded", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      "desktop:threads",
      JSON.stringify([
        {
          id: LOCAL_THREAD_ID,
          title: "Imported Chat",
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
      ]),
    );
    localStorage.setItem(`messages:${LOCAL_THREAD_ID}`, JSON.stringify(localMessages));
    localStorage.setItem(
      `desktop:thread-meta:${LOCAL_THREAD_ID}`,
      JSON.stringify({ mode: "plan", skills: ["brainstorming"] }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("imports localStorage threads when server list is empty", async () => {
    let serverThreads: { id: string }[] = [];
    const fetchCalls: { url: string; method: string; body?: unknown }[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        let body: unknown;
        if (init?.body) {
          body = JSON.parse(String(init.body));
        }
        fetchCalls.push({ url, method, body });

        if (url === `${API_BASE}/v1/chat-memory/threads?scope=app` && method === "GET") {
          return new Response(JSON.stringify(serverThreads), { status: 200 });
        }

        if (url === `${API_BASE}/v1/chat-memory/threads` && method === "POST") {
          serverThreads = [{ id: SERVER_THREAD_ID }];
          return new Response(
            JSON.stringify({
              id: SERVER_THREAD_ID,
              title: "Imported Chat",
              createdAt: "2026-06-20T00:00:00.000Z",
              updatedAt: "2026-06-20T00:00:00.000Z",
              checkpointThreadId: `app:plan:${SERVER_THREAD_ID}`,
              mode: "plan",
              skills: ["brainstorming"],
            }),
            { status: 201 },
          );
        }

        if (
          url ===
            `${API_BASE}/v1/chat-memory/threads/${SERVER_THREAD_ID}/messages?scope=app` &&
          method === "PUT"
        ) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }

        return new Response("not found", { status: 404 });
      }),
    );

    const createThread = vi.fn(async () => SERVER_THREAD_ID);
    const loadThreads = vi.fn(async () => {
      // simulate composable refreshing threads ref from GET
    });

    const migrated = await migrateLocalChatIfNeeded({
      fetchApiBase: async () => API_BASE,
      loadThreads,
      getServerThreadCount: () => serverThreads.length,
      createThread,
    });

    expect(migrated).toBe(true);
    expect(createThread).toHaveBeenCalledWith("Imported Chat", {
      mode: "plan",
      skills: ["brainstorming"],
    });
    expect(
      fetchCalls.some(
        (c) =>
          c.method === "PUT" &&
          c.url.includes(`/threads/${SERVER_THREAD_ID}/messages`) &&
          (c.body as { messages: ChatMessage[] }).messages.length === 2,
      ),
    ).toBe(true);
    expect(localStorage.getItem("desktop:threads")).toBeNull();
    expect(localStorage.getItem(`messages:${LOCAL_THREAD_ID}`)).toBeNull();
    expect(localStorage.getItem(`desktop:thread-meta:${LOCAL_THREAD_ID}`)).toBeNull();
    expect(loadThreads).toHaveBeenCalledTimes(2);
  });

  it("skips import when server already has threads", async () => {
    const createThread = vi.fn();
    const loadThreads = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify([{ id: "existing" }]), { status: 200 });
      }),
    );

    const migrated = await migrateLocalChatIfNeeded({
      fetchApiBase: async () => API_BASE,
      loadThreads,
      getServerThreadCount: () => 1,
      createThread,
    });

    expect(migrated).toBe(false);
    expect(createThread).not.toHaveBeenCalled();
    expect(localStorage.getItem("desktop:threads")).not.toBeNull();
  });

  it("skips import when localStorage has no threads", async () => {
    localStorage.clear();
    const createThread = vi.fn();
    const loadThreads = vi.fn();

    const migrated = await migrateLocalChatIfNeeded({
      fetchApiBase: async () => API_BASE,
      loadThreads,
      getServerThreadCount: () => 0,
      createThread,
    });

    expect(migrated).toBe(false);
    expect(createThread).not.toHaveBeenCalled();
  });
});
