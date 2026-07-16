import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  workspacePath,
  workspacesDir,
  loadWorkspace,
  saveWorkspace,
  listWorkspaces,
} from "../../electron/workflow/workspaceLoader";
import { saveComponentType } from "../../electron/workflow/componentTypeStore";

const FE_DEV_WORKSPACE = {
  version: 1,
  stepId: "fe-dev",
  layout: "tabs",
  components: [
    {
      id: "code",
      type: "code-explorer",
      label: "代码",
      props: { root: "fe", writable: false },
    },
  ],
};

describe("workspacePath", () => {
  it("returns legacy path under .agentflow/workspaces", () => {
    const p = workspacePath("/proj", "legacy-wf", "fe-dev", true);
    expect(p).toBe("/proj/.agentflow/workspaces/fe-dev.workspace.json");
  });

  it("returns modern path under workflows/{id}/workspaces", () => {
    const p = workspacePath("/proj", "default-dev-cicd", "fe-dev", false);
    expect(p).toBe(
      "/proj/.agentflow/workflows/default-dev-cicd/workspaces/fe-dev.workspace.json",
    );
  });
});

describe("workspaceLoader I/O", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-ws-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("saveWorkspace and loadWorkspace round-trip on modern path", async () => {
    const filePath = workspacePath(tmp, "default-dev-cicd", "fe-dev", false);
    await saveWorkspace(filePath, FE_DEV_WORKSPACE, "fe-dev");
    const loaded = await loadWorkspace(filePath);
    expect(loaded).toEqual(FE_DEV_WORKSPACE);
  });

  it("saveWorkspace and loadWorkspace round-trip on legacy path", async () => {
    const filePath = workspacePath(tmp, "legacy-wf", "prd", true);
    const prd = {
      version: 1,
      stepId: "prd",
      layout: "stack",
      components: [{ id: "doc", type: "markdown-doc", props: { docsDir: "docs" } }],
    };
    await saveWorkspace(filePath, prd, "prd");
    const loaded = await loadWorkspace(filePath);
    expect(loaded.stepId).toBe("prd");
    expect(loaded.components[0].type).toBe("markdown-doc");
  });

  it("saveWorkspace rejects invalid workspace JSON", async () => {
    const filePath = workspacePath(tmp, "wf", "fe-dev", false);
    await expect(
      saveWorkspace(filePath, {
        version: 1,
        stepId: "fe-dev",
        layout: "tabs",
        components: [{ id: "code", type: "code-explorer", props: {} }],
      }),
    ).rejects.toThrow();
  });

  it("saveWorkspace rejects stepId mismatch", async () => {
    const filePath = workspacePath(tmp, "wf", "fe-dev", false);
    await expect(saveWorkspace(filePath, FE_DEV_WORKSPACE, "prd")).rejects.toThrow(/mismatch/i);
  });

  it("listWorkspaces returns step ids for modern layout", async () => {
    await saveWorkspace(workspacePath(tmp, "wf", "fe-dev", false), FE_DEV_WORKSPACE);
    await saveWorkspace(
      workspacePath(tmp, "wf", "prd", false),
      {
        version: 1,
        stepId: "prd",
        layout: "stack",
        components: [{ id: "doc", type: "markdown-doc", props: {} }],
      },
    );
    const ids = await listWorkspaces(tmp, "wf", false);
    expect(ids).toEqual(["fe-dev", "prd"]);
  });

  it("listWorkspaces returns step ids for legacy layout", async () => {
    const legacyDir = workspacesDir(tmp, "legacy-wf", true);
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(
      path.join(legacyDir, "cicd.workspace.json"),
      JSON.stringify({
        version: 1,
        stepId: "cicd",
        layout: "stack",
        components: [{ id: "cfg", type: "cicd-config", props: {} }],
      }),
    );
    const ids = await listWorkspaces(tmp, "legacy-wf", true);
    expect(ids).toEqual(["cicd"]);
  });

  it("listWorkspaces returns empty when directory missing", async () => {
    const ids = await listWorkspaces(tmp, "missing-wf", false);
    expect(ids).toEqual([]);
  });

  it("saveWorkspace/loadWorkspace accept custom component types via loader context", async () => {
    const userData = await fs.mkdtemp(path.join(os.tmpdir(), "af-ws-ud-"));
    try {
      await saveComponentType({
        workspaceRoot: tmp,
        userDataRoot: userData,
        scope: "project",
        typeDef: {
          type: "my-checklist",
          label: "Checklist",
          description: "d",
          category: "custom",
          defaultProps: {},
          propsFields: [{ key: "title", label: "Title", type: "string" }],
        },
      });
      const def = {
        version: 1 as const,
        stepId: "fe-dev",
        layout: "tabs" as const,
        components: [
          { id: "check", type: "my-checklist", props: { title: "Ship it" } },
        ],
      };
      const ctx = {
        workspaceRoot: tmp,
        userDataRoot: userData,
        workflowId: "wf",
      };
      const filePath = workspacePath(tmp, "wf", "fe-dev", false);
      await expect(saveWorkspace(filePath, def, "fe-dev")).rejects.toThrow(
        /Unknown component type/,
      );
      await saveWorkspace(filePath, def, "fe-dev", ctx);
      const loaded = await loadWorkspace(filePath, ctx);
      expect(loaded.components[0]?.type).toBe("my-checklist");
      expect(loaded.components[0]?.props).toEqual({ title: "Ship it" });
    } finally {
      await fs.rm(userData, { recursive: true, force: true });
    }
  });
});
