import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildOpsLangChainTools } from "../../electron/agent/opsTools";

vi.mock("../../electron/resources/opsBootstrap", () => ({
  ensureWorkspaceOpsConfig: vi.fn(async () => ({})),
  loadWorkspaceOps: vi.fn(async () => ({
    topology: {
      project: "demo",
      nodes: [{ id: "api", kind: "service", access: { mode: "host-ssh" } }],
      edges: [],
      targets: [],
    },
    ops: { version: 1, hosts: [], deployProfiles: [], logPolicy: { strategy: "A1", persist: true, defaultTailLines: 50, maxFilesPerNode: 10, clientFilter: true } },
  })),
}));

vi.mock("../../electron/resources/opsActions", () => ({
  fetchNodeStatus: vi.fn(async () => ({ output: "ok", reachable: true })),
  runNodeDeploy: vi.fn(async () => ({ output: "deployed", exitCode: 0 })),
  runDeployAll: vi.fn(async () => ({ output: "all", exitCode: 0 })),
}));

vi.mock("../../electron/resources/opsLogs", () => ({
  fetchLogSnapshot: vi.fn(async () => ({ content: "log line" })),
}));

describe("opsTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refuses deploy without confirm", async () => {
    const tools = buildOpsLangChainTools({ workspaceRoot: "/tmp/demo" });
    const deploy = tools.find((t) => t.name === "ops_deploy_node");
    const result = await deploy!.invoke({ node_id: "api", confirm: false });
    expect(String(result)).toContain("refused");
  });

  it("ops_get_config lists nodes", async () => {
    const tools = buildOpsLangChainTools({ workspaceRoot: "/tmp/demo" });
    const getConfig = tools.find((t) => t.name === "ops_get_config");
    const result = await getConfig!.invoke({});
    expect(String(result)).toContain("api");
  });
});
