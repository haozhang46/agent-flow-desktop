import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveWorkspace } from "../../electron/workspace/store";
import { resolveStepCwd } from "../../electron/workspace/stepCwd";

describe("resolveStepCwd", () => {
  let workspaceRoot: string;
  let apiRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ws-cwd-"));
    apiRoot = await fs.mkdtemp(path.join(os.tmpdir(), "api-cwd-"));
    await saveWorkspace(workspaceRoot, {
      version: 1,
      name: "plat",
      roots: [
        { id: "main", path: ".", label: "Main" },
        {
          id: "api",
          path: path.relative(workspaceRoot, apiRoot),
          label: "API",
        },
      ],
    });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
    await fs.rm(apiRoot, { recursive: true, force: true });
  });

  it("returns workspace root when stepRootId is undefined", async () => {
    await expect(resolveStepCwd(workspaceRoot, undefined)).resolves.toBe(
      workspaceRoot,
    );
  });

  it("resolves step rootId to absolute root path", async () => {
    await expect(resolveStepCwd(workspaceRoot, "api")).resolves.toBe(
      path.resolve(apiRoot),
    );
  });

  it("throws for unknown step rootId", async () => {
    await expect(resolveStepCwd(workspaceRoot, "ghost")).rejects.toThrow(
      /unknown root/i,
    );
  });
});
