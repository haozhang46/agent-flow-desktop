export type ColorPalette = Record<string, string>;

export type ColorScale = Record<string, ColorPalette | string>;

export type SpacingScale = Record<string, string>;

export type MergedTheme = {
  colors: ColorScale;
  spacing: SpacingScale;
};

export type ThemeVersion = 1;

export type ThemeOverrides = {
  version: ThemeVersion;
  colors?: ColorScale;
  spacing?: SpacingScale;
};

export type LegacyThemeTokens = {
  primary?: string;
  secondary?: string;
  accent?: string;
  spacingSm?: string;
  spacingMd?: string;
  spacingLg?: string;
};

export type SemanticTokenDef = {
  key: string;
  label: string;
};
