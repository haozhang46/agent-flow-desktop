import { describe, it, expect } from "vitest";
import { patchUnoConfig } from "../../src/workspace/theme/patchUnoConfig";
import { parseUnoTheme } from "../../src/workspace/theme/parseUnoTheme";
import type { MergedTheme } from "../../src/workspace/theme/types";

const SAMPLE_UNO_CONFIG = `import { defineConfig, presetUno, presetAttributify } from "unocss";

export default defineConfig({
  presets: [presetUno(), presetAttributify()],
  shortcuts: {
    "btn-primary": "bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50",
    "card": "bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700",
    "input-field": "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500",
  },
  theme: {
    colors: {
      brand: { primary: "#2563eb", secondary: "#64748b" },
    },
  },
});
`;

const MERGED_THEME: MergedTheme = {
  colors: {
    brand: {
      primary: "#111111",
      secondary: "#222222",
      accent: "#333333",
    },
    blue: {
      "500": "#3b82f6",
    },
  },
  spacing: {
    "4": "1.25rem",
    px: "1px",
  },
};

describe("patchUnoConfig", () => {
  it("updates theme without removing shortcuts or presets", () => {
    const patched = patchUnoConfig(SAMPLE_UNO_CONFIG, MERGED_THEME);

    expect(patched).toContain('import { defineConfig, presetUno, presetAttributify } from "unocss";');
    expect(patched).toContain("presets: [presetUno(), presetAttributify()]");
    expect(patched).toContain('"btn-primary":');
    expect(patched).toContain('"card":');
    expect(patched).toContain('"input-field":');
    expect(patched).toContain('primary: "#111111"');
    expect(patched).toContain('secondary: "#222222"');
    expect(patched).toContain('accent: "#333333"');
    expect(patched).toContain('"500": "#3b82f6"');
    expect(patched).toContain('"4": "1.25rem"');
    expect(patched).toContain('px: "1px"');
  });

  it("round-trips patched theme through parseUnoTheme", () => {
    const patched = patchUnoConfig(SAMPLE_UNO_CONFIG, MERGED_THEME);
    expect(parseUnoTheme(patched)).toEqual(MERGED_THEME);
  });

  it("inserts theme block when missing", () => {
    const content = `import { defineConfig, presetUno } from "unocss";

export default defineConfig({
  presets: [presetUno()],
  shortcuts: {
    card: "p-4",
  },
});`;

    const patched = patchUnoConfig(content, MERGED_THEME);

    expect(patched).toContain("theme: {");
    expect(patched).toContain("presets: [presetUno()]");
    expect(patched).toContain('card: "p-4"');
    expect(parseUnoTheme(patched)).toEqual(MERGED_THEME);
  });

  it("quotes spacing keys that need quoting", () => {
    const patched = patchUnoConfig(SAMPLE_UNO_CONFIG, MERGED_THEME);
    expect(patched).toContain('"4": "1.25rem"');
  });
});
