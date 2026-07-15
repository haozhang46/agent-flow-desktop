import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  saveComponentType,
  mergeWorkspaceRegistry,
  listComponentTypes,
} from "../../electron/workflow/componentTypeStore";

describe("componentTypeStore", () => {
  let root: string;
  let userData: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "cts-"));
    userData = await fs.mkdtemp(path.join(os.tmpdir(), "cts-ud-"));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(userData, { recursive: true, force: true });
  });

  const sample = {
    type: "my-checklist",
    label: "Checklist",
    description: "d",
    category: "custom",
    defaultProps: {},
    propsFields: [{ key: "title", label: "Title", type: "string" as const }],
  };

  it("saves project scope and merges into registry", async () => {
    await saveComponentType({
      workspaceRoot: root,
      userDataRoot: userData,
      scope: "project",
      typeDef: sample,
    });
    const merged = await mergeWorkspaceRegistry({
      workspaceRoot: root,
      userDataRoot: userData,
    });
    expect(merged.some((e) => e.type === "my-checklist")).toBe(true);
    expect(merged.some((e) => e.type === "markdown-doc")).toBe(true);
  });

  it("workflow overrides project for same type id", async () => {
    await saveComponentType({
      workspaceRoot: root,
      userDataRoot: userData,
      scope: "project",
      typeDef: { ...sample, label: "Project" },
    });
    await saveComponentType({
      workspaceRoot: root,
      userDataRoot: userData,
      scope: "workflow",
      workflowId: "wf1",
      typeDef: { ...sample, label: "Workflow" },
    });
    const merged = await mergeWorkspaceRegistry({
      workspaceRoot: root,
      userDataRoot: userData,
      workflowId: "wf1",
    });
    expect(merged.find((e) => e.type === "my-checklist")?.label).toBe("Workflow");
  });

  it("listComponentTypes returns customs only", async () => {
    await saveComponentType({
      workspaceRoot: root,
      userDataRoot: userData,
      scope: "global",
      typeDef: sample,
    });
    const list = await listComponentTypes({
      workspaceRoot: root,
      userDataRoot: userData,
    });
    expect(list.map((t) => t.type)).toEqual(["my-checklist"]);
  });
});
