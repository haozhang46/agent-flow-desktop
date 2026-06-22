import fs from "node:fs/promises";
import path from "node:path";
import { AGENTFLOW } from "./opsBootstrap";

const AUDIT_FILE = "ops-audit.jsonl";

export type OpsAuditEntry = {
  ts: string;
  node?: string;
  action: string;
  command?: string;
  exitCode?: number;
  logFile?: string;
  error?: string;
};

export async function appendOpsAudit(projectRoot: string, entry: OpsAuditEntry): Promise<void> {
  const filePath = path.join(projectRoot, AGENTFLOW, AUDIT_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}
