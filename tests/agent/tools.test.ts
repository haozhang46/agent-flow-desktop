import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../electron/executor/runTool", () => ({
  runDesktopTool: vi.fn(async () => "ok"),
}));

import { buildDesktopLangChainTools, buildReadOnlyDesktopTools } from "../../electron/agent/tools";

describe("desktop agent tools", () => {
  const ctx = { workspaceRoot: "/tmp/ws" };
  const ctxWithServer = {
    workspaceRoot: "/tmp/my-project",
    resourceServerUrl: "http://localhost:9000",
  };

  it("full agent has run_shell and workspace tools without resource server", () => {
    const names = buildDesktopLangChainTools(ctx).map((t) => t.name);
    expect(names).toContain("run_shell");
    expect(names).toContain("workspace_get");
    expect(names).toContain("workspace_add_component");
    expect(names).toContain("workspace_register_component_type");
    expect(names).toContain("ops_get_config");
    expect(names).toHaveLength(18);
  });

  it("full agent includes topology tools when resource server configured", () => {
    const names = buildDesktopLangChainTools(ctxWithServer).map((t) => t.name);
    expect(names).toContain("topology_get");
    expect(names).toContain("topology_add_node");
    expect(names).toContain("topology_import_compose");
    expect(names).toContain("ops_logs_tail");
    expect(names).toContain("workspace_get");
    expect(names).toContain("workspace_register_component_type");
    expect(names).toContain("run_shell");
    expect(names).toHaveLength(25);
  });

  it("read-only plan tools exclude run_shell and mutating topology/ops/workspace tools", () => {
    const names = buildReadOnlyDesktopTools(ctxWithServer).map((t) => t.name);
    expect(names).not.toContain("run_shell");
    expect(names).not.toContain("topology_add_node");
    expect(names).not.toContain("ops_deploy_node");
    expect(names).not.toContain("workspace_add_component");
    expect(names).toContain("topology_get");
    expect(names).toContain("topology_resources_get");
    expect(names).toContain("topology_export_compose");
    expect(names).toContain("ops_node_status");
    expect(names).toContain("workspace_get");
    expect(names).toContain("workspace_list_registry");
    expect(names).toHaveLength(12);
  });
});

describe("topology tool execution", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/v1/topology?") && (!init || init.method === undefined)) {
          return { ok: false, status: 404, text: async () => "not found" };
        }
        if (url.includes("/v1/topology?") && init?.method === "PUT") {
          return {
            ok: true,
            json: async () => JSON.parse(String(init.body)),
          };
        }
        return { ok: true, json: async () => ({}) };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("topology_add_node creates topology on empty project", async () => {
    const tools = buildDesktopLangChainTools({
      workspaceRoot: "/tmp/my-project",
      resourceServerUrl: "http://localhost:9000",
    });
    const addNode = tools.find((t) => t.name === "topology_add_node");
    expect(addNode).toBeDefined();
    const result = await addNode!.invoke({
      id: "api",
      kind: "service",
    });
    expect(String(result)).toContain("Added node api");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/topology?project=my-project"),
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
