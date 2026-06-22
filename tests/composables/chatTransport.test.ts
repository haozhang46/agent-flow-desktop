// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openChatStream } from "../../src/composables/chatTransport";

describe("openChatStream", () => {
  beforeEach(() => {
    window.desktop = {
      getSidecarPort: vi.fn().mockResolvedValue(8765),
    } as unknown as typeof window.desktop;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts agent chat body to /v1/chat", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    let capturedUrl = "";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        capturedUrl = String(input);
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("event: done\ndata: {}\n\n"));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }),
    );

    const stream = await openChatStream({
      kind: "agent",
      message: "hello",
      checkpointThreadId: "free:wf-1:thread-1",
      mode: "agent",
      workflowId: "wf-1",
    });
    await stream.next();

    expect(capturedUrl).toBe("http://127.0.0.1:8765/v1/chat");
    expect(capturedBody).toEqual({
      message: "hello",
      thread_id: "free:wf-1:thread-1",
      mode: "agent",
      workflowId: "wf-1",
    });
  });

  it("posts file chat body to /v1/workspace/file-chat", async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("event: done\ndata: {}\n\n"));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }),
    );

    const stream = await openChatStream({
      kind: "file",
      message: "hello",
      paths: ["docs/a.md"],
      skills: ["brainstorming"],
      stepId: "prd",
      uiThreadId: "thread-1",
      workflowId: "wf-1",
    });
    await stream.next();

    expect(capturedBody).toEqual({
      paths: ["docs/a.md"],
      message: "hello",
      skills: ["brainstorming"],
      stepId: "prd",
      threadId: "thread-1",
      workflowId: "wf-1",
    });
  });
});
