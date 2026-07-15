import { describe, it, expect } from "vitest";
import { listSkills, loadSkillBodies } from "../../electron/skills/loader";

describe("skill loader", () => {
  it("listSkills returns non-empty including test-driven-development", async () => {
    const names = await listSkills();
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain("test-driven-development");
    expect(names).toContain("understand");
  });

  it("loadSkillBodies returns content matching skill name", async () => {
    const bodies = await loadSkillBodies(["test-driven-development"]);
    expect(bodies.length).toBe(1);
    expect(bodies[0]).toContain("test-driven-development");
    expect(bodies[0]).toContain("Test-Driven Development");
  });
});
