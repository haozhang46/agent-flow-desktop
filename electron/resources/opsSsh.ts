import { spawn } from "node:child_process";
import net from "node:net";
import type { OpsConfig, OpsHost } from "./opsTypes";

export function findHost(hosts: OpsHost[], hostRef: string | undefined): OpsHost | undefined {
  if (!hostRef) return undefined;
  return hosts.find((h) => h.id === hostRef);
}

export function renderCommand(template: string, vars: Record<string, string | number>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
  }
  return out;
}

export function buildRemoteCommand(profileWorkdir: string | undefined, remoteCommand: string): string {
  const workdir = profileWorkdir?.trim();
  return workdir ? `cd ${workdir} && ${remoteCommand}` : remoteCommand;
}

export function runSshCommand(
  host: OpsHost,
  remoteCommand: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    if (!host.host?.trim()) {
      resolve({ stdout: "", stderr: "Host not configured", code: 1 });
      return;
    }
    const target = host.user ? `${host.user}@${host.host}` : host.host;
    const args = ["-p", String(host.port ?? 22), target, remoteCommand];
    const child = spawn("ssh", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

export function spawnSshStream(
  host: OpsHost,
  remoteCommand: string,
  onChunk: (text: string) => void,
): { close: () => void } {
  if (!host.host?.trim()) {
    onChunk("Host not configured\n");
    return { close: () => {} };
  }
  const target = host.user ? `${host.user}@${host.host}` : host.host;
  const args = ["-p", String(host.port ?? 22), target, remoteCommand];
  const child = spawn("ssh", args, { stdio: ["ignore", "pipe", "pipe"] });
  const onData = (chunk: Buffer) => onChunk(chunk.toString());
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("error", (err) => onChunk(`Error: ${err.message}\n`));
  return {
    close: () => {
      child.kill("SIGTERM");
    },
  };
}

export function tcpReachable(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: timeoutMs });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export function resolveHostSshCommand(
  ops: OpsConfig,
  hostRef: string | undefined,
  deployRef: string | undefined,
  commandKey: keyof NonNullable<OpsConfig["deployProfiles"][0]["commands"]>,
  vars: Record<string, string | number>,
): { host: OpsHost; command: string } | { error: string } {
  const host = findHost(ops.hosts, hostRef);
  const profile = ops.deployProfiles.find((p) => p.id === deployRef);
  const template = profile?.commands?.[commandKey];
  if (!host || !template) {
    return { error: "Configure host and deploy profile in ops.yaml" };
  }
  const remote = renderCommand(template, vars);
  return { host, command: buildRemoteCommand(profile.workdir, remote) };
}
