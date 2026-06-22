import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readLangflowState, writeLangflowState } from "../../electron/langflow/store";
import {
  countStepNodes,
  mapLangflowExportToCompilerInput,
  setActiveWorkspaceFlow,
} from "../../electron/langflow/service";

vi.mock("../../electron/langflow/client", () => ({
  checkHealth: vi.fn(),
  listFlows: vi.fn(),
  createFlow: vi.fn(),
  getFlow: vi.fn(),
  createProject: vi.fn(),
  findProjectIdByName: vi.fn(),
}));

vi.mock("../../electron/langflow/apiKey", () => ({
  provisionLangflowApiKey: vi.fn().mockResolvedValue(null),
}));

import { getFlow } from "../../electron/langflow/client";

const mockedGetFlow = vi.mocked(getFlow);

const FLOW_WITH_STEPS = {
  id: "flow-abc",
  name: "My Pipeline",
  data: {
    nodes: [
      {
        id: "langflow-node-1",
        data: {
          metadata: {
            id: "prd",
            title: "PRD",
            executor: "deepseek",
            skills: ["brainstorming"],
            gate: "manual",
          },
        },
      },
      {
        id: "langflow-node-2",
        data: {
          metadata: {
            id: "build",
            title: "Build",
            executor: "claude-code",
            skills: [],
            gate: "auto",
          },
        },
      },
    ],
    edges: [{ source: "langflow-node-1", target: "langflow-node-2" }],
  },
};

describe("langflow store", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-langflow-store-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("roundtrips readLangflowState and writeLangflowState", async () => {
    expect(await readLangflowState(tmp)).toEqual({});

    const state = {
      projectId: "proj-1",
      activeFlowId: "flow-1",
      lastSyncedAt: "2026-06-16T12:00:00.000Z",
    };
    await writeLangflowState(tmp, state);

    expect(await readLangflowState(tmp)).toEqual(state);

    const raw = await fs.readFile(path.join(tmp, ".agentflow/langflow.json"), "utf8");
    expect(JSON.parse(raw)).toEqual(state);
  });
});

describe("mapLangflowExportToCompilerInput", () => {
  it("maps Langflow flow export to LangflowJson for the compiler", () => {
    const langflowJson = mapLangflowExportToCompilerInput(FLOW_WITH_STEPS);

    expect(langflowJson.id).toBe("flow-abc");
    expect(langflowJson.title).toBe("My Pipeline");
    expect(langflowJson.nodes).toHaveLength(2);
    expect(langflowJson.edges).toEqual([
      { source: "langflow-node-1", target: "langflow-node-2" },
    ]);
    expect(langflowJson.nodes?.[0]?.data?.metadata?.id).toBe("prd");
    expect(countStepNodes(langflowJson)).toBe(2);
  });
});

describe("setActiveWorkspaceFlow", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-langflow-active-"));
    mockedGetFlow.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("writes flow export and updates langflow.json without overwriting workflow.yaml", async () => {
    mockedGetFlow.mockResolvedValue(FLOW_WITH_STEPS);

    const workflow = await setActiveWorkspaceFlow(tmp, "flow-abc");

    expect(workflow.id).toBe("flow-abc");
    expect(workflow.title).toBe("My Pipeline");
    expect(workflow.steps).toHaveLength(2);
    expect(workflow.steps[0].id).toBe("prd");
    expect(workflow.edges).toEqual([{ from: "prd", to: "build" }]);

    const flowExportPath = path.join(tmp, ".agentflow/langflow/flows/flow-abc.json");
    const flowExport = JSON.parse(await fs.readFile(flowExportPath, "utf8"));
    expect(flowExport.id).toBe("flow-abc");
    expect(flowExport.name).toBe("My Pipeline");

    await expect(fs.access(path.join(tmp, ".agentflow/workflow.yaml"))).rejects.toThrow();

    const state = await readLangflowState(tmp);
    expect(state.activeFlowId).toBe("flow-abc");
    expect(state.lastSyncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("throws when flow has no step nodes with metadata.id", async () => {
    mockedGetFlow.mockResolvedValue({
      id: "empty-flow",
      name: "Empty",
      data: { nodes: [{ id: "n1", data: {} }], edges: [] },
    });

    await expect(setActiveWorkspaceFlow(tmp, "empty-flow")).rejects.toThrow(
      /no step nodes with data\.metadata\.id/i,
    );
    await expect(fs.access(path.join(tmp, ".agentflow/workflow.yaml"))).rejects.toThrow();
  });
});
