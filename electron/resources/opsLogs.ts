import fs from "node:fs/promises";
import path from "node:path";
import type { OpsConfig, TopologyNodeWithAccess } from "./opsTypes";
import { AGENTFLOW, OPS_LOGS_DIR } from "./opsBootstrap";
import {
  buildRemoteCommand,
  resolveHostSshCommand,
  runSshCommand,
} from "./opsSsh";

export async function listOpsLogFiles(
  projectRoot: string,
  nodeId?: string,
): Promise<{ name: string; path: string }[]> {
  const dir = path.join(projectRoot, AGENTFLOW, OPS_LOGS_DIR);
  try {
    const entries = await fs.readdir(dir);
    const filtered = nodeId
      ? entries.filter((e) => e.startsWith(`${nodeId}-`))
      : entries;
    return filtered
      .filter((e) => e.endsWith(".log"))
      .sort()
      .reverse()
      .map((name) => ({ name, path: path.join(dir, name) }));
  } catch {
    return [];
  }
}

export async function readOpsLogFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function fetchLogSnapshot(
  projectRoot: string,
  node: TopologyNodeWithAccess,
  ops: OpsConfig,
): Promise<{ content: string; savedPath?: string; error?: string }> {
  const access = node.access;
  if (!access || access.mode !== "host-ssh") {
    return { content: "", error: "Log snapshot only available for host-ssh nodes" };
  }

  const resolved = resolveHostSshCommand(
    ops,
    access.hostRef,
    access.deployRef,
    "logsSnapshot",
    { service: access.service ?? node.id, tailLines: ops.logPolicy.defaultTailLines },
  );
  if ("error" in resolved) {
    return { content: "", error: resolved.error };
  }

  try {
    const result = await runSshCommand(resolved.host, resolved.command);
    const content = [result.stdout, result.stderr].filter(Boolean).join("\n");
    if (result.code !== 0 && !content) {
      return { content: "", error: result.stderr || `ssh exited ${result.code}` };
    }

    if (!ops.logPolicy.persist) {
      return { content, error: result.code !== 0 ? result.stderr : undefined };
    }

    const iso = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${node.id}-logs-${iso}.log`;
    const filePath = path.join(projectRoot, AGENTFLOW, OPS_LOGS_DIR, fileName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
    return { content, savedPath: filePath, error: result.code !== 0 ? result.stderr : undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: "", error: message };
  }
}

export { buildRemoteCommand, resolveHostSshCommand, runSshCommand };
