import { describe, expect, it, vi } from "vitest";
import { parsePanelTypeDocument } from "../../shared/jsonWidget/schema";
import { buildRenderPlan } from "../../shared/jsonWidget/engine";
import { executeAction } from "../../shared/jsonWidget/actionBus";

const viewDoc = () =>
  parsePanelTypeDocument({
    type: "markdown-doc",
    label: "Markdown Doc",
    description: "d",
    category: "docs",
    defaultProps: { docsDir: "docs" },
    propsFields: [{ key: "docsDir", label: "Docs directory", type: "string" }],
    root: { type: "view", name: "markdown-doc", props: { $bind: "instance" } },
  });

describe("buildRenderPlan", () => {
  it("builds a view plan with merged props", () => {
    const plan = buildRenderPlan(viewDoc(), { docsDir: "notes" });
    expect(plan.kind).toBe("view");
    if (plan.kind !== "view") return;
    expect(plan.viewName).toBe("markdown-doc");
    expect(plan.viewProps.docsDir).toBe("notes");
  });

  it("builds a form plan", () => {
    const doc = parsePanelTypeDocument({
      type: "my-checklist",
      label: "Checklist",
      description: "d",
      category: "custom",
      defaultProps: { title: "T" },
      propsFields: [{ key: "title", label: "Title", type: "string" }],
      root: { type: "form" },
    });
    const plan = buildRenderPlan(doc, {});
    expect(plan.kind).toBe("form");
    if (plan.kind !== "form") return;
    expect(plan.values.title).toBe("T");
  });
});

describe("executeAction", () => {
  it("runs chat.invoke with interpolated template", async () => {
    const chatInvoke = vi.fn();
    await executeAction(
      {
        id: "ask",
        label: "Ask",
        kind: "chat.invoke",
        payload: { template: "Review: {{title}}" },
      },
      {
        props: { title: "Hello" },
        setProps: () => {},
        chatInvoke,
      },
    );
    expect(chatInvoke).toHaveBeenCalledWith("Review: Hello");
  });

  it("rejects unknown kinds", async () => {
    await expect(
      executeAction(
        { id: "x", label: "X", kind: "eval.run" },
        { props: {}, setProps: () => {} },
      ),
    ).rejects.toThrow(/not allowed/i);
  });

  it("calls panelApi methods", async () => {
    const listWorkspace = vi.fn().mockResolvedValue([]);
    await executeAction(
      {
        id: "list",
        label: "List",
        kind: "panel.listWorkspace",
        payload: { args: ["."] },
      },
      {
        props: {},
        setProps: () => {},
        panelApi: { listWorkspace },
      },
    );
    expect(listWorkspace).toHaveBeenCalledWith(".");
  });
});
