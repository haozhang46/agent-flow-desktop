import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildWorkspaceLangChainTools } from "../../electron/agent/workspaceTools";

describe("workspace_register_component_type", () => {
  let root: string;
  let userData: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "reg-"));
    userData = await fs.mkdtemp(path.join(os.tmpdir(), "reg-ud-"));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(userData, { recursive: true, force: true });
  });

  it("returns pending approval without writing files", async () => {
    const tools = buildWorkspaceLangChainTools({
      workspaceRoot: root,
      userDataRoot: userData,
    });
    const tool = tools.find((t) => t.name === "workspace_register_component_type");
    expect(tool).toBeTruthy();
    const result = await tool!.invoke({
      scope: "project",
      type_def: {
        type: "my-checklist",
        label: "Checklist",
        description: "d",
        category: "custom",
        defaultProps: {},
        propsFields: [{ key: "title", label: "Title", type: "string" }],
      },
    });
    expect(String(result)).toContain("COMPONENT_TYPE_PENDING_APPROVAL");
    await expect(
      fs.access(path.join(root, ".agentflow/component-types/my-checklist.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects reserved built-in type", async () => {
    const tools = buildWorkspaceLangChainTools({
      workspaceRoot: root,
      userDataRoot: userData,
    });
    const tool = tools.find((t) => t.name === "workspace_register_component_type")!;
    const result = await tool.invoke({
      scope: "project",
      type_def: {
        type: "markdown-doc",
        label: "X",
        description: "d",
        category: "custom",
        defaultProps: {},
        propsFields: [],
      },
    });
    expect(String(result)).toMatch(/reserved/i);
  });
});
