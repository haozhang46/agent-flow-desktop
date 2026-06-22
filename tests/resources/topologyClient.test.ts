import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TopologyResourceClient, writeLocalResourceInstances } from "../../electron/resources/topologyClient";

describe("TopologyResourceClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          version: 1,
          project: "demo",
          nodes: [{ id: "api", kind: "service" }],
          edges: [],
          targets: [],
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests topology with project query", async () => {
    const client = new TopologyResourceClient("http://localhost:9000", "demo");
    await client.getTopology();
    expect(fetch).toHaveBeenCalledWith("http://localhost:9000/v1/topology?project=demo");
  });
});

describe("writeLocalResourceInstances", () => {
  it("writes yaml under .agentflow", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-instances-"));
    try {
      await writeLocalResourceInstances(tmp, {
        "app-db": { host: "localhost", port: 3306 },
      });
      const raw = await fs.readFile(path.join(tmp, ".agentflow/resource-instances.yaml"), "utf8");
      expect(raw).toContain("app-db");
      expect(raw).toContain("localhost");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
