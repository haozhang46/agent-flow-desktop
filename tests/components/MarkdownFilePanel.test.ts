// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import MarkdownFilePanel from "../../src/components/workflow/MarkdownFilePanel.vue";
import type { PanelApi } from "../../src/workspace/registryComponents";

function mockApi(overrides: Partial<PanelApi> = {}): PanelApi {
  return {
    fetchPhase: vi.fn(),
    fetchGates: vi.fn(),
    fetchDeploymentConfig: vi.fn(),
    fetchResourceContext: vi.fn(),
    fetchTopology: vi.fn(),
    fetchOpsSummary: vi.fn(),
    listWorkspace: vi.fn().mockResolvedValue({
      entries: [{ path: "docs/PRD.md", name: "PRD.md", type: "file" }],
    }),
    readWorkspaceFile: vi.fn().mockResolvedValue({ content: "# PRD" }),
    writeWorkspaceFile: vi.fn(),
    deleteWorkspacePath: vi.fn(),
    ...overrides,
  };
}

describe("MarkdownFilePanel directory mode", () => {
  it("lists md files from docsDir and shows add-to-chat menu", async () => {
    const addToChat = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(MarkdownFilePanel, {
      props: { api: mockApi({ addToChat }), mode: "directory", docsDir: "docs" },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="markdown-file-item"]').exists()).toBe(true);
    await wrapper.find('[data-testid="markdown-file-item"]').trigger("contextmenu");
    await wrapper.vm.$nextTick();
    expect(document.querySelector('[data-testid="markdown-file-context-menu"]')).not.toBeNull();
    (document.querySelector('[data-testid="markdown-add-to-chat"]') as HTMLButtonElement).click();
    await flushPromises();
    expect(addToChat).toHaveBeenCalledWith({ path: "docs/PRD.md", label: "PRD.md" });
    wrapper.unmount();
  });
});

describe("MarkdownFilePanel file-list mode", () => {
  it("loads configured files and shows default template for missing file", async () => {
    const api = mockApi({
      readWorkspaceFile: vi.fn().mockRejectedValue(new Error("ENOENT: not found")),
    });
    const wrapper = mount(MarkdownFilePanel, {
      props: {
        api,
        mode: "file-list",
        files: [{ path: "AGENTS.md", label: "AGENTS.md" }],
        sidebarTitle: "Agent Rules",
      },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="rule-file-editor"]').exists()).toBe(true);
    expect((wrapper.find('[data-testid="rule-file-editor"]').element as HTMLTextAreaElement).value).toContain(
      "Project Agent Rules",
    );
  });

  it("adds new file via inline form", async () => {
    const api = mockApi({
      readWorkspaceFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
    });
    const wrapper = mount(MarkdownFilePanel, {
      props: { api, mode: "file-list", files: [{ path: "AGENTS.md", label: "AGENTS.md" }] },
    });
    await flushPromises();
    await wrapper.find('[data-testid="add-rule-file"]').trigger("click");
    await wrapper.find('[data-testid="new-rule-path"]').setValue("fe/GEMINI.md");
    await wrapper.find('[data-testid="confirm-add-rule"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("fe/GEMINI.md");
  });

  it("deletes file from workspace and removes from list", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const deleteWorkspacePath = vi.fn().mockResolvedValue(undefined);
    const persistRuleFiles = vi.fn().mockResolvedValue(undefined);
    const api = mockApi({
      deleteWorkspacePath,
      persistRuleFiles,
      readWorkspaceFile: vi.fn().mockResolvedValue({ content: "# Rules" }),
    });
    const wrapper = mount(MarkdownFilePanel, {
      props: {
        api,
        mode: "file-list",
        componentId: "rules",
        files: [
          { path: "AGENTS.md", label: "AGENTS.md" },
          { path: "CLAUDE.md", label: "CLAUDE.md" },
        ],
      },
    });
    await flushPromises();
    await wrapper.find('[data-testid="delete-rule-file"]').trigger("click");
    await flushPromises();
    expect(deleteWorkspacePath).toHaveBeenCalledWith("AGENTS.md");
    expect(persistRuleFiles).toHaveBeenCalledWith(
      [{ path: "CLAUDE.md", label: "CLAUDE.md" }],
      "rules",
    );
    expect(wrapper.text()).not.toContain("AGENTS.md");
    expect(wrapper.text()).toContain("CLAUDE.md");
    vi.unstubAllGlobals();
  });

  it("persists file list when adding a new rule file", async () => {
    const persistRuleFiles = vi.fn().mockResolvedValue(undefined);
    const api = mockApi({
      persistRuleFiles,
      readWorkspaceFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
    });
    const wrapper = mount(MarkdownFilePanel, {
      props: {
        api,
        mode: "file-list",
        componentId: "rules",
        files: [{ path: "AGENTS.md", label: "AGENTS.md" }],
      },
    });
    await flushPromises();
    await wrapper.find('[data-testid="add-rule-file"]').trigger("click");
    await wrapper.find('[data-testid="new-rule-path"]').setValue("fe/GEMINI.md");
    await wrapper.find('[data-testid="confirm-add-rule"]').trigger("click");
    await flushPromises();
    expect(persistRuleFiles).toHaveBeenCalledWith(
      [
        { path: "AGENTS.md", label: "AGENTS.md" },
        { path: "fe/GEMINI.md", label: "GEMINI.md" },
      ],
      "rules",
    );
  });
});

describe("MarkdownFilePanel live file sync", () => {
  it("reloads content when subscribed path matches selected file", async () => {
    const listeners = new Set<(path: string) => void>();
    const readWorkspaceFile = vi
      .fn()
      .mockResolvedValueOnce({ content: "# Old" })
      .mockResolvedValueOnce({ content: "# Updated by AI" });
    const api = mockApi({
      readWorkspaceFile,
      subscribeFileWrites: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    });
    const wrapper = mount(MarkdownFilePanel, {
      props: {
        api,
        mode: "file-list",
        files: [{ path: "AGENTS.md", label: "AGENTS.md" }],
      },
    });
    await flushPromises();
    expect(readWorkspaceFile).toHaveBeenCalledWith("AGENTS.md");
    const callsBefore = readWorkspaceFile.mock.calls.length;
    for (const fn of listeners) fn("AGENTS.md");
    await flushPromises();
    expect(readWorkspaceFile.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(wrapper.text()).toContain("Updated by AI");
  });

  it("shows dot for non-selected file and clears on select", async () => {
    const listeners = new Set<(path: string) => void>();
    const readWorkspaceFile = vi.fn().mockImplementation(async (path: string) => ({
      content: path === "AGENTS.md" ? "# A" : "# C",
    }));
    const api = mockApi({
      readWorkspaceFile,
      subscribeFileWrites: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    });
    const wrapper = mount(MarkdownFilePanel, {
      props: {
        api,
        mode: "file-list",
        files: [
          { path: "AGENTS.md", label: "AGENTS.md" },
          { path: "CLAUDE.md", label: "CLAUDE.md" },
        ],
      },
    });
    await flushPromises();
    const fileButtons = wrapper.findAll("aside .flex-1.overflow-y-auto button");
    expect(fileButtons).toHaveLength(2);
    await fileButtons[1]!.trigger("click");
    await flushPromises();
    for (const fn of listeners) fn("AGENTS.md");
    await flushPromises();
    expect(fileButtons[0]!.find('[data-testid="file-updated-dot"]').exists()).toBe(true);
    await fileButtons[0]!.trigger("click");
    await flushPromises();
    expect(fileButtons[0]!.find('[data-testid="file-updated-dot"]').exists()).toBe(false);
  });
});
