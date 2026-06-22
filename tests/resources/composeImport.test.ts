import { describe, it, expect } from "vitest";
import { importComposeToTopology } from "../../electron/resources/composeImport";

const SAMPLE = `
services:
  api:
    image: node:20
    depends_on:
      - app-db
      - cache
  app-db:
    image: mysql:8
  cache:
    image: redis:7
`;

describe("importComposeToTopology", () => {
  it("creates nodes and edges from compose", () => {
    const topo = importComposeToTopology(SAMPLE, "demo");
    expect(topo.nodes.map((n) => n.id).sort()).toEqual(["api", "app-db", "cache"]);
    expect(topo.edges.some((e) => e.from === "api" && e.to === "app-db")).toBe(true);
    const db = topo.nodes.find((n) => n.id === "app-db");
    expect(db?.kind).toBe("database");
    expect(db?.access?.mode).toBe("managed-instance");
    const api = topo.nodes.find((n) => n.id === "api");
    expect(api?.access?.mode).toBe("host-ssh");
  });
});
