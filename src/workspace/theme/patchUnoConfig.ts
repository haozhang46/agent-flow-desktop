import type { ColorScale, MergedTheme, SpacingScale } from "./types";

function quoteKey(key: string): string {
  if (/^[a-zA-Z_$][\w$]*$/.test(key)) {
    return key;
  }
  return JSON.stringify(key);
}

function serializeNestedObject(
  obj: Record<string, string>,
  indent: number,
): string {
  const pad = " ".repeat(indent);
  const innerPad = " ".repeat(indent + 2);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    lines.push(`${innerPad}${quoteKey(key)}: ${JSON.stringify(value)},`);
  }

  return `${pad}{\n${lines.join("\n")}\n${pad}}`;
}

function serializeColorScale(colors: ColorScale, indent: number): string {
  const pad = " ".repeat(indent);
  const innerPad = " ".repeat(indent + 2);
  const lines: string[] = [];

  for (const [name, value] of Object.entries(colors)) {
    if (typeof value === "string") {
      lines.push(`${innerPad}${quoteKey(name)}: ${JSON.stringify(value)},`);
      continue;
    }

    lines.push(
      `${innerPad}${quoteKey(name)}: ${serializeNestedObject(value, indent + 2)},`,
    );
  }

  return lines.join("\n");
}

function serializeSpacingScale(spacing: SpacingScale, indent: number): string {
  const pad = " ".repeat(indent);
  const innerPad = " ".repeat(indent + 2);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(spacing)) {
    lines.push(`${innerPad}${quoteKey(key)}: ${JSON.stringify(value)},`);
  }

  return lines.join("\n");
}

function buildThemeBlock(merged: MergedTheme): string {
  const colorsBody = serializeColorScale(merged.colors, 6);
  const spacingBody = serializeSpacingScale(merged.spacing, 6);

  return `  theme: {
    colors: {
${colorsBody}
    },
    spacing: {
${spacingBody}
    },
  },`;
}

function replaceThemeBlock(content: string, themeBlock: string): string {
  const match = /\btheme:\s*\{/.exec(content);
  if (!match) {
    return content;
  }

  const braceStart = content.indexOf("{", match.index);
  let depth = 0;
  let endIndex = -1;

  for (let i = braceStart; i < content.length; i++) {
    if (content[i] === "{") {
      depth++;
    } else if (content[i] === "}") {
      depth--;
      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
  }

  if (endIndex === -1) {
    return content;
  }

  let replaceEnd = endIndex + 1;
  const trailing = content.slice(replaceEnd).match(/^\s*,?/);
  if (trailing) {
    replaceEnd += trailing[0].length;
  }

  return content.slice(0, match.index) + themeBlock + content.slice(replaceEnd);
}

export function patchUnoConfig(content: string, merged: MergedTheme): string {
  const themeBlock = buildThemeBlock(merged);

  if (/\btheme:\s*\{/.test(content)) {
    return replaceThemeBlock(content, themeBlock);
  }

  return content.replace(/defineConfig\(\{/, `defineConfig({\n${themeBlock}`);
}
