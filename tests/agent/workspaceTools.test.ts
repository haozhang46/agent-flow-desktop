import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import {
  buildReadOnlyWorkspaceTools,
  buildWorkspaceLangChainTools,
} from "../../electron/agent/workspaceTools";
import { loadWorkspace, saveWorkspace, workspacePath, resolveWorkflowLegacy } from "../../electron/workflow/workspaceLoader";

const WORKFLOW_ID = "test-wf";
const STEP_ID = "fe-dev";

async function seedWorkspace(
  root: string,
  def: {
    version: 1;
    stepId: string;
    layout: "tabs" | "stack";
    components: { id: string; type: string; label?: string; props?: Record<string, unknown> }[];
  },
): Promise<void> {
  const isLegacy = await resolveWorkflowLegacy(root, WORKFLOW_ID);
  const filePath = workspacePath(root, WORKFLOW_ID, STEP_ID, isLegacy);
  await saveWorkspace(filePath, def, STEP_ID);
}

const MINIMAL_WORKFLOW = {
  version: 1,
  id: WORKFLOW_ID,
  title: "Test Workflow",
  steps: [
    {
      id: STEP_ID,
      title: "FE Dev",
      executor: "deepseek",
      skills: [],
      outputs: [],
      gates: [],
    },
  ],
  edges: [],
  resources: [],
};

async function initProject(root: string): Promise<void> {
  const wfDir = path.join(root, ".agentflow/workflows", WORKFLOW_ID);
  await fs.mkdir(wfDir, { recursive: true });
  await fs.writeFile(
    path.join(wfDir, "workflow.yaml"),
    yaml.stringify(MINIMAL_WORKFLOW),
    "utf8",
  );
  await fs.writeFile(
    path.join(root, ".agentflow/active-workflow.json"),
    JSON.stringify({ workflowId: WORKFLOW_ID }),
    "utf8",
  );
}

