import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inventoryProject } from "../../electron/ua/inventory";

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
    expect(entries[0].bytes).toBeGreaterThan(0);
    expect(entries[1].bytes).toBeGreaterThan(0);
  });

  it("respects maxFiles cap", async () => {
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(tmp, `file${i}.txt`), "x");
    }
    const entries = await inventoryProject(tmp, 3);
    expect(entries).toHaveLength(3);
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
