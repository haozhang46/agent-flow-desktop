import { describe, it, expect } from "vitest";
import { stripAccessForServer } from "../../electron/resources/opsSync";
import type { TopologyWithAccess } from "../../electron/resources/opsTypes";

describe("stripAccessForServer", () => {
  it("removes access fields from nodes", () => {
    const topology: TopologyWithAccess = {
      version: 1,
      project: "demo",
      nodes: [
        {
          id: "api",
          kind: "service",
          access: { mode: "host-ssh", hostRef: "vps", deployRef: "dc", service: "api" },
        },
      ],
      edges: [],
      targets: [],
    };
    const stripped = stripAccessForServer(topology);
    expect(stripped.nodes[0]).toEqual({ id: "api", kind: "service" });
    expect("access" in (stripped.nodes[0] as object)).toBe(false);
  });
});
