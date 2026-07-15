// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "../../src/pages/Settings.vue";
import { THEME_STORAGE_KEY } from "../../src/composables/useTheme";

vi.mock("../../src/composables/useWorkflow", () => ({
  useWorkflow: () => ({
    fetchOpsConfig: vi.fn().mockResolvedValue(null),
  }),
}));

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  window.desktop = {
    getApiKeyStatus: vi.fn().mockResolvedValue(""),
    getResourceServerUrl: vi.fn().mockResolvedValue(""),
    getWorkspace: vi.fn().mockResolvedValue(""),
    getLangflowBaseUrl: vi.fn().mockResolvedValue(""),
    getLangflowApiKeyStatus: vi.fn().mockResolvedValue(""),
    getLangflowAutoStart: vi.fn().mockResolvedValue(true),
    getAgentRecursionLimit: vi.fn().mockResolvedValue({ unlimited: true, limit: null }),
    setApiKey: vi.fn(),
    clearApiKey: vi.fn(),
    setResourceServerUrl: vi.fn(),
    setLangflow: vi.fn(),
    setLangflowAutoStart: vi.fn(),
    setAgentRecursionLimit: vi.fn(),
  } as unknown as Window["desktop"];
});

describe("Settings Appearance", () => {
  it("switches to light and persists", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    document.documentElement.classList.add("dark");

    const wrapper = mount(SettingsPage);
    await wrapper.get('[data-testid="theme-light"]').trigger("click");

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("switches to dark and persists", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    const wrapper = mount(SettingsPage);
    await wrapper.get('[data-testid="theme-dark"]').trigger("click");

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
