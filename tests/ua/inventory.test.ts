import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inventoryProject, inventoryRoot } from "../../electron/ua/inventory";
import { readGitCommitHash } from "../../electron/ua/gitMeta";

describe("inventoryProject", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ua-inventory-"));
    await fs.mkdir(path.join(tmp, "src"), { recursive: true });
    await fs.writeFile(path.join(tmp, "src", "main.ts"), "export {};\n");
    await fs.writeFile(path.join(tmp, "README.md"), "# hi\n");
    await fs.mkdir(path.join(tmp, "node_modules", "pkg"), { recursive: true });
    await fs.writeFile(path.join(tmp, "node_modules", "pkg", "index.js"), "");
    await fs.mkdir(path.join(tmp, ".git"), { recursive: true });
    await fs.writeFile(path.join(tmp, ".git", "HEAD"), "ref\n");
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("returns sorted posix paths with byte sizes, skipping ignored dirs", async () => {
    const entries = await inventoryProject(tmp);
    const paths = entries.map((e) => e.path);
    expect(paths).toEqual(["README.md", "src/main.ts"]);
    expect(entries.every((e) => e.rootId === "main")).toBe(true);
    expect(entries[0].bytes).toBeGreaterThan(0);
    expect(entries[1].bytes).toBeGreaterThan(0);
  });

  it("respects maxFiles cap", async () => {
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(tmp, `file${i}.txt`), "x");
    }
    const entries = await inventoryProject(tmp, 3);
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.rootId === "main")).toBe(true);
  });

  it("returns empty array for empty project root", async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), "ua-empty-"));
    try {
      const entries = await inventoryProject(empty);
      expect(entries).toEqual([]);
    } finally {
      await fs.rm(empty, { recursive: true, force: true });
    }
  });
});

describe("inventoryRoot", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ua-workspace-"));
    await fs.mkdir(path.join(workspaceRoot, "pkg-a", "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "pkg-a", "src", "a.ts"), "a\n");
    await fs.mkdir(path.join(workspaceRoot, "pkg-b"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "pkg-b", "b.ts"), "b\n");
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("tags entries with rootId for each inventoried root", async () => {
    const rootA = path.join(workspaceRoot, "pkg-a");
    const rootB = path.join(workspaceRoot, "pkg-b");

    const entriesA = await inventoryRoot({
      workspaceRoot,
      rootId: "pkg-a",
      absolutePath: rootA,
    });
    const entriesB = await inventoryRoot({
      workspaceRoot,
      rootId: "pkg-b",
      absolutePath: rootB,
    });

    expect(entriesA).toEqual([
      { rootId: "pkg-a", path: "src/a.ts", bytes: 2 },
    ]);
    expect(entriesB).toEqual([
      { rootId: "pkg-b", path: "b.ts", bytes: 2 },
    ]);
  });

  it("merges workspace and root-local ignore patterns", async () => {
    const rootA = path.join(workspaceRoot, "pkg-a");
    await fs.writeFile(path.join(rootA, "keep.ts"), "keep\n");
    await fs.writeFile(path.join(rootA, "drop.ts"), "drop\n");
    await fs.writeFile(path.join(rootA, "note.local"), "local\n");
    await fs.mkdir(path.join(workspaceRoot, ".ua"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, ".ua", ".understandignore"),
      "drop.ts\n",
    );
    await fs.writeFile(
      path.join(rootA, ".understandignore"),
      "*.local\n",
    );

    const entries = await inventoryRoot({
      workspaceRoot,
      rootId: "pkg-a",
      absolutePath: rootA,
    });

    const paths = entries.map((e) => e.path);
    expect(paths).toContain("keep.ts");
    expect(paths).toContain("src/a.ts");
    expect(entries.find((e) => e.path === "drop.ts")).toBeUndefined();
    expect(entries.find((e) => e.path === "note.local")).toBeUndefined();
    expect(entries.every((e) => e.rootId === "pkg-a")).toBe(true);
  });
});

describe("readGitCommitHash", () => {
  it("returns null outside a git repository", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ua-nogit-"));
    try {
      expect(await readGitCommitHash(tmp)).toBeNull();
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("returns HEAD hash inside a git repository", async () => {
    const repoRoot = path.dirname(
      path.dirname(fileURLToPath(import.meta.url)),
    );
    const expected = (
      await import("node:child_process").then(({ execSync }) =>
        execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }),
      )
    ).trim();

    expect(await readGitCommitHash(repoRoot)).toBe(expected);
  });
});
