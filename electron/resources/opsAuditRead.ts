import fs from "node:fs/promises";
import path from "node:path";
import { AGENTFLOW } from "./opsBootstrap";
import type { OpsAuditEntry } from "./opsAudit";

const AUDIT_FILE = "ops-audit.jsonl";

export async function readOpsAudit(projectRoot: string, limit = 50): Promise<OpsAuditEntry[]> {
  const filePath = path.join(projectRoot, AGENTFLOW, AUDIT_FILE);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => JSON.parse(line) as OpsAuditEntry)
      .reverse();
  } catch {
    return [];
  }
}

export { AUDIT_FILE };
