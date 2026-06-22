import { describe, expect, it } from "vitest";
import { defaultOpsConfig } from "../../electron/resources/opsTypes";
import {
  defaultAccessForKind,
  ensureOpsPlaceholders,
  isValidNodeId,
  removeNodeFromTopology,
  upsertNode,
} from "../../src/utils/topologyNodes";

describe("topologyNodes", () => {
  it("validates node ids", () => {
    expect(isValidNodeId("api")).toBe(true);
    expect(isValidNodeId("app-db")).toBe(true);
    expect(isValidNodeId("1api")).toBe(false);
    expect(isValidNodeId("")).toBe(false);
  });

  it("defaultAccessForKind uses hybrid model", () => {
    expect(defaultAccessForKind("service", "api")).toEqual({
      mode: "host-ssh",
      hostRef: "vps-dev",
      deployRef: "compose-dev",
      service: "api",
    });
    expect(defaultAccessForKind("database", "app-db")).toEqual({
      mode: "managed-instance",
      instanceRef: "app-db",
    });
  });

  it("removeNodeFromTopology drops node and related edges", () => {
    const nodes = [
      { id: "api", kind: "service" as const },
      { id: "db", kind: "database" as const },
    ];
    const edges = [
      { from: "api", to: "db" },
      { from: "api", to: "cache" },
    ];
    const result = removeNodeFromTopology(nodes, edges, "api");
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("db");
    expect(result.edges).toHaveLength(0);
  });

  it("upsertNode replaces or appends", () => {
    const nodes = [{ id: "api", kind: "service" as const }];
    const updated = upsertNode(nodes, { id: "api", kind: "gateway" });
    expect(updated[0].kind).toBe("gateway");
    const appended = upsertNode(nodes, { id: "cache", kind: "cache" });
    expect(appended).toHaveLength(2);
  });

  it("ensureOpsPlaceholders adds host and deploy profile", () => {
    const ops = defaultOpsConfig();
    const node = {
      id: "api",
      kind: "service" as const,
      access: {
        mode: "host-ssh" as const,
        hostRef: "vps-dev",
        deployRef: "compose-dev",
        service: "api",
      },
    };
    const next = ensureOpsPlaceholders(ops, node);
    expect(next.hosts.some((h) => h.id === "vps-dev")).toBe(true);
    expect(next.deployProfiles.some((p) => p.id === "compose-dev")).toBe(true);
  });
});
