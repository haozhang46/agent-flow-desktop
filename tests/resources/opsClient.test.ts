import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchOpsConfig, fetchOpsSummary } from "../../electron/resources/opsClient";

describe("opsClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith("/v1/ops/config")) {
          return {
            ok: true,
            json: async () => ({
              portainerUrl: "http://portainer:9443",
              mesheryUrl: "http://meshery:9081",
            }),
          };
        }
        if (url.includes("/v1/ops/summary?project=demo")) {
          return {
            ok: true,
            json: async () => ({
              docker: { configured: true, reachable: true, stackCount: 1 },
              kubernetes: { configured: false, reachable: false },
              intentNodeCount: 3,
            }),
          };
        }
        return { ok: false, status: 404, text: async () => "not found" };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchOpsConfig requests server ops config", async () => {
    const config = await fetchOpsConfig("http://localhost:9000");
    expect(config?.portainerUrl).toBe("http://portainer:9443");
    expect(fetch).toHaveBeenCalledWith("http://localhost:9000/v1/ops/config");
  });

  it("fetchOpsSummary includes project query", async () => {
    const summary = await fetchOpsSummary("http://localhost:9000", "/tmp/demo");
    expect(summary?.intentNodeCount).toBe(3);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/ops/summary?project=demo"),
    );
  });
});
