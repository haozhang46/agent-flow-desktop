// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LangflowEditor from "../../src/pages/LangflowEditor.vue";
import type { DesktopApi } from "../../electron/preload";

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const mockFlows = {
  flows: [
    { id: "flow-1", name: "Pipeline A", updated_at: "2026-06-16T10:00:00Z" },
    { id: "flow-2", name: "Pipeline B" },
  ],
  activeFlowId: "flow-1",
};

function desktopMock(): DesktopApi {
  return {
    getApiKeyStatus: vi.fn().mockResolvedValue(""),
    setApiKey: vi.fn().mockResolvedValue(true),
    clearApiKey: vi.fn().mockResolvedValue(true),
    getResourceServerUrl: vi.fn().mockResolvedValue(""),
    setResourceServerUrl: vi.fn().mockResolvedValue(true),
    getLangflowBaseUrl: vi.fn().mockResolvedValue("http://127.0.0.1:7860"),
    getLangflowApiKeyStatus: vi.fn().mockResolvedValue(""),
    setLangflow: vi.fn().mockResolvedValue(true),
    getLangflowAutoStart: vi.fn().mockResolvedValue(true),
    setLangflowAutoStart: vi.fn().mockResolvedValue(true),
    restartLangflow: vi.fn().mockResolvedValue({ ok: true }),
    getWorkspace: vi.fn().mockResolvedValue("/tmp/project"),
    pickWorkspace: vi.fn().mockResolvedValue(""),
    pickProjectDirectory: vi.fn().mockResolvedValue(""),
    initProject: vi.fn().mockResolvedValue(""),
    openProject: vi.fn().mockResolvedValue(""),
    getRecentProjects: vi.fn().mockResolvedValue([]),
    getSidecarPort: vi.fn().mockResolvedValue(8765),
  };
}

describe("LangflowEditor", () => {
  beforeEach(() => {
    window.desktop = desktopMock();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("/v1/langflow/status")) {
          return new Response(
            JSON.stringify({ ok: true, baseUrl: "http://127.0.0.1:7860", mode: "external" }),
            { status: 200 },
          );
        }
        if (url.includes("/v1/langflow/flows") && !url.includes("/active")) {
          return new Response(JSON.stringify(mockFlows), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  it("shows workspace gate when no project open", async () => {
    const wrapper = mount(LangflowEditor, { props: { workspace: "" } });
    await flushPromises();
    expect(wrapper.text()).toContain("Open a project");
  });

  it("lists flows and shows active badge", async () => {
    const wrapper = mount(LangflowEditor, { props: { workspace: "/tmp/project" } });
    await flushPromises();
    await flushPromises();
    expect(wrapper.text()).toContain("Pipeline A");
    expect(wrapper.text()).toContain("Active");
    expect(wrapper.text()).toContain("Save Active Flow");
  });

  it("selects another flow when sidebar item clicked", async () => {
    const wrapper = mount(LangflowEditor, { props: { workspace: "/tmp/project" } });
    await flushPromises();
    await flushPromises();
    const buttons = wrapper.findAll("aside button").filter((b) => b.text().includes("Pipeline B"));
    expect(buttons.length).toBeGreaterThan(0);
    await buttons[0].trigger("click");
    const webview = wrapper.find("webview");
    expect(webview.attributes("src")).toContain("flow-2");
  });
});