describe("workspaceTools", () => {
  let tmp: string;
  let userData: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-ws-tools-"));
    userData = await fs.mkdtemp(path.join(os.tmpdir(), "af-ws-ud-"));
    await initProject(tmp);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
    await fs.rm(userData, { recursive: true, force: true });
  });

  function toolCtx(
    extra?: Partial<{ workflowId: string; stepId: string }>,
  ): { workspaceRoot: string; userDataRoot: string; workflowId?: string; stepId?: string } {
    return { workspaceRoot: tmp, userDataRoot: userData, ...extra };
  }

  it("workspace_list_registry returns known component types", async () => {
    const tools = buildWorkspaceLangChainTools(toolCtx());
    const listRegistry = tools.find((t) => t.name === "workspace_list_registry");
    const result = await listRegistry!.invoke({});
    expect(String(result)).toContain("code-explorer");
    expect(String(result)).toContain("fe-architecture-plan");
  });

  it("workspace_get reports missing workspace", async () => {
    const tools = buildWorkspaceLangChainTools(
      toolCtx({ workflowId: WORKFLOW_ID, stepId: STEP_ID }),
    );
    const get = tools.find((t) => t.name === "workspace_get");
    const result = await get!.invoke({});
    expect(String(result)).toContain("No workspace file");
  });

  it("workspace_add_component always proposes without saving", async () => {
    const ctx = toolCtx({ workflowId: WORKFLOW_ID, stepId: STEP_ID });
    const tools = buildWorkspaceLangChainTools(ctx);
    const add = tools.find((t) => t.name === "workspace_add_component");
    const result = await add!.invoke({
      type: "code-explorer",
      label: "Code",
      props: { root: "fe", writable: false },
      confirm: true,
    });
    expect(String(result)).toContain("WORKSPACE_PENDING_APPROVAL");

    const filePath = path.join(
      tmp,
      ".agentflow/workflows",
      WORKFLOW_ID,
      "workspaces",
      `${STEP_ID}.workspace.json`,
    );
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it("workspace_update_component changes props after seed", async () => {
    await seedWorkspace(tmp, {
      version: 1,
      stepId: STEP_ID,
      layout: "tabs",
      components: [
        {
          id: "code",
          type: "code-explorer",
          props: { root: "fe", writable: false },
        },
      ],
    });

    const ctx = toolCtx({ workflowId: WORKFLOW_ID, stepId: STEP_ID });
    const tools = buildWorkspaceLangChainTools(ctx);
    const update = tools.find((t) => t.name === "workspace_update_component");
    const result = await update!.invoke({
      component_id: "code",
      props: { writable: true },
      confirm: true,
    });
    expect(String(result)).toContain("WORKSPACE_PENDING_APPROVAL");

    const isLegacy = await resolveWorkflowLegacy(tmp, WORKFLOW_ID);
    const filePath = workspacePath(tmp, WORKFLOW_ID, STEP_ID, isLegacy);
    const loaded = await loadWorkspace(filePath);
    expect(loaded.components[0].props.writable).toBe(false);
  });

  it("workspace_remove_component returns pending without deleting", async () => {
    await seedWorkspace(tmp, {
      version: 1,
      stepId: STEP_ID,
      layout: "tabs",
      components: [{ id: "code", type: "code-explorer", props: { root: "fe" } }],
    });

    const ctx = toolCtx({ workflowId: WORKFLOW_ID, stepId: STEP_ID });
    const tools = buildWorkspaceLangChainTools(ctx);
    const remove = tools.find((t) => t.name === "workspace_remove_component");
    const result = await remove!.invoke({ component_id: "code", confirm: true });
    expect(String(result)).toContain("WORKSPACE_PENDING_APPROVAL");

    const isLegacy = await resolveWorkflowLegacy(tmp, WORKFLOW_ID);
    const loaded = await loadWorkspace(workspacePath(tmp, WORKFLOW_ID, STEP_ID, isLegacy));
    expect(loaded.components).toHaveLength(1);
  });

  it("workspace_reorder returns pending without changing order", async () => {
    await seedWorkspace(tmp, {
      version: 1,
      stepId: STEP_ID,
      layout: "tabs",
      components: [
        { id: "a", type: "code-explorer", props: { root: "fe" } },
        { id: "b", type: "markdown-doc", props: {} },
      ],
    });

    const ctx = toolCtx({ workflowId: WORKFLOW_ID, stepId: STEP_ID });
    const tools = buildWorkspaceLangChainTools(ctx);
    const reorder = tools.find((t) => t.name === "workspace_reorder");
    const result = await reorder!.invoke({ component_ids: ["b", "a"], confirm: true });
    expect(String(result)).toContain("WORKSPACE_PENDING_APPROVAL");

    const isLegacy = await resolveWorkflowLegacy(tmp, WORKFLOW_ID);
    const loaded = await loadWorkspace(workspacePath(tmp, WORKFLOW_ID, STEP_ID, isLegacy));
    expect(loaded.components.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("workspace_set_layout returns pending without saving", async () => {
    const ctx = toolCtx({ workflowId: WORKFLOW_ID, stepId: STEP_ID });
    const tools = buildWorkspaceLangChainTools(ctx);
    const setLayout = tools.find((t) => t.name === "workspace_set_layout");
    const result = await setLayout!.invoke({ layout: "stack", confirm: true });
    expect(String(result)).toContain("WORKSPACE_PENDING_APPROVAL");
    expect(String(result)).toContain("layout: (new) → stack");

    const isLegacy = await resolveWorkflowLegacy(tmp, WORKFLOW_ID);
    await expect(
      fs.access(workspacePath(tmp, WORKFLOW_ID, STEP_ID, isLegacy)),
    ).rejects.toThrow();
  });

  it("read-only variant excludes mutating tools", () => {
    const readOnly = buildReadOnlyWorkspaceTools(toolCtx());
    const names = readOnly.map((t) => t.name);
    expect(names).toEqual(["workspace_get", "workspace_list_registry"]);
    expect(names).not.toContain("workspace_add_component");
  });

  it("rejects unknown component type", async () => {
    const tools = buildWorkspaceLangChainTools(
      toolCtx({ workflowId: WORKFLOW_ID, stepId: STEP_ID }),
    );
    const add = tools.find((t) => t.name === "workspace_add_component");
    const result = await add!.invoke({ type: "not-a-widget", props: {}, confirm: true });
    expect(String(result)).toContain("Unknown component type");
  });
});
