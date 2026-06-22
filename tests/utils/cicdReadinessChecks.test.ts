import { describe, expect, it } from "vitest";
import { buildReadinessReport } from "../../src/utils/cicdReadinessChecks";

describe("buildReadinessReport", () => {
  it("fails when Dockerfile missing", () => {
    const report = buildReadinessReport({
      files: { dockerfile: false, workflows: true, compose: false },
      topology: { nodes: [{ id: "api", kind: "service", source: "backend" }] },
      sourcesExist: { backend: true },
      gates: [],
    });
    expect(report.ready).toBe(false);
    expect(report.items.some((i) => i.id === "dockerfile" && !i.pass)).toBe(true);
  });

  it("passes when required checks ok", () => {
    const report = buildReadinessReport({
      files: { dockerfile: true, workflows: true, compose: false },
      topology: { nodes: [{ id: "api", kind: "service", source: "backend" }] },
      sourcesExist: { backend: true },
      gates: [{ id: "dockerfile", status: "PASS" as const }],
    });
    expect(report.ready).toBe(true);
  });
});
