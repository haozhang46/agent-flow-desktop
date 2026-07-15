import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureWorkspaceFile,
  loadWorkspace,
  resolveRoots,
  saveWorkspace,
} from "../../electron/workspace/store";

describe("workspace store", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("loads implicit main root when workspace.json missing", async () => {
    const file = await loadWorkspace(dir);
    expect(file.roots).toEqual([
      { id: "main", path: ".", label: path.basename(dir) },
    ]);
    await expect(fs.access(path.join(dir, "workspace.json"))).rejects.toThrow();
  });

  it("resolves relative root paths against workspace root", async () => {
    const sibling = await fs.mkdtemp(path.join(os.tmpdir(), "api-"));
    await saveWorkspace(dir, {
      version: 1,
      name: "plat",
      roots: [
        { id: "main", path: ".", label: "Main" },
        { id: "api", path: path.relative(dir, sibling), label: "API" },
      ],
    });
    const roots = await resolveRoots(dir);
    expect(roots.find((r) => r.id === "api")!.absolutePath).toBe(
      path.resolve(sibling),
    );
    await fs.rm(sibling, { recursive: true, force: true });
  });

  it("ensureWorkspaceFile writes workspace.json", async () => {
    await ensureWorkspaceFile(dir);
    const raw = JSON.parse(
      await fs.readFile(path.join(dir, "workspace.json"), "utf8"),
    );
    expect(raw.roots[0].id).toBe("main");
  });
});
