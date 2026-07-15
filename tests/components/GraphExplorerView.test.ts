// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GraphExplorerView from "../../src/components/ua/GraphExplorerView.vue";
import type { KnowledgeGraph } from "../../src/types/ua";

const graph: KnowledgeGraph = {
  project: {
    name: "fixture-app",
    description: "Minimal UA graph for tests",
    languages: ["typescript"],
    frameworks: ["vue"],
    analyzedAt: "2026-07-15T00:00:00.000Z",
    gitCommitHash: null,
    roots: [
      {
        id: "main",
        label: "Main",
        path: ".",
        gitCommitHash: null,
      },
    ],
  },
  nodes: [
    {
      id: "file:src/main.ts",
      type: "file",
      name: "main.ts",
      filePath: "src/main.ts",
      summary: "App entry",
      tags: ["entry"],
      complexity: "low",
      rootId: "main",
    },
    {
      id: "file:src/App.vue",
      type: "file",
      name: "App.vue",
      filePath: "src/App.vue",
      summary: "Root component",
      tags: ["ui"],
      complexity: "medium",
      rootId: "main",
    },
    {
      id: "mod:api",
      type: "module",
      name: "api",
      summary: "HTTP client",
      tags: ["network"],
      complexity: "low",
      rootId: "main",
    },
  ],
  edges: [
    {
      source: "file:src/main.ts",
      target: "file:src/App.vue",
      type: "imports",
    },
    {
      source: "file:src/App.vue",
      target: "mod:api",
      type: "calls",
    },
  ],
  layers: [
    {
      id: "layer:ui",
      name: "UI",
      description: "Frontend",
      nodeIds: ["file:src/main.ts", "file:src/App.vue"],
    },
    {
      id: "layer:services",
      name: "Services",
      description: "Backend-ish",
      nodeIds: ["mod:api"],
    },
  ],
  tour: [],
};

describe("GraphExplorerView", () => {
  it("renders layers as columns with node rows", () => {
    const wrapper = mount(GraphExplorerView, { props: { graph } });

    expect(wrapper.find('[data-testid="ua-graph-explorer"]').exists()).toBe(true);
    const columns = wrapper.findAll('[data-testid="ua-explorer-layer"]');
    expect(columns).toHaveLength(2);
    expect(columns[0]!.text()).toContain("UI");
    expect(columns[1]!.text()).toContain("Services");

    const nodes = wrapper.findAll('[data-testid="ua-explorer-node"]');
    expect(nodes).toHaveLength(3);
    expect(nodes[0]!.text()).toContain("main.ts");
    expect(nodes[2]!.text()).toContain("api");
  });

  it("shows detail pane with summary, filePath, and edge targets on node click", async () => {
    const wrapper = mount(GraphExplorerView, { props: { graph } });

    expect(wrapper.find('[data-testid="ua-explorer-detail"]').exists()).toBe(false);

    await wrapper.get('[data-testid="ua-explorer-node"][data-node-id="file:src/main.ts"]').trigger(
      "click",
    );

    const detail = wrapper.get('[data-testid="ua-explorer-detail"]');
    expect(detail.text()).toContain("App entry");
    expect(detail.text()).toContain("src/main.ts");
    expect(detail.text()).toContain("file:src/App.vue");
  });

  it("lists connected targets for both outgoing and incoming edges", async () => {
    const wrapper = mount(GraphExplorerView, { props: { graph } });

    await wrapper
      .get('[data-testid="ua-explorer-node"][data-node-id="file:src/App.vue"]')
      .trigger("click");

    const detail = wrapper.get('[data-testid="ua-explorer-detail"]');
    expect(detail.text()).toContain("Root component");
    expect(detail.text()).toContain("src/App.vue");
    // outgoing
    expect(detail.text()).toContain("mod:api");
    // incoming source also shown as connected
    expect(detail.text()).toContain("file:src/main.ts");
  });
});
