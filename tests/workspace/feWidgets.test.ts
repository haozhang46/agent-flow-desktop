// @vitest-environment happy-dom
import { mount, flushPromises } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FeArchitecturePlanWidget from "../../src/workspace/widgets/FeArchitecturePlanWidget.vue";
import BeArchitecturePlanWidget from "../../src/workspace/widgets/BeArchitecturePlanWidget.vue";
import SchemaMigrationsWidget from "../../src/workspace/widgets/SchemaMigrationsWidget.vue";
import AgentRulesEditorWidget from "../../src/workspace/widgets/AgentRulesEditorWidget.vue";
import StyleTokensEditorWidget from "../../src/workspace/widgets/StyleTokensEditorWidget.vue";
import LangflowPanelWidget from "../../src/workspace/widgets/LangflowPanelWidget.vue";
import type { PanelApi } from "../../src/workspace/registryComponents";

function mockApi(overrides: Partial<PanelApi> = {}): PanelApi {
  return {
    fetchPhase: vi.fn(),
    fetchGates: vi.fn(),
    fetchDeploymentConfig: vi.fn(),
    fetchResourceContext: vi.fn(),
    fetchTopology: vi.fn(),
    listWorkspace: vi.fn(),
    readWorkspaceFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
    writeWorkspaceFile: vi.fn().mockResolvedValue(undefined),
    deleteWorkspacePath: vi.fn(),
    ...overrides,
  };
}

