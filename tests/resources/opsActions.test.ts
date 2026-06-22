import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fetchNodeStatus, runNodeDeploy, runSshExec } from "../../electron/resources/opsActions";
import { defaultOpsConfig } from "../../electron/resources/opsTypes";
import type { TopologyNodeWithAccess } from "../../electron/resources/opsTypes";

vi.mock("../../electron/resources/opsSsh", () => ({
  findHost: (hosts: { id: string }[], ref: string) => hosts.find((h) => h.id === ref),
  renderCommand: (t: string, vars: Record<string, string | number>) =>
    t.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? "")),
  buildRemoteCommand: (_wd: string | undefined, cmd: string) => cmd,
  resolveHostSshCommand: vi.fn(),
  runSshCommand: vi.fn(),
  spawnSshStream: vi.fn(),
  tcpReachable: vi.fn(),
}));

import * as opsSsh from "../../electron/resources/opsSsh";

describe("opsActions", () => {
  let tmp = "";

  afterEach(async () => {
    vi.clearAllMocks();
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it("fetchNodeStatus returns tcp check for managed-instance", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-act-"));
    await fs.mkdir(path.join(tmp, ".agentflow"), { recursive: true });
    await fs.writeFile(
      path.join(tmp, ".agentflow/resource-instances.yaml"),
      "instances:\n  db1:\n    host: 127.0.0.1\n    port: 5432\n",
      "utf8",
    );
    vi.mocked(opsSsh.tcpReachable).mockResolvedValue(true);
    const node: TopologyNodeWithAccess = {
      id: "db",
      kind: "database",
      engine: "postgres",
      access: { mode: "managed-instance", instanceRef: "db1" },
    };
    const result = await fetchNodeStatus(tmp, node, defaultOpsConfig());
    expect(result.reachable).toBe(true);
    expect(result.output).toContain("127.0.0.1:5432");
  });

  it("runNodeDeploy requires confirm path via host-ssh", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-act-"));
    const ops = defaultOpsConfig();
    ops.hosts = [{ id: "vps", host: "example.com", user: "deploy" }];
    ops.deployProfiles = [
      {
        id: "dc",
        type: "docker-compose",
        commands: { deploy: "docker compose up -d {{service}}" },
      },
    ];
    vi.mocked(opsSsh.resolveHostSshCommand).mockReturnValue({
      host: ops.hosts[0]!,
      command: "docker compose up -d api",
    });
    vi.mocked(opsSsh.runSshCommand).mockResolvedValue({ stdout: "ok", stderr: "", code: 0 });
    const node: TopologyNodeWithAccess = {
      id: "api",
      kind: "service",
      access: { mode: "host-ssh", hostRef: "vps", deployRef: "dc", service: "api" },
    };
    const result = await runNodeDeploy(tmp, node, ops);
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("ok");
  });

  it("runSshExec returns error for unknown host", async () => {
    const result = await runSshExec(defaultOpsConfig(), "missing", "echo hi");
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain("Unknown host");
  });
});
