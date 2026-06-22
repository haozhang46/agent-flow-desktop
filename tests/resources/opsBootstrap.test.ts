import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureWorkspaceOpsConfig } from "../../electron/resources/opsBootstrap";

describe("ensureWorkspaceOpsConfig", () => {
  let tmp = "";

  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it("creates topology.yaml and ops.yaml when missing", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-ops-"));
    const bundle = await ensureWorkspaceOpsConfig(tmp);
    expect(bundle.created.topology).toBe(true);
    expect(bundle.created.ops).toBe(true);
    expect(bundle.topology.project).toBe(path.basename(tmp));
  });

  it("does not overwrite existing topology.yaml", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-ops-"));
    await fs.mkdir(path.join(tmp, ".agentflow"), { recursive: true });
    await fs.writeFile(
      path.join(tmp, ".agentflow/topology.yaml"),
      "version: 1\nproject: keep\nnodes:\n  - id: x\n    kind: service\nedges: []\ntargets: []\n",
      "utf8",
    );
    const bundle = await ensureWorkspaceOpsConfig(tmp);
    expect(bundle.created.topology).toBe(false);
    expect(bundle.topology.nodes[0]?.id).toBe("x");
  });

  it("imports from docker-compose.yml when present", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-ops-"));
    await fs.writeFile(
      path.join(tmp, "docker-compose.yml"),
      "services:\n  web:\n    image: nginx:alpine\n",
      "utf8",
    );
    const bundle = await ensureWorkspaceOpsConfig(tmp);
    expect(bundle.topology.nodes.some((n) => n.id === "web")).toBe(true);
  });

  it("saveWorkspaceOps writes topology and ops", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-ops-"));
    const { saveWorkspaceOps } = await import("../../electron/resources/opsBootstrap");
    const { defaultOpsConfig } = await import("../../electron/resources/opsTypes");
    const topology = {
      version: 1 as const,
      project: "test",
      nodes: [{ id: "a", kind: "service" as const }],
      edges: [],
      targets: [],
    };
    const ops = defaultOpsConfig();
    ops.hosts = [{ id: "vps", host: "1.2.3.4" }];
    await saveWorkspaceOps(tmp, topology, ops);
    const topoRaw = await fs.readFile(path.join(tmp, ".agentflow/topology.yaml"), "utf8");
    const opsRaw = await fs.readFile(path.join(tmp, ".agentflow/ops.yaml"), "utf8");
    expect(topoRaw).toContain("id: a");
    expect(opsRaw).toContain("1.2.3.4");
  });
});