describe("FeArchitecturePlanWidget", () => {
  it("renders layer checklist and editor for new output file", async () => {
    const wrapper = mount(FeArchitecturePlanWidget, {
      props: {
        api: mockApi(),
        output: "docs/fe-architecture.md",
        layers: ["pages", "components"],
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("pages");
    expect(wrapper.text()).toContain("components");
    expect(wrapper.find('[data-testid="fe-arch-editor"]').exists()).toBe(true);
  });

  it("loads existing output file", async () => {
    const api = mockApi({
      readWorkspaceFile: vi.fn().mockResolvedValue({
        path: "docs/fe-architecture.md",
        content: "# Plan\n\n## Layers\n\n- [x] **pages**\n",
      }),
    });
    const wrapper = mount(FeArchitecturePlanWidget, {
      props: { api, output: "docs/fe-architecture.md", layers: ["pages"] },
    });
    await flushPromises();

    expect(api.readWorkspaceFile).toHaveBeenCalledWith("docs/fe-architecture.md");
    expect(wrapper.text()).toContain("Plan");
  });
});

describe("AgentRulesEditorWidget", () => {
  it("lists default rule files and opens editor for missing file", async () => {
    const api = mockApi({
      readWorkspaceFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
    });
    const wrapper = mount(AgentRulesEditorWidget, {
      props: { api, editable: true },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("AGENTS.md");
    expect(wrapper.text()).toContain("CLAUDE.md");
    expect(wrapper.find('[data-testid="rule-file-editor"]').exists()).toBe(true);
  });

  it("loads existing rule file", async () => {
    const api = mockApi({
      readWorkspaceFile: vi.fn().mockResolvedValue({
        path: "AGENTS.md",
        content: "# Project Agent Rules\n",
      }),
    });
    const wrapper = mount(AgentRulesEditorWidget, {
      props: {
        api,
        files: [{ path: "AGENTS.md", label: "AGENTS.md" }],
      },
    });
    await flushPromises();

    expect(api.readWorkspaceFile).toHaveBeenCalledWith("AGENTS.md");
    expect(wrapper.text()).toContain("Project Agent Rules");
  });

  it("adds a new rule file and saves", async () => {
    const writeWorkspaceFile = vi.fn().mockResolvedValue(undefined);
    const api = mockApi({
      readWorkspaceFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
      writeWorkspaceFile,
    });
    const wrapper = mount(AgentRulesEditorWidget, {
      props: {
        api,
        files: [{ path: "AGENTS.md", label: "AGENTS.md" }],
        editable: true,
      },
    });
    await flushPromises();

    await wrapper.find('[data-testid="add-rule-file"]').trigger("click");
    await wrapper.find('[data-testid="new-rule-path"]').setValue("GEMINI.md");
    await wrapper.find('[data-testid="confirm-add-rule"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("GEMINI.md");
    await wrapper.find('[data-testid="save-rule-file"]').trigger("click");
    await flushPromises();

    expect(writeWorkspaceFile).toHaveBeenCalledWith("GEMINI.md", expect.stringContaining("GEMINI"));
  });

  it("deletes rule file from workspace and list", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const deleteWorkspacePath = vi.fn().mockResolvedValue(undefined);
    const persistRuleFiles = vi.fn().mockResolvedValue(undefined);
    const api = mockApi({
      readWorkspaceFile: vi.fn().mockResolvedValue({
        path: "AGENTS.md",
        content: "# Project Agent Rules\n",
      }),
      deleteWorkspacePath,
      persistRuleFiles,
    });
    const wrapper = mount(AgentRulesEditorWidget, {
      props: {
        api,
        componentId: "rules",
        files: [
          { path: "AGENTS.md", label: "AGENTS.md" },
          { path: "CLAUDE.md", label: "CLAUDE.md" },
        ],
        editable: true,
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
});

describe("StyleTokensEditorWidget", () => {
  function mountThemeEditor(apiOverrides: Partial<PanelApi> = {}) {
    return mount(StyleTokensEditorWidget, {
      props: {
        api: mockApi(apiOverrides),
        preset: "unocss",
        target: "uno.config.ts",
      },
    });
  }

  it("loads bundled defaults when theme file is missing", async () => {
    const wrapper = mountThemeEditor();
    await flushPromises();

    expect(wrapper.text()).toContain("Theme Scale");
    expect(wrapper.find('[data-testid="theme-tab-semantic"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="theme-tab-colors"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="theme-tab-spacing"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="semantic-primary"]').exists()).toBe(true);
    await wrapper.find('[data-testid="theme-tab-colors"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="palette-blue"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="shade-500"]').exists()).toBe(true);
  });

  it("shows semantic theme tokens on 主题色 tab", async () => {
    const wrapper = mountThemeEditor();
    await flushPromises();

    expect(wrapper.find('[data-testid="semantic-primary"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="semantic-secondary"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="semantic-background"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="palette-brand"]').exists()).toBe(false);
  });

  it("shows palette list on 色板 tab", async () => {
    const wrapper = mountThemeEditor();
    await flushPromises();

    await wrapper.find('[data-testid="theme-tab-colors"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="palette-blue"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="palette-slate"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="palette-red"]').exists()).toBe(true);
  });

  it("shows spacing keys on Spacing tab", async () => {
    const wrapper = mountThemeEditor();
    await flushPromises();

    await wrapper.find('[data-testid="theme-tab-spacing"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="spacing-row-0"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="spacing-row-4"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="spacing-row-8"]').exists()).toBe(true);
  });

  it("migrates legacy flat JSON on load", async () => {
    const api = mockApi({
      readWorkspaceFile: vi.fn().mockResolvedValue({
        path: ".agentflow/theme-tokens.json",
        content: JSON.stringify({ primary: "#111111" }),
      }),
    });
    const wrapper = mount(StyleTokensEditorWidget, {
      props: {
        api,
        preset: "unocss",
        target: "uno.config.ts",
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="semantic-primary"]').exists()).toBe(true);
    const primaryRow = wrapper.find('[data-testid="semantic-primary"]');
    expect(primaryRow.find('input[type="text"]').element.value).toBe("#111111");
  });

  it("saves version 1 override sidecar after editing blue-500", async () => {
    const writeWorkspaceFile = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountThemeEditor({ writeWorkspaceFile });
    await flushPromises();

    await wrapper.find('[data-testid="theme-tab-colors"]').trigger("click");
    await flushPromises();

    const shade500 = wrapper.find('[data-testid="shade-500"]');
    const textInput = shade500.find('input[type="text"]');
    await textInput.setValue("#aabbcc");
    await textInput.trigger("change");
    await flushPromises();

    await wrapper.find('[data-testid="save-tokens"]').trigger("click");
    await flushPromises();

    expect(writeWorkspaceFile).toHaveBeenCalled();
    const [path, body] = writeWorkspaceFile.mock.calls[0];
    expect(path).toBe(".agentflow/theme-tokens.json");

    const saved = JSON.parse(body as string);
    expect(saved).toEqual({
      version: 1,
      colors: { blue: { "500": "#aabbcc" } },
    });
    expect(saved).not.toHaveProperty("primary");
  });

  it("persists migrated legacy tokens as version 1 sidecar on save", async () => {
    const writeWorkspaceFile = vi.fn().mockResolvedValue(undefined);
    const api = mockApi({
      readWorkspaceFile: vi.fn().mockResolvedValue({
        path: ".agentflow/theme-tokens.json",
        content: JSON.stringify({ primary: "#111111" }),
      }),
      writeWorkspaceFile,
    });
    const wrapper = mount(StyleTokensEditorWidget, {
      props: {
        api,
        preset: "unocss",
        target: "uno.config.ts",
      },
    });
    await flushPromises();

    await wrapper.find('[data-testid="save-tokens"]').trigger("click");
    await flushPromises();

    expect(writeWorkspaceFile).toHaveBeenCalled();
    const [, body] = writeWorkspaceFile.mock.calls[0];
    const saved = JSON.parse(body as string);
    expect(saved).toEqual({
      version: 1,
      colors: { brand: { primary: "#111111" } },
    });
    expect(saved).not.toHaveProperty("primary");
  });
});

describe("BeArchitecturePlanWidget", () => {
  it("renders backend layer checklist", async () => {
    const wrapper = mount(BeArchitecturePlanWidget, {
      props: {
        api: mockApi(),
        output: "docs/be-architecture.md",
        layers: ["api/routes", "rag"],
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("api/routes");
    expect(wrapper.find('[data-testid="be-arch-editor"]').exists()).toBe(true);
  });

  it("adds a custom layer and persists to workspace", async () => {
    const writeWorkspaceFile = vi.fn().mockResolvedValue(undefined);
    const persistArchitectureLayers = vi.fn().mockResolvedValue(undefined);
    const api = mockApi({
      readWorkspaceFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
      writeWorkspaceFile,
      persistArchitectureLayers,
    });
    const wrapper = mount(BeArchitecturePlanWidget, {
      props: {
        api,
        componentId: "arch",
        output: "docs/be-architecture.md",
        layers: ["api/routes"],
      },
    });
    await flushPromises();

    await wrapper.find('[data-testid="add-arch-layer"]').trigger("click");
    await wrapper.find('[data-testid="new-layer-name"]').setValue("integrations/pfm");
    await wrapper.find('[data-testid="confirm-add-layer"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("integrations/pfm");
    expect(persistArchitectureLayers).toHaveBeenCalledWith(
      ["api/routes", "integrations/pfm"],
      "arch",
      "be-architecture-plan",
    );
  });
});

describe("SchemaMigrationsWidget", () => {
  it("lists sql migrations and shows summary", async () => {
    const api = mockApi({
      listWorkspace: vi.fn().mockResolvedValue({
        entries: [{ path: "backend/migrations/001.sql", name: "001.sql", type: "file" }],
        exists: true,
      }),
      readWorkspaceFile: vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith(".sql")) {
          return {
            path,
            content: "CREATE TABLE users (id UUID PRIMARY KEY);",
          };
        }
        throw new Error("ENOENT");
      }),
    });
    const wrapper = mount(SchemaMigrationsWidget, {
      props: {
        api,
        migrationsDir: "backend/migrations",
        output: "docs/be-schema.md",
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("001.sql");
    expect(wrapper.find('[data-testid="schema-summary"]').exists()).toBe(true);
  });

  it("shows message when migrations directory is missing", async () => {
    const api = mockApi({
      listWorkspace: vi.fn().mockResolvedValue({ entries: [], exists: false }),
    });
    const wrapper = mount(SchemaMigrationsWidget, {
      props: {
        api,
        migrationsDir: "backend/migrations",
        output: "docs/be-schema.md",
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Directory not found");
    expect(wrapper.text()).toContain("backend/migrations");
  });
});

describe("LangflowPanelWidget", () => {
  beforeEach(() => {
    window.desktop = {
      getSidecarPort: vi.fn().mockResolvedValue(8765),
    } as unknown as typeof window.desktop;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, baseUrl: "http://127.0.0.1:7860", mode: "external" }),
      }),
    );
  });

  it("shows message when flowId is missing", async () => {
    const wrapper = mount(LangflowPanelWidget, {
      props: { api: mockApi(), flowId: "", mode: "run" },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="langflow-missing-flow"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("No Langflow flow configured");
  });

  it("embeds webview when flowId is set", async () => {
    const wrapper = mount(LangflowPanelWidget, {
      props: { api: mockApi(), flowId: "flow-abc", mode: "run" },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="langflow-webview"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("flow-abc");
  });
});
