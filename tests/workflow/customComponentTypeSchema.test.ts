import { describe, expect, it } from "vitest";
import {
  parseCustomComponentType,
  assertNotReservedType,
} from "../../electron/workflow/customComponentTypeSchema";

describe("CustomComponentTypeSchema", () => {
  it("accepts a minimal Phase-1 type", () => {
    const t = parseCustomComponentType({
      type: "my-checklist",
      label: "Checklist",
      description: "Simple checklist",
      category: "custom",
      defaultProps: {},
      propsFields: [{ key: "title", label: "Title", type: "string", required: true }],
    });
    expect(t.type).toBe("my-checklist");
    expect(t.propsFields).toHaveLength(1);
  });

  it("rejects missing type", () => {
    expect(() =>
      parseCustomComponentType({
        label: "X",
        description: "d",
        category: "custom",
        defaultProps: {},
        propsFields: [],
      }),
    ).toThrow();
  });

  it("rejects built-in type ids", () => {
    expect(() => assertNotReservedType("markdown-doc")).toThrow(/reserved/i);
  });
});
