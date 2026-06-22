// @vitest-environment happy-dom
import { mount, flushPromises } from "@vue/test-utils";
import { describe, it, expect, vi } from "vitest";
import TopologyContextWidget from "../../src/workspace/widgets/TopologyContextWidget.vue";
import CicdReadinessWidget from "../../src/workspace/widgets/CicdReadinessWidget.vue";
import type { PanelApi } from "../../src/workspace/registryComponents";

function mockApi(overrides: Partial<PanelApi> = {}): PanelApi {
  return {
    fetchPhase: vi.fn(),
    fetchGates: vi.fn().mockResolvedValue({ stepId: "cicd", results: [] }),
    fetchDeploymentConfig: vi.fn(),
    fetchResourceContext: vi.fn(),
    fetchTopology: vi.fn(),
    fetchOpsSummary: vi.fn(),
    listWorkspace: vi.fn(),
    readWorkspaceFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
    writeWorkspaceFile: vi.fn(),
    deleteWorkspacePath: vi.fn(),
    ...overrides,
  };
}

describe("TopologyContextWidget", () => {
  it("shows api node with source from fetchTopology", async () => {
    const api = mockApi({
      fetchTopology: vi.fn().mockResolvedValue({
        topology: {
          version: 1,
          project: "demo",
          nodes: [
            { id: "api", kind: "service", source: "backend", dockerfile: "Dockerfile" },
          ],
          edges: [{ from: "api", to: "db", env: { DATABASE_URL: "postgresql://..." } }],
          targets: [],
        },
      }),
    });
    const wrapper = mount(TopologyContextWidget, {
      props: { api, focusNodes: ["api"] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("api");
    expect(wrapper.text()).toContain("source: backend");
  });
});

describe("CicdReadinessWidget", () => {
  it("shows not ready when Dockerfile missing", async () => {
    const api = mockApi({
      readWorkspaceFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
      fetchTopology: vi.fn().mockResolvedValue({
        topology: {
          version: 1,
          project: "demo",
          nodes: [{ id: "api", kind: "service", source: "backend" }],
          edges: [],
          targets: [],
        },
      }),
      listWorkspace: vi.fn().mockImplementation(async (path: string) => {
        if (path === ".github/workflows") {
          return { path, entries: [{ name: "ci.yml", path: ".github/workflows/ci.yml", type: "file" as const }] };
        }
        if (path === "backend") {
          return { path, entries: [], exists: true };
        }
        return { path, entries: [], exists: false };
      }),
    });
    const wrapper = mount(CicdReadinessWidget, {
      props: { api, gatesStepId: "cicd" },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="readiness-dockerfile"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Not ready");
  });
});
