import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parseUnderstandIgnore,
  isIgnored,
  loadIgnorePatterns,
} from "../../electron/ua/ignore";

describe("parseUnderstandIgnore", () => {
  it("skips comment and blank lines", () => {
    const text = "# comment\n\ntests/\n# another\n*.tmp\n";
    expect(parseUnderstandIgnore(text)).toEqual(["tests/", "*.tmp"]);
  });
});

describe("isIgnored", () => {
  it("ignores node_modules by default", () => {
    expect(isIgnored("node_modules/foo", [])).toBe(true);
  });

  it("ignores paths matching dir/ prefix pattern", () => {
    expect(isIgnored("tests/a.ts", ["tests/"])).toBe(true);
  });

  it("keeps paths matched by negation after a positive", () => {
    expect(isIgnored("tests/keep.ts", ["tests/", "!tests/keep.ts"])).toBe(false);
  });

  it("matches exact file patterns", () => {
    expect(isIgnored("pnpm-lock.yaml", [])).toBe(true);
    expect(isIgnored("package-lock.json", [])).toBe(false);
  });

  it("matches *.ext suffix patterns", () => {
    expect(isIgnored("yarn.lock", [])).toBe(true);
    expect(isIgnored("src/main.ts", [])).toBe(false);
  });
});

describe("loadIgnorePatterns", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ua-ignore-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("returns empty array when .understandignore is missing", async () => {
    expect(await loadIgnorePatterns(tmp)).toEqual([]);
  });

  it("returns parsed file patterns", async () => {
    const uaDir = path.join(tmp, ".ua");
    await fs.mkdir(uaDir, { recursive: true });
    await fs.writeFile(
      path.join(uaDir, ".understandignore"),
      "custom-dir/\n",
    );
    expect(await loadIgnorePatterns(tmp)).toEqual(["custom-dir/"]);
  });
});
