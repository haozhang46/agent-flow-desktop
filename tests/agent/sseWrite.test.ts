import { describe, expect, it, vi } from "vitest";
import type http from "node:http";
import { writeSseMessageContent } from "../../electron/agent/sseWrite";

function mockResponse() {
  const writes: string[] = [];
  const res = {
    write: vi.fn((chunk: string) => {
      writes.push(chunk);
    }),
    socket: { setNoDelay: vi.fn() },
  } as unknown as http.ServerResponse;
  return { res, writes };
}

describe("writeSseMessageContent", () => {
  it("writes a single SSE message for short text", async () => {
    const { res, writes } = mockResponse();
    await writeSseMessageContent(res, "hi");
    expect(writes.join("")).toContain('"content":"hi"');
  });

  it("splits long text into multiple SSE messages", async () => {
    const { res, writes } = mockResponse();
    const text = "a".repeat(50);
    await writeSseMessageContent(res, text);
    const joined = writes.join("");
    const matches = joined.match(/"content":"/g);
    expect(matches?.length).toBeGreaterThan(1);
  });
});
