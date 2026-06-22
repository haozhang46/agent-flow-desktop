import { describe, expect, it } from "vitest";
import { normalizeWorkspacePath } from "../../src/utils/normalizeWorkspacePath";
import { parseWriteFilePath } from "../../src/utils/parseWriteFilePath";

describe("parseWriteFilePath", () => {
  it("extracts path from write_file output", () => {
    expect(parseWriteFilePath("Wrote AGENTS.md (42 bytes)")).toBe("AGENTS.md");
    expect(parseWriteFilePath("Wrote fe/GEMINI.md (100 bytes)")).toBe("fe/GEMINI.md");
  });

  it("returns null for missing or malformed output", () => {
    expect(parseWriteFilePath(undefined)).toBeNull();
    expect(parseWriteFilePath("")).toBeNull();
    expect(parseWriteFilePath("Error: denied")).toBeNull();
  });
});

describe("normalizeWorkspacePath", () => {
  it("normalizes slashes and strips leading ./", () => {
    expect(normalizeWorkspacePath(".\\fe/AGENTS.md")).toBe("fe/AGENTS.md");
    expect(normalizeWorkspacePath("./AGENTS.md")).toBe("AGENTS.md");
  });
});
