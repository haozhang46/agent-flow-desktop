import { describe, expect, it } from "vitest";
import {
  canSetPreviewTitle,
  shouldAutoGenerateTitle,
} from "../../src/composables/useAutoThreadTitle";

describe("shouldAutoGenerateTitle", () => {
  it("returns true on first completed turn with default source", () => {
    expect(
      shouldAutoGenerateTitle(
        { titleSource: "default" },
        [
          { role: "user" },
          { role: "assistant" },
        ],
      ),
    ).toBe(true);
  });

  it("returns false when user renamed", () => {
    expect(
      shouldAutoGenerateTitle(
        { titleSource: "user" },
        [
          { role: "user" },
          { role: "assistant" },
        ],
      ),
    ).toBe(false);
  });

  it("returns false after auto title already set", () => {
    expect(
      shouldAutoGenerateTitle(
        { titleSource: "auto" },
        [
          { role: "user" },
          { role: "assistant" },
        ],
      ),
    ).toBe(false);
  });

  it("returns false when more than one user message", () => {
    expect(
      shouldAutoGenerateTitle(
        { titleSource: "preview" },
        [
          { role: "user" },
          { role: "assistant" },
          { role: "user" },
        ],
      ),
    ).toBe(false);
  });
});

describe("canSetPreviewTitle", () => {
  it("allows default and preview", () => {
    expect(canSetPreviewTitle({ titleSource: "default" })).toBe(true);
    expect(canSetPreviewTitle({ titleSource: "preview" })).toBe(true);
  });

  it("blocks user and auto", () => {
    expect(canSetPreviewTitle({ titleSource: "user" })).toBe(false);
    expect(canSetPreviewTitle({ titleSource: "auto" })).toBe(false);
  });
});
