import { describe, expect, it } from "vitest";
import { resolveWorkspacePath } from "../electron/executor/tools";

describe("resolveWorkspacePath", () => {
  it("allows paths inside workspace", () => {
    expect(resolveWorkspacePath("/tmp/ws", "src/main.ts")).toBe("/tmp/ws/src/main.ts");
  });

  it("rejects path traversal", () => {
    expect(() => resolveWorkspacePath("/tmp/ws", "../etc/passwd")).toThrow(
      "path escapes workspace",
    );
  });
});
