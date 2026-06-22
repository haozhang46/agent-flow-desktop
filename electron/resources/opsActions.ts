import fs from "node:fs/promises";
import path from "node:path";
import { loadLocalInstances } from "./resolver";
import { AGENTFLOW, OPS_LOGS_DIR } from "./opsBootstrap";
import { appendOpsAudit } from "./opsAudit";
import type { OpsConfig, TopologyNodeWithAccess } from "./opsTypes";
import {
  findHost,
  renderCommand,
  buildRemoteCommand,
  resolveHostSshCommand,
  runSshCommand,
  spawnSshStream,
  tcpReachable,
} from "./opsSsh";

export async function fetchNodeStatus(
  projectRoot: string,
  node: TopologyNodeWithAccess,
  ops: OpsConfig,
): Promise<{ output: string; reachable: boolean; error?: string }> {
  const access = node.access;
  if (!access) {
    return { output: "", reachable: false, error: "No access config" };
  }

  if (access.mode === "managed-instance") {
    const instances = await loadLocalInstances(projectRoot);
    const inst = access.instanceRef ? instances[access.instanceRef] : undefined;
    if (!inst?.host) {
      return {
        output: "No host in resource-instances.yaml",
        reachable: false,
        error: "Configure resource-instances.yaml",
      };
    }
    const port = inst.port ?? (node.engine === "redis" ? 6379 : 3306);
    const ok = await tcpReachable(inst.host, port);
    return {
      output: `${inst.host}:${port} — ${ok ? "reachable" : "unreachable"}`,
      reachable: ok,
    };
  }

  const resolved = resolveHostSshCommand(
    ops,
    access.hostRef,
    access.deployRef,
    "status",
    { service: access.service ?? node.id, tailLines: ops.logPolicy.defaultTailLines },
  );
  if ("error" in resolved) {
    return { output: "", reachable: false, error: resolved.error };
  }

  try {
    const result = await runSshCommand(resolved.host, resolved.command);
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    return {
      output,
      reachable: result.code === 0,
      error: result.code !== 0 ? result.stderr || `exit ${result.code}` : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { output: "", reachable: false, error: message };
  }
}

export async function runNodeDeploy(
  projectRoot: string,
  node: TopologyNodeWithAccess,
  ops: OpsConfig,
): Promise<{ output: string; exitCode: number; logFile?: string; error?: string }> {
  const access = node.access;
  if (!access || access.mode !== "host-ssh") {
    return { output: "", exitCode: 1, error: "Deploy only for host-ssh nodes" };
  }

  const resolved = resolveHostSshCommand(
    ops,
    access.hostRef,
    access.deployRef,
    "deploy",
    { service: access.service ?? node.id, tailLines: ops.logPolicy.defaultTailLines },
  );
  if ("error" in resolved) {
    return { output: "", exitCode: 1, error: resolved.error };
  }

  try {
    const result = await runSshCommand(resolved.host, resolved.command);
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    let logFile: string | undefined;
    if (ops.logPolicy.persist && output) {
      const iso = new Date().toISOString().replace(/[:.]/g, "-");
      logFile = path.join(projectRoot, AGENTFLOW, OPS_LOGS_DIR, `${node.id}-deploy-${iso}.log`);
      await fs.mkdir(path.dirname(logFile), { recursive: true });
      await fs.writeFile(logFile, output, "utf8");
    }
    await appendOpsAudit(projectRoot, {
      ts: new Date().toISOString(),
      node: node.id,
      action: "deploy",
      command: resolved.command,
      exitCode: result.code,
      logFile,
      error: result.code !== 0 ? result.stderr : undefined,
    });
    return { output, exitCode: result.code, logFile, error: result.code !== 0 ? result.stderr : undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { output: "", exitCode: 1, error: message };
  }
}

export async function runDeployAll(
  projectRoot: string,
  ops: OpsConfig,
): Promise<{ output: string; exitCode: number; error?: string }> {
  const profile = ops.deployProfiles[0];
  const host = profile ? findHost(ops.hosts, ops.hosts[0]?.id) : undefined;
  const template = profile?.commands?.deployAll;
  if (!host || !template) {
    return { output: "", exitCode: 1, error: "Configure deployAll in ops.yaml" };
  }
  const command = buildRemoteCommand(profile.workdir, template);
  try {
    const result = await runSshCommand(host, command);
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    await appendOpsAudit(projectRoot, {
      ts: new Date().toISOString(),
      action: "deployAll",
      command,
      exitCode: result.code,
      error: result.code !== 0 ? result.stderr : undefined,
    });
    return { output, exitCode: result.code, error: result.code !== 0 ? result.stderr : undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { output: "", exitCode: 1, error: message };
  }
}

export function startLogStream(
  node: TopologyNodeWithAccess,
  ops: OpsConfig,
  onChunk: (text: string) => void,
): { close: () => void; error?: string } {
  const access = node.access;
  if (!access || access.mode !== "host-ssh") {
    return { close: () => {}, error: "Live logs only for host-ssh nodes" };
  }

  const host = findHost(ops.hosts, access.hostRef);
  const profile = ops.deployProfiles.find((p) => p.id === access.deployRef);
  const template = profile?.commands?.logs;
  if (!host || !template) {
    return { close: () => {}, error: "Configure host and logs command in ops.yaml" };
  }

  const remote = renderCommand(template, {
    service: access.service ?? node.id,
    tailLines: ops.logPolicy.defaultTailLines,
  });
  const command = buildRemoteCommand(profile.workdir, remote);
  const stream = spawnSshStream(host, command, onChunk);
  return stream;
}

export async function runSshExec(
  ops: OpsConfig,
  hostRef: string,
  userCommand: string,
): Promise<{ output: string; exitCode: number; error?: string }> {
  const host = findHost(ops.hosts, hostRef);
  if (!host) {
    return { output: "", exitCode: 1, error: "Unknown host" };
  }
  try {
    const result = await runSshCommand(host, userCommand);
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    return { output, exitCode: result.code, error: result.code !== 0 ? result.stderr : undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { output: "", exitCode: 1, error: message };
  }
}
