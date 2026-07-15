// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { submitClarification } from "../../src/composables/chatTransport";
import { useClarification } from "../../src/composables/useClarification";
import type { ClarificationSsePayload } from "@agent-flow/shared-ui";

const payload: ClarificationSsePayload = {
  clarification_id: "call_1",
  thread_id: "ask:t1",
  question: "Need network?",
  options: [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" },
  ],
  allow_multiple: false,
  allow_free_text: true,
  status: "pending",
};

describe("submitClarification", () => {
  beforeEach(() => {
    window.desktop = {
      getSidecarPort: vi.fn().mockResolvedValue(8765),
    } as unknown as typeof window.desktop;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs answer body to clarification resume URL", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> | null = null;

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

    const stream = await submitClarification("ask:t1", "call_1", {
      selected_option_ids: ["yes"],
      free_text: "today only",
      mode: "ask",
    });
    await stream.next();

    expect(capturedUrl).toBe(
      "http://127.0.0.1:8765/v1/threads/ask%3At1/clarifications/call_1",
    );
    expect(capturedBody).toEqual({
      selected_option_ids: ["yes"],
      free_text: "today only",
      mode: "ask",
    });
  });

  it("includes paths for file-chat resume", async () => {
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

    await submitClarification("file:t1", "call_2", {
      selected_option_ids: ["a"],
      paths: ["docs/a.md"],
      stepId: "prd",
      workflowId: "wf-1",
    });

    expect(capturedBody).toEqual({
      selected_option_ids: ["a"],
      paths: ["docs/a.md"],
      stepId: "prd",
      workflowId: "wf-1",
    });
  });

  it("throws on non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "conflict" }), { status: 409 })),
    );

    await expect(
      submitClarification("ask:t1", "call_1", { selected_option_ids: ["yes"] }),
    ).rejects.toThrow("Clarification failed: 409");
  });
});

describe("useClarification", () => {
  beforeEach(() => {
    window.desktop = {
      getSidecarPort: vi.fn().mockResolvedValue(8765),
    } as unknown as typeof window.desktop;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies clarification event and cancels on cancelPending", () => {
    const { pending, cardStatus, applyClarificationEvent, cancelPending } = useClarification();

    applyClarificationEvent(payload);
    expect(pending.value).toEqual(payload);
    expect(cardStatus.value).toBe("pending");

    cancelPending();
    expect(pending.value).toBeNull();
    expect(cardStatus.value).toBe("cancelled");
  });

  it("submits via thread_id from SSE payload and marks answered after markAnswered", async () => {
    let capturedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        capturedUrl = String(input);
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("event: done\ndata: {}\n\n"));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }),
    );

    const {
      applyClarificationEvent,
      submit,
      markAnswered,
      cardStatus,
      pending,
    } = useClarification({
      getResumeExtras: () => ({ mode: "ask" }),
    });

    applyClarificationEvent(payload);
    const stream = await submit({ selected_option_ids: ["yes"] });
    expect(cardStatus.value).toBe("submitting");
    expect(capturedUrl).toContain("/v1/threads/ask%3At1/clarifications/call_1");
    await stream.next();
    markAnswered();
    expect(cardStatus.value).toBe("answered");
    expect(pending.value?.clarification_id).toBe("call_1");
  });

  it("sets error and restores pending on 400/409", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad", { status: 400 })),
    );

    const { applyClarificationEvent, submit, cardStatus, error, pending } = useClarification();
    applyClarificationEvent(payload);

    await expect(submit({ selected_option_ids: ["yes"] })).rejects.toThrow(
      "Clarification failed: 400",
    );
    expect(cardStatus.value).toBe("pending");
    expect(error.value).toContain("400");
    expect(pending.value).not.toBeNull();
  });
});
