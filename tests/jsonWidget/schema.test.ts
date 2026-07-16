import { describe, expect, it } from "vitest";
import { parsePanelTypeDocument } from "../../shared/jsonWidget/schema";

describe("parsePanelTypeDocument", () => {
  it("accepts a built-in view document", () => {
    const doc = parsePanelTypeDocument({
      type: "markdown-doc",
      label: "Markdown Doc",
      description: "d",
      category: "docs",
      defaultProps: { docsDir: "docs" },
      propsFields: [{ key: "docsDir", label: "Docs directory", type: "string" }],
      root: { type: "view", name: "markdown-doc", props: { $bind: "instance" } },
    });
    expect(doc.root).toEqual({
      type: "view",
      name: "markdown-doc",
      props: { $bind: "instance" },
    });
  });

  it("accepts a form root with chat.invoke action", () => {
    const doc = parsePanelTypeDocument({
      type: "my-checklist",
      label: "Checklist",
      description: "d",
      category: "custom",
      defaultProps: { title: "" },
      propsFields: [{ key: "title", label: "Title", type: "string", required: true }],
      root: { type: "form" },
      actions: [
        {
          id: "ask",
          label: "Ask Chat",
          kind: "chat.invoke",
          payload: { template: "Review: {{title}}" },
        },
      ],
    });
    expect(doc.root.type).toBe("form");
    expect(doc.actions?.[0].kind).toBe("chat.invoke");
  });

  it("rejects missing type", () => {
    expect(() =>
      parsePanelTypeDocument({
        label: "X",
        description: "d",
        category: "c",
        defaultProps: {},
        propsFields: [],
        root: { type: "form" },
      }),
    ).toThrow();
  });

  it("rejects invalid action kind", () => {
    expect(() =>
      parsePanelTypeDocument({
        type: "x",
        label: "X",
        description: "d",
        category: "c",
        defaultProps: {},
        propsFields: [],
        root: { type: "form" },
        actions: [{ id: "a", label: "A", kind: "eval.run" }],
      }),
    ).toThrow();
  });
});
