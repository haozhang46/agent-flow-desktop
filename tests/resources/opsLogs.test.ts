import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listOpsLogFiles } from "../../electron/resources/opsLogs";

describe("listOpsLogFiles", () => {
  let tmp = "";

  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it("lists log files for node", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-logs-"));
    const dir = path.join(tmp, ".agentflow/ops-logs");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "api-logs-1.log"), "line", "utf8");
    await fs.writeFile(path.join(dir, "other.log"), "x", "utf8");
    const files = await listOpsLogFiles(tmp, "api");
    expect(files.some((f) => f.name.startsWith("api-"))).toBe(true);
    expect(files.some((f) => f.name === "other.log")).toBe(false);
  });
});
