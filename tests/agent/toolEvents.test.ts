import { describe, expect, it } from "vitest";
import { formatToolOutput } from "../../electron/agent/toolEvents";

describe("formatToolOutput", () => {
  it("returns string output as-is", () => {
    expect(formatToolOutput("hello")).toBe("hello");
  });

  it("extracts content from tool message object", () => {
    expect(formatToolOutput({ content: "WORKSPACE_PENDING_APPROVAL\n{}" })).toBe(
      "WORKSPACE_PENDING_APPROVAL\n{}",
    );
  });

  it("stringifies other values", () => {
    expect(formatToolOutput({ ok: true })).toBe('{"ok":true}');
  });
});
