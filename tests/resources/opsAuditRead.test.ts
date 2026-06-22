import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readOpsAudit } from "../../electron/resources/opsAuditRead";
import { appendOpsAudit } from "../../electron/resources/opsAudit";

describe("readOpsAudit", () => {
  let tmp = "";

  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it("returns recent entries newest first", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-audit-"));
    await appendOpsAudit(tmp, { ts: "2026-01-01T00:00:00Z", action: "deploy", node: "api" });
    await appendOpsAudit(tmp, { ts: "2026-01-02T00:00:00Z", action: "deployAll" });
    const entries = await readOpsAudit(tmp);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.action).toBe("deployAll");
  });
});
