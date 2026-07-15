import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveUaDir } from "../../electron/ua/paths";

describe("resolveUaDir", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ua-paths-"));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("prefers legacy .understand-anything when present", async () => {
    await fs.mkdir(path.join(tmp, ".understand-anything"));
    await fs.mkdir(path.join(tmp, ".ua"));
    expect(await resolveUaDir(tmp)).toBe(path.join(tmp, ".understand-anything"));
  });

  it("uses .ua when legacy is absent", async () => {
    await fs.mkdir(path.join(tmp, ".ua"));
    expect(await resolveUaDir(tmp)).toBe(path.join(tmp, ".ua"));
  });

  it("defaults to .ua when neither exists", async () => {
    expect(await resolveUaDir(tmp)).toBe(path.join(tmp, ".ua"));
  });
});
