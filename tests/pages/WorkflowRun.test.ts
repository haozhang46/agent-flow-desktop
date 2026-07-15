// @vitest-environment happy-dom
import { mount, flushPromises } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import WorkflowRun from "../../src/pages/WorkflowRun.vue";
import type { DesktopApi } from "../../electron/preload";

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await flushPromises();
  }
}

const mockWorkflow = {
  version: 1 as const,
  id: "default-dev-cicd",
  title: "Dev to CI/CD Pipeline",
  steps: [
    {
      id: "prd",
      title: "PRD",
      executor: "deepseek",
      skills: ["brainstorming"],
      outputs: ["docs/PRD.md"],
    },
    {
      id: "architecture",
      title: "Architecture",
      executor: "deepseek",
      skills: [],
      outputs: ["docs/architecture.md"],
    },
    {
      id: "fe-dev",
      title: "Frontend Development",
      executor: "claude-code",
      skills: [],
      outputs: ["fe/"],
    },
    {
      id: "test",
      title: "Test",
      executor: "deepseek",
      skills: [],
      outputs: ["test-report.md"],
    },
    {
      id: "cicd",
      title: "CI/CD",
      executor: "deepseek",
      skills: [],
      outputs: [".github/workflows/"],
    },
  ],
  edges: [],
  resources: [],
};

const mockState = {
  workflowId: "default-dev-cicd",
  currentStepId: "prd",
  stepStatuses: {
    prd: "pending" as const,
    architecture: "pending" as const,
    "fe-dev": "pending" as const,
    test: "pending" as const,
    cicd: "pending" as const,
  },
  threadId: "thread-1",
};

const emptyUaStatus = {
  hasGraph: false,
  busy: false,
  busyKind: null,
  summary: null,
  analyzedAt: null,
};

function mockUaStatusFetch(url: string) {
  if (url.includes("/v1/ua/status")) {
    return new Response(JSON.stringify(emptyUaStatus), { status: 200 });
  }
  return null;
}

function mockChatMemoryFetch(url: string, method: string) {
  if (url.match(/\/v1\/chat-memory\/threads\/[^/?]+/) && method === "GET") {
    return new Response(
      JSON.stringify({
        meta: {
          id: "thread-1",
          title: "New Chat",
          createdAt: "2026-06-20T00:00:00.000Z",
          updatedAt: "2026-06-20T00:00:00.000Z",
          checkpointThreadId: "step:default-dev-cicd:prd:thread-1",
        },
        messages: [],
      }),
      { status: 200 },
    );
  }
  if (url.includes("/v1/chat-memory/threads") && method === "GET") {
    return new Response(JSON.stringify([]), { status: 200 });
  }
  if (url.includes("/v1/chat-memory/threads") && method === "POST") {
    const meta = {
      id: "thread-1",
      title: "New Chat",
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
      checkpointThreadId: "step:default-dev-cicd:prd:thread-1",
    };
    return new Response(JSON.stringify(meta), { status: 201 });
  }
  return null;
}

