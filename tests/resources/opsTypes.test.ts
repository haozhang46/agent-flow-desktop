import { describe, it, expect } from "vitest";
import { defaultOpsConfig, defaultTopology, parseOpsConfig } from "../../electron/resources/opsTypes";

describe("opsTypes", () => {
  it("defaultTopology has dev target", () => {
    const t = defaultTopology("demo");
    expect(t.project).toBe("demo");
    expect(t.targets[0]?.type).toBe("docker-compose");
  });

  it("parseOpsConfig fills logPolicy defaults", () => {
    const ops = parseOpsConfig("version: 1\nhosts: []\ndeployProfiles: []");
    expect(ops.logPolicy.strategy).toBe("A1");
    expect(ops.logPolicy.defaultTailLines).toBe(200);
  });

  it("defaultOpsConfig is A1", () => {
    expect(defaultOpsConfig().logPolicy.persist).toBe(true);
  });
});
