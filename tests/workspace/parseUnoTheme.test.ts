import { describe, it, expect } from "vitest";
import { parseUnoTheme } from "../../src/workspace/theme/parseUnoTheme";

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

describe("parseUnoTheme", () => {
  it("extracts nested brand colors from fe-style uno.config", () => {
    expect(parseUnoTheme(SAMPLE_UNO_CONFIG)).toEqual({
      colors: {
        brand: {
          primary: "#2563eb",
          secondary: "#64748b",
        },
      },
    });
  });

  it("extracts spacing scale when present", () => {
    const content = `export default defineConfig({
  theme: {
    colors: {
      blue: { "500": "#3b82f6" },
    },
    spacing: {
      "4": "1.25rem",
      px: "1px",
    },
  },
});`;

    expect(parseUnoTheme(content)).toEqual({
      colors: {
        blue: { "500": "#3b82f6" },
      },
      spacing: {
        "4": "1.25rem",
        px: "1px",
      },
    });
  });

  it("returns empty object when theme block is missing", () => {
    expect(parseUnoTheme("export default defineConfig({ presets: [] });")).toEqual(
      {},
    );
  });

  it("returns empty object on malformed content", () => {
    expect(parseUnoTheme("not valid {{ config")).toEqual({});
  });

  it("handles flat color values", () => {
    const content = `export default defineConfig({
  theme: {
    colors: {
      inherit: "inherit",
      current: "currentColor",
    },
  },
});`;

    expect(parseUnoTheme(content)).toEqual({
      colors: {
        inherit: "inherit",
        current: "currentColor",
      },
    });
  });
});
