import { describe, expect, it } from "vitest";
import { WORKSPACE_REGISTRY } from "../../shared/workspaceRegistryData";
import { getBuiltinTypeDocument } from "../../shared/jsonWidget/builtinTypeDefs";

describe("builtinTypeDefs", () => {
  it("covers every WORKSPACE_REGISTRY type", () => {
    for (const entry of WORKSPACE_REGISTRY) {
      const doc = getBuiltinTypeDocument(entry.type);
      expect(doc, entry.type).toBeDefined();
      expect(doc!.root).toEqual({
        type: "view",
        name: entry.type,
        props: { $bind: "instance" },
      });
      expect(doc!.propsFields).toEqual(entry.propsFields);
    }
  });
});
