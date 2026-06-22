import { describe, expect, it } from "vitest";
import {
  applyLayersToMarkdown,
  extractLayersFromMarkdown,
  mergeLayerLists,
  syncCheckedLayersFromContent,
} from "../../src/utils/architecturePlanMarkdown";

const SAMPLE = `# Plan

## Layers

- [x] **api/routes**
- [ ] **custom/integration**

## Notes
`;

describe("architecturePlanMarkdown", () => {
  it("extracts layer names from markdown section", () => {
    expect(extractLayersFromMarkdown(SAMPLE)).toEqual(["api/routes", "custom/integration"]);
  });

  it("merges configured and markdown layers without duplicates", () => {
    expect(mergeLayerLists(["api/routes", "rag"], ["custom/integration", "api/routes"])).toEqual([
      "api/routes",
      "rag",
      "custom/integration",
    ]);
  });

  it("applies layer checklist to markdown", () => {
    const md = applyLayersToMarkdown(SAMPLE, ["api/routes", "rag"], ["api/routes"]);
    expect(md).toContain("- [x] **api/routes**");
    expect(md).toContain("- [ ] **rag**");
    expect(md).not.toContain("custom/integration");
  });

  it("syncs checked layers from markdown", () => {
    expect(syncCheckedLayersFromContent(SAMPLE, ["api/routes", "custom/integration", "rag"])).toEqual([
      "api/routes",
      "custom/integration",
    ]);
  });
});
