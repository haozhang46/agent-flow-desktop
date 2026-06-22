import { describe, expect, it } from "vitest";
import { streamChunkText } from "../../electron/agent/streamChunk";

describe("streamChunkText", () => {
  it("returns string content", () => {
    expect(streamChunkText("hello")).toBe("hello");
  });

  it("joins text blocks", () => {
    expect(streamChunkText([{ type: "text", text: "hi" }, { type: "text", text: "!" }])).toBe("hi!");
  });

  it("returns empty for nullish", () => {
    expect(streamChunkText(null)).toBe("");
    expect(streamChunkText("")).toBe("");
  });
});
