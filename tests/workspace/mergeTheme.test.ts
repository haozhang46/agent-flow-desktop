import { describe, it, expect } from "vitest";
import {
  COLOR_SHADES,
  DEFAULT_THEME,
  deepMergeTheme,
  diffOverrides,
  listColorPalettes,
  migrateLegacyTokens,
  sortSpacingKeys,
} from "../../src/workspace/theme/mergeTheme";

describe("DEFAULT_THEME", () => {
  it("loads bundled Tailwind defaults", () => {
    expect(DEFAULT_THEME.colors.blue?.["500"]).toBe("#3b82f6");
    expect(DEFAULT_THEME.spacing["4"]).toBe("1rem");
    expect(listColorPalettes(DEFAULT_THEME)).toContain("blue");
    expect(listColorPalettes(DEFAULT_THEME)).toHaveLength(22);
    expect(DEFAULT_THEME.colors.brand?.primary).toBe("#2563eb");
  });

  it("excludes semantic brand palette from hue list", () => {
    const theme = deepMergeTheme(DEFAULT_THEME, {
      colors: { brand: { primary: "#111111" } },
    });
    expect(listColorPalettes(theme)).not.toContain("brand");
    expect(listColorPalettes(theme)).toHaveLength(22);
  });

  it("exports full shade scale", () => {
    expect(COLOR_SHADES).toEqual([
      "50",
      "100",
      "200",
      "300",
      "400",
      "500",
      "600",
      "700",
      "800",
      "900",
      "950",
    ]);
    for (const shade of COLOR_SHADES) {
      expect(DEFAULT_THEME.colors.slate?.[shade]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("deepMergeTheme", () => {
  it("merges nested color palettes and flat spacing keys", () => {
    const merged = deepMergeTheme(DEFAULT_THEME, {
      colors: {
        blue: { "500": "#111111", "600": "#222222" },
        brand: { primary: "#2563eb" },
      },
      spacing: {
        "4": "1.25rem",
        "8": "2.5rem",
      },
    });

    expect(merged.colors.blue).toEqual({
      ...DEFAULT_THEME.colors.blue,
      "500": "#111111",
      "600": "#222222",
    });
    expect(merged.colors.brand).toEqual(DEFAULT_THEME.colors.brand);
    expect(merged.spacing["4"]).toBe("1.25rem");
    expect(merged.spacing["8"]).toBe("2.5rem");
    expect(merged.spacing["2"]).toBe(DEFAULT_THEME.spacing["2"]);
  });

  it("layers overrides in order", () => {
    const merged = deepMergeTheme(
      DEFAULT_THEME,
      { colors: { blue: { "500": "#aaaaaa" } } },
      { colors: { blue: { "600": "#bbbbbb" } }, spacing: { px: "2px" } },
    );

    expect(merged.colors.blue?.["500"]).toBe("#aaaaaa");
    expect(merged.colors.blue?.["600"]).toBe("#bbbbbb");
    expect(merged.spacing.px).toBe("2px");
  });
});

describe("diffOverrides", () => {
  it("returns only values that differ from defaults", () => {
    const merged = deepMergeTheme(DEFAULT_THEME, {
      colors: { blue: { "500": "#111111" } },
      spacing: { "4": "1.25rem" },
    });

    expect(diffOverrides(merged)).toEqual({
      version: 1,
      colors: { blue: { "500": "#111111" } },
      spacing: { "4": "1.25rem" },
    });
  });

  it("omits unchanged palettes and spacing keys", () => {
    expect(diffOverrides(DEFAULT_THEME)).toEqual({ version: 1 });
  });

  it("keeps partial palette diffs", () => {
    const merged = deepMergeTheme(DEFAULT_THEME, {
      colors: {
        blue: { "500": DEFAULT_THEME.colors.blue?.["500"] },
        red: { "500": "#ff0000" },
      },
    });

    expect(diffOverrides(merged)).toEqual({
      version: 1,
      colors: { red: { "500": "#ff0000" } },
    });
  });
});

describe("migrateLegacyTokens", () => {
  it("maps flat legacy keys to v1 overrides", () => {
    expect(
      migrateLegacyTokens({
        primary: "#2563eb",
        secondary: "#64748b",
        accent: "#7c3aed",
        spacingSm: "0.5rem",
        spacingMd: "1rem",
        spacingLg: "2rem",
      }),
    ).toEqual({
      version: 1,
      colors: {
        brand: {
          primary: "#2563eb",
          secondary: "#64748b",
          accent: "#7c3aed",
        },
      },
      spacing: {
        "2": "0.5rem",
        "4": "1rem",
        "8": "2rem",
      },
    });
  });

  it("passes through version 1 overrides", () => {
    const input = {
      version: 1 as const,
      colors: { blue: { "500": "#3b82f6" } },
      spacing: { "4": "1rem" },
    };
    expect(migrateLegacyTokens(input)).toEqual(input);
  });

  it("returns empty v1 object for unknown input", () => {
    expect(migrateLegacyTokens(null)).toEqual({ version: 1 });
    expect(migrateLegacyTokens({ foo: "bar" })).toEqual({ version: 1 });
  });
});

describe("sortSpacingKeys", () => {
  it("orders 0, px, then numeric ascending", () => {
    const keys = ["16", "px", "0.5", "4", "0", "1", "96", "2"];
    expect(sortSpacingKeys(keys)).toEqual([
      "0",
      "px",
      "0.5",
      "1",
      "2",
      "4",
      "16",
      "96",
    ]);
  });
});

describe("listColorPalettes", () => {
  it("lists palette names with shade maps", () => {
    const palettes = listColorPalettes(DEFAULT_THEME);
    expect(palettes).toContain("slate");
    expect(palettes).toContain("rose");
    expect(palettes).not.toContain("inherit");
  });
});
