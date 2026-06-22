import { describe, expect, it, vi } from "vitest";
import {
  generateThreadTitle,
  truncatePreviewTitle,
} from "../../electron/chatMemory/generateTitle";

describe("generateThreadTitle", () => {
  it("returns trimmed title from LLM", async () => {
    const mockInvoke = vi.fn().mockResolvedValue({ content: '  Fix login bug  ' });
    const title = await generateThreadTitle(
      [
        { role: "user", content: "My app login fails" },
        { role: "assistant", content: "Let me check the auth flow." },
      ],
      "fake-key",
      { invoke: mockInvoke },
    );
    expect(title).toBe("Fix login bug");
  });

  it("truncates to 60 chars", async () => {
    const long = "A".repeat(80);
    const mockInvoke = vi.fn().mockResolvedValue({ content: long });
    const title = await generateThreadTitle(
      [{ role: "user", content: "hi" }],
      "fake-key",
      { invoke: mockInvoke },
    );
    expect(title.length).toBeLessThanOrEqual(60);
  });

  it("throws on empty LLM response", async () => {
    const mockInvoke = vi.fn().mockResolvedValue({ content: "   " });
    await expect(
      generateThreadTitle([{ role: "user", content: "hi" }], "fake-key", {
        invoke: mockInvoke,
      }),
    ).rejects.toThrow("empty title");
  });
});

describe("truncatePreviewTitle", () => {
  it("truncates long user text", () => {
    expect(truncatePreviewTitle("x".repeat(100)).length).toBe(60);
  });

  it("falls back to New Chat for empty input", () => {
    expect(truncatePreviewTitle("   ")).toBe("New Chat");
  });
});
