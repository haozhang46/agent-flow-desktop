// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ProjectHome from "../../src/pages/ProjectHome.vue";
import type { DesktopApi } from "../../electron/preload";

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ProjectHome", () => {
  beforeEach(() => {
    const desktop: DesktopApi = {
      getApiKeyStatus: vi.fn().mockResolvedValue(""),
      setApiKey: vi.fn().mockResolvedValue(true),
      clearApiKey: vi.fn().mockResolvedValue(true),
      getResourceServerUrl: vi.fn().mockResolvedValue(""),
      setResourceServerUrl: vi.fn().mockResolvedValue(true),
      getWorkspace: vi.fn().mockResolvedValue(""),
      pickWorkspace: vi.fn().mockResolvedValue("/tmp/opened"),
      pickProjectDirectory: vi.fn().mockResolvedValue("/tmp/new"),
      initProject: vi.fn().mockResolvedValue("/tmp/new"),
      openProject: vi.fn().mockResolvedValue("/tmp/recent-one"),
      getRecentProjects: vi.fn().mockResolvedValue(["/tmp/recent-one", "/tmp/recent-two"]),
      getSidecarPort: vi.fn().mockResolvedValue(8765),
    };
    window.desktop = desktop;
  });

  it("mounts and lists recent projects", async () => {
    const wrapper = mount(ProjectHome);
    await flushPromises();

    expect(wrapper.text()).toContain("Recent Projects");
    expect(wrapper.text()).toContain("recent-one");
    expect(wrapper.text()).toContain("recent-two");
    expect(window.desktop.getRecentProjects).toHaveBeenCalled();
  });

  it("emits opened when a recent project is clicked", async () => {
    const wrapper = mount(ProjectHome);
    await flushPromises();

    const buttons = wrapper.findAll("button");
    const recentButton = buttons.find((b) => b.text().includes("recent-one"));
    expect(recentButton).toBeDefined();
    await recentButton!.trigger("click");

    expect(window.desktop.openProject).toHaveBeenCalledWith("/tmp/recent-one");
    expect(wrapper.emitted("opened")?.[0]).toEqual(["/tmp/recent-one"]);
  });
});
