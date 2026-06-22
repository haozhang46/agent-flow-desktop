import { describe, expect, it } from "vitest";
import { formatFileForChat } from "../../src/utils/formatFileForChat";

describe("formatFileForChat", () => {
  it("wraps file content with path markers", () => {
    expect(formatFileForChat("docs/PRD.md", "# PRD\n\nHello")).toBe(
      "--- docs/PRD.md ---\n# PRD\n\nHello\n--- end docs/PRD.md ---",
    );
  });
});
