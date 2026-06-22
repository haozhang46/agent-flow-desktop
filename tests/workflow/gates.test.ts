import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runGate, runGates, allGatesPassed } from "../../electron/workflow/gates";

describe("gates", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-gates-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("file gate passes when path exists with min_bytes", async () => {
    await fs.mkdir(path.join(tmp, "docs"), { recursive: true });
    await fs.writeFile(path.join(tmp, "docs/PRD.md"), "x".repeat(200));

    const result = await runGate(tmp, {
      id: "prd",
      type: "file",
      path: "docs/PRD.md",
      min_bytes: 100,
    });

    expect(result.status).toBe("PASS");
  });

  it("file gate fails when below min_bytes", async () => {
    await fs.mkdir(path.join(tmp, "docs"), { recursive: true });
    await fs.writeFile(path.join(tmp, "docs/PRD.md"), "short");

    const result = await runGate(tmp, {
      id: "prd",
      type: "file",
      path: "docs/PRD.md",
      min_bytes: 100,
    });

    expect(result.status).toBe("FAIL");
  });

  it("shell gate checks exit code", async () => {
    const pass = await runGate(tmp, { id: "ok", type: "shell", command: "exit 0" });
    const fail = await runGate(tmp, { id: "bad", type: "shell", command: "exit 1" });

    expect(pass.status).toBe("PASS");
    expect(fail.status).toBe("FAIL");
  });

  it("allGatesPassed requires every gate pass or skip", () => {
    expect(
      allGatesPassed([
        { id: "a", status: "PASS" },
        { id: "b", status: "SKIP" },
      ]),
    ).toBe(true);
    expect(
      allGatesPassed([
        { id: "a", status: "PASS" },
        { id: "b", status: "FAIL" },
      ]),
    ).toBe(false);
  });

  it("runGates runs all checks in order", async () => {
    await fs.writeFile(path.join(tmp, "ok.txt"), "hello");
    const results = await runGates(tmp, [
      { id: "f", type: "file", path: "ok.txt" },
      { id: "s", type: "shell", command: "test -f ok.txt" },
    ]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "PASS")).toBe(true);
  });
});
