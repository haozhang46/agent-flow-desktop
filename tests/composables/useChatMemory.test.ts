// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { useChatMemory } from "../../src/composables/useChatMemory";

const SIDECAR_PORT = 9876;
const THREAD_ID = "thread-abc";

const threadMeta = {
  id: THREAD_ID,
  title: "Test Chat",
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z",
  checkpointThreadId: "app:agent:thread-abc",
  mode: "agent" as const,
};

describe("useChatMemory", () => {
  beforeEach(() => {
    window.desktop = {
      getSidecarPort: vi.fn().mockResolvedValue(SIDECAR_PORT),
    } as unknown as typeof window.desktop;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("create + select loads messages", async () => {
    let listCallCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url === `http://127.0.0.1:${SIDECAR_PORT}/v1/chat-memory/threads?scope=app`) {
          listCallCount += 1;
          const threads = listCallCount > 1 ? [threadMeta] : [];
          return new Response(JSON.stringify(threads), { status: 200 });
        }

        if (
          url === `http://127.0.0.1:${SIDECAR_PORT}/v1/chat-memory/threads` &&
          method === "POST"
        ) {
          return new Response(JSON.stringify(threadMeta), { status: 201 });
        }

        if (
          url ===
            `http://127.0.0.1:${SIDECAR_PORT}/v1/chat-memory/threads/${THREAD_ID}?scope=app` &&
          method === "GET"
        ) {
          return new Response(
            JSON.stringify({
              meta: threadMeta,
              messages: [{ role: "user", content: "hello" }],
            }),
            { status: 200 },
          );
        }

        return new Response("not found", { status: 404 });
      }),
    );

    const memory = useChatMemory({ kind: "app" });
    await flushPromises();

    const id = await memory.createThread("Test Chat");
    await flushPromises();

    expect(id).toBe(THREAD_ID);
    expect(memory.activeThreadId.value).toBe(THREAD_ID);
    expect(memory.messages.value).toEqual([{ role: "user", content: "hello" }]);
    expect(window.desktop.getSidecarPort).toHaveBeenCalled();
  });
});