describe("WorkflowRun", () => {
  beforeEach(() => {
    localStorage.clear();
    const desktop: DesktopApi = {
      getApiKeyStatus: vi.fn().mockResolvedValue(""),
      setApiKey: vi.fn().mockResolvedValue(true),
      clearApiKey: vi.fn().mockResolvedValue(true),
      getResourceServerUrl: vi.fn().mockResolvedValue(""),
      setResourceServerUrl: vi.fn().mockResolvedValue(true),
      getWorkspace: vi.fn().mockResolvedValue("/tmp/project"),
      pickWorkspace: vi.fn().mockResolvedValue(""),
      pickProjectDirectory: vi.fn().mockResolvedValue(""),
      initProject: vi.fn().mockResolvedValue(""),
      openProject: vi.fn().mockResolvedValue(""),
      getRecentProjects: vi.fn().mockResolvedValue([]),
      getSidecarPort: vi.fn().mockResolvedValue(8765),
    };
    window.desktop = desktop;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const uaStatus = mockUaStatusFetch(url);
        if (uaStatus) return uaStatus;
        const chatMemory = mockChatMemoryFetch(url, method);
        if (chatMemory) return chatMemory;
        if (
          url.includes("/v1/workflows") &&
          !url.includes("/current") &&
          !url.includes("/templates") &&
          !url.includes("/workspaces/")
        ) {
          return new Response(
            JSON.stringify({
              workflows: [{ id: "default-dev-cicd", title: "Dev to CI/CD Pipeline", isLegacy: true, isActive: true }],
              activeWorkflowId: "default-dev-cicd",
            }),
            { status: 200 },
          );
        }
        if (url.includes("/v1/workflows/current")) {
          return new Response(JSON.stringify(mockWorkflow), { status: 200 });
        }
        if (url.includes("/v1/workflow/state")) {
          return new Response(JSON.stringify(mockState), { status: 200 });
        }
        if (url.includes("/v1/skills")) {
          if (url.includes("detailed=1")) {
            return new Response(
              JSON.stringify([
                { name: "brainstorming", description: "Brainstorm ideas" },
                { name: "writing-plans", description: "Write implementation plans" },
              ]),
              { status: 200 },
            );
          }
          return new Response(JSON.stringify(["brainstorming", "writing-plans"]), {
            status: 200,
          });
        }
        if (url.includes("/v1/workspace/list")) {
          return new Response(
            JSON.stringify({ path: "docs", entries: [{ name: "PRD.md", path: "docs/PRD.md", type: "file" }] }),
            { status: 200 },
          );
        }
        if (url.includes("/v1/workspace/file")) {
          const path = url.includes("architecture")
            ? "docs/architecture.md"
            : "docs/PRD.md";
          const content = url.includes("architecture") ? "# Architecture\n" : "# PRD\n\nSample";
          return new Response(JSON.stringify({ path, content }), { status: 200 });
        }
        if (url.includes("/v1/workflows/default-dev-cicd/workspaces/architecture")) {
          return new Response(
            JSON.stringify({
              version: 1,
              stepId: "architecture",
              layout: "stack",
              components: [
                {
                  id: "arch",
                  type: "architecture-docs",
                  props: {
                    files: [
                      { path: "docs/architecture.md", label: "Architecture" },
                      { path: "AGENTS.md", label: "AGENTS.md" },
                    ],
                  },
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.match(/\/v1\/workflows\/[^/]+\/workspaces\/[^/]+$/)) {
          return new Response("not found", { status: 404 });
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mounts and shows workflow steps with status badges", async () => {
    const wrapper = mount(WorkflowRun, {
      props: { workspace: "/tmp/project" },
    });
    await settle();

    expect(wrapper.text()).toContain("From project");
    expect(wrapper.text()).toContain("Dev to CI/CD Pipeline");
    expect(wrapper.text()).toContain("PRD");
    expect(wrapper.text()).toContain("Architecture");
    expect(wrapper.text()).toContain("Pending");
    expect(wrapper.text()).toContain("Continue");
    expect(wrapper.text()).toContain("Step Chat");
    wrapper.unmount();
  });

  it("shows architecture panel when architecture step selected", async () => {
    const wrapper = mount(WorkflowRun, {
      props: { workspace: "/tmp/project" },
    });
    await settle();

    const archBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Architecture") && b.text().includes("Pending"));
    expect(archBtn).toBeDefined();
    await archBtn!.trigger("click");
    await vi.waitFor(
      async () => {
        await flushPromises();
        expect(wrapper.text()).toContain("docs/architecture.md");
      },
      { timeout: 5000 },
    );
    wrapper.unmount();
  });

  it("switches to Free Chat tab", async () => {
    const wrapper = mount(WorkflowRun, {
      props: { workspace: "/tmp/project" },
    });
    await settle();

    const freeTab = wrapper.findAll("button").find((b) => b.text() === "Free Chat");
    expect(freeTab).toBeDefined();
    await freeTab!.trigger("click");

    expect(wrapper.text()).toContain("Free Chat");
  });

  it("renders workspace from API when available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const uaStatus = mockUaStatusFetch(url);
        if (uaStatus) return uaStatus;
        const chatMemory = mockChatMemoryFetch(url, method);
        if (chatMemory) return chatMemory;
        if (url.includes("/v1/workflows") && !url.includes("/current") && !url.includes("/templates") && !url.includes("/workspaces/")) {
          return new Response(
            JSON.stringify({
              workflows: [{ id: "default-dev-cicd", title: "Dev to CI/CD Pipeline", isLegacy: true, isActive: true }],
              activeWorkflowId: "default-dev-cicd",
            }),
            { status: 200 },
          );
        }
        if (url.includes("/v1/workflows/current")) {
          return new Response(JSON.stringify(mockWorkflow), { status: 200 });
        }
        if (url.includes("/v1/workflow/state")) {
          return new Response(JSON.stringify(mockState), { status: 200 });
        }
        if (url.includes("/v1/skills")) {
          if (url.includes("detailed=1")) {
            return new Response(
              JSON.stringify([{ name: "brainstorming", description: "Brainstorm ideas" }]),
              { status: 200 },
            );
          }
          return new Response(JSON.stringify(["brainstorming"]), { status: 200 });
        }
        if (url.includes("/v1/workflows/default-dev-cicd/workspaces/prd")) {
          return new Response(
            JSON.stringify({
              version: 1,
              stepId: "prd",
              layout: "stack",
              components: [
                { id: "doc", type: "markdown-doc", props: { docsDir: "docs-custom" } },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/v1/workspace/list")) {
          return new Response(JSON.stringify({ path: "docs-custom", entries: [] }), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const wrapper = mount(WorkflowRun, {
      props: { workspace: "/tmp/project" },
    });
    await settle();

    expect(wrapper.text()).toContain("Documents");
  });

  it("shows initialize workflow action when project has no workflows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("/v1/workflows/init")) {
          return new Response(JSON.stringify({ workflowId: "default-dev-cicd" }), { status: 200 });
        }
        if (
          url.includes("/v1/workflows") &&
          !url.includes("/current") &&
          !url.includes("/templates") &&
          !url.includes("/workspaces/") &&
          !url.includes("/init")
        ) {
          return new Response(
            JSON.stringify({ workflows: [], activeWorkflowId: null }),
            { status: 200 },
          );
        }
        if (url.includes("/v1/skills")) {
          if (url.includes("detailed=1")) {
            return new Response(JSON.stringify([]), { status: 200 });
          }
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const wrapper = mount(WorkflowRun, {
      props: { workspace: "/tmp/project" },
    });
    await settle();

    expect(wrapper.text()).toContain("no workflow configuration");
    expect(wrapper.text()).toContain("Initialize workflow config");
  });
});
