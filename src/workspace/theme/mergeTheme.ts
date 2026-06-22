import defaults from "../../../shared/tailwindDefaultTheme.json";
import type {
  ColorPalette,
  ColorScale,
  LegacyThemeTokens,
  MergedTheme,
  SemanticTokenDef,
  SpacingScale,
  ThemeOverrides,
} from "./types";

export const DEFAULT_THEME = defaults as MergedTheme;

export const COLOR_SHADES = [
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
] as const;

/** Semantic theme colors stored under `colors.brand` for UnoCSS `bg-brand-primary` etc. */
export const SEMANTIC_PALETTE = "brand";

export const SEMANTIC_TOKEN_DEFS: SemanticTokenDef[] = [
  { key: "primary", label: "主色" },
  { key: "primary-foreground", label: "主色前景" },
  { key: "secondary", label: "次要色" },
  { key: "secondary-foreground", label: "次要前景" },
  { key: "accent", label: "强调色" },
  { key: "accent-foreground", label: "强调前景" },
  { key: "background", label: "背景" },
  { key: "foreground", label: "前景文字" },
  { key: "muted", label: "弱化背景" },
  { key: "muted-foreground", label: "弱化文字" },
  { key: "border", label: "边框" },
  { key: "destructive", label: "危险" },
];

const LEGACY_KEYS = [
  "primary",
  "secondary",
  "accent",
  "spacingSm",
  "spacingMd",
  "spacingLg",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isColorPalette(value: unknown): value is ColorPalette {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function mergeColorScale(base: ColorScale, overlay?: ColorScale): ColorScale {
  if (!overlay) {
    return { ...base };
  }

  const merged: ColorScale = { ...base };

  for (const [name, value] of Object.entries(overlay)) {
    if (typeof value === "string") {
      merged[name] = value;
      continue;
    }

    const existing = merged[name];
    if (typeof existing === "string" || existing === undefined) {
      merged[name] = { ...value };
      continue;
    }

    merged[name] = { ...existing, ...value };
  }

  return merged;
}

function mergeSpacingScale(
  base: SpacingScale,
  overlay?: SpacingScale,
): SpacingScale {
  if (!overlay) {
    return { ...base };
  }

  return { ...base, ...overlay };
}

export function deepMergeTheme(
  base: MergedTheme,
  ...layers: Array<Partial<MergedTheme>>
): MergedTheme {
  let colors = { ...base.colors };
  let spacing = { ...base.spacing };

  for (const layer of layers) {
    colors = mergeColorScale(colors, layer.colors);
    spacing = mergeSpacingScale(spacing, layer.spacing);
  }

  return { colors, spacing };
}

function diffColorScale(
  merged: ColorScale,
  defaultsScale: ColorScale,
): ColorScale | undefined {
  const diff: ColorScale = {};

  for (const [name, mergedValue] of Object.entries(merged)) {
    const defaultValue = defaultsScale[name];

    if (typeof mergedValue === "string") {
      if (mergedValue !== defaultValue) {
        diff[name] = mergedValue;
      }
      continue;
    }

    if (typeof defaultValue === "string" || defaultValue === undefined) {
      diff[name] = { ...mergedValue };
      continue;
    }

    const paletteDiff: ColorPalette = {};
    for (const [shade, hex] of Object.entries(mergedValue)) {
      if (defaultValue[shade] !== hex) {
        paletteDiff[shade] = hex;
      }
    }

    if (Object.keys(paletteDiff).length > 0) {
      diff[name] = paletteDiff;
    }
  }

  return Object.keys(diff).length > 0 ? diff : undefined;
}

function diffSpacingScale(
  merged: SpacingScale,
  defaultsScale: SpacingScale,
): SpacingScale | undefined {
  const diff: SpacingScale = {};

  for (const [key, value] of Object.entries(merged)) {
    if (defaultsScale[key] !== value) {
      diff[key] = value;
    }
  }

  return Object.keys(diff).length > 0 ? diff : undefined;
}

export function diffOverrides(
  merged: MergedTheme,
  defaultTheme: MergedTheme = DEFAULT_THEME,
): ThemeOverrides {
  const colors = diffColorScale(merged.colors, defaultTheme.colors);
  const spacing = diffSpacingScale(merged.spacing, defaultTheme.spacing);

  const overrides: ThemeOverrides = { version: 1 };
  if (colors) {
    overrides.colors = colors;
  }
  if (spacing) {
    overrides.spacing = spacing;
  }

  return overrides;
}

function hasLegacyFlatKeys(raw: Record<string, unknown>): boolean {
  return LEGACY_KEYS.some((key) => typeof raw[key] === "string");
}

export function migrateLegacyTokens(raw: unknown): ThemeOverrides {
  if (!isRecord(raw)) {
    return { version: 1 };
  }

  if (raw.version === 1) {
    const overrides: ThemeOverrides = { version: 1 };
    if (isRecord(raw.colors)) {
      overrides.colors = raw.colors as ColorScale;
    }
    if (isRecord(raw.spacing)) {
      overrides.spacing = raw.spacing as SpacingScale;
    }
    return overrides;
  }

  if (!hasLegacyFlatKeys(raw)) {
    return { version: 1 };
  }

  const legacy = raw as LegacyThemeTokens & Record<string, unknown>;
  const overrides: ThemeOverrides = { version: 1 };
  const brand: ColorPalette = {};
  const spacing: SpacingScale = {};

  if (legacy.primary) {
    brand.primary = legacy.primary;
  }
  if (legacy.secondary) {
    brand.secondary = legacy.secondary;
  }
  if (legacy.accent) {
    brand.accent = legacy.accent;
  }
  if (legacy.spacingSm) {
    spacing["2"] = legacy.spacingSm;
  }
  if (legacy.spacingMd) {
    spacing["4"] = legacy.spacingMd;
  }
  if (legacy.spacingLg) {
    spacing["8"] = legacy.spacingLg;
  }

  if (Object.keys(brand).length > 0) {
    overrides.colors = { brand };
  }
  if (Object.keys(spacing).length > 0) {
    overrides.spacing = spacing;
  }

  return overrides;
}

export function isHuePalette(palette: ColorPalette): boolean {
  return "50" in palette && "500" in palette;
}

export function listColorPalettes(theme: MergedTheme): string[] {
  return Object.keys(theme.colors).filter((name) => {
    const value = theme.colors[name];
    return isColorPalette(value) && isHuePalette(value);
  });
}

export function getSemanticPalette(theme: MergedTheme): ColorPalette {
  const current = theme.colors[SEMANTIC_PALETTE];
  if (isColorPalette(current)) {
    return { ...current };
  }
  const def = DEFAULT_THEME.colors[SEMANTIC_PALETTE];
  return isColorPalette(def) ? { ...def } : {};
}

export function getDefaultSemanticPalette(): ColorPalette {
  const def = DEFAULT_THEME.colors[SEMANTIC_PALETTE];
  return isColorPalette(def) ? { ...def } : {};
}

export function sortSpacingKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    if (a === "0") {
      return -1;
    }
    if (b === "0") {
      return 1;
    }
    if (a === "px") {
      return b === "0" ? 1 : -1;
    }
    if (b === "px") {
      return a === "0" ? -1 : 1;
    }

    return parseFloat(a) - parseFloat(b);
  });
}
