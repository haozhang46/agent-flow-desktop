import { describe, expect, it, vi } from "vitest";
import { expandChatMessage } from "../../src/utils/expandChatMessage";

describe("expandChatMessage", () => {
  it("expands attachments and appends trimmed text", async () => {
    const readFile = vi.fn(async (path: string) => ({
      content: path === "/docs/a.md" ? "# A" : "# B",
    }));

    const result = await expandChatMessage(
      "  hello  ",
      [
        { path: "/docs/a.md", label: "a.md" },
        { path: "/docs/b.md", label: "b.md" },
      ],
      readFile,
    );

    expect(readFile).toHaveBeenCalledTimes(2);
    expect(result).toBe(
      "--- /docs/a.md ---\n# A\n--- end /docs/a.md ---\n\n--- /docs/b.md ---\n# B\n--- end /docs/b.md ---\n\nhello",
    );
  });

  it("returns only file blocks when text is empty", async () => {
    const readFile = vi.fn(async () => ({ content: "content" }));

    const result = await expandChatMessage(
      "   ",
      [{ path: "/docs/a.md", label: "a.md" }],
      readFile,
    );

    expect(result).toBe("--- /docs/a.md ---\ncontent\n--- end /docs/a.md ---");
  });

  it("returns trimmed text when there are no attachments", async () => {
    const readFile = vi.fn();

    const result = await expandChatMessage("  hi there  ", [], readFile);

    expect(readFile).not.toHaveBeenCalled();
    expect(result).toBe("hi there");
  });
});
