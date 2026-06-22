import type { ColorScale, MergedTheme, SpacingScale } from "./types";

type ParsedValue = string | Record<string, ParsedValue>;

function extractBalancedBlock(
  content: string,
  openBraceIndex: number,
): string | null {
  if (content[openBraceIndex] !== "{") {
    return null;
  }

  let depth = 0;
  for (let i = openBraceIndex; i < content.length; i++) {
    const ch = content[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return content.slice(openBraceIndex + 1, i);
      }
    }
  }

  return null;
}

function findSectionBlock(block: string, key: string): string | null {
  const re = new RegExp(`\\b${key}:\\s*\\{`);
  const match = re.exec(block);
  if (!match) {
    return null;
  }

  const braceIndex = block.indexOf("{", match.index);
  return extractBalancedBlock(block, braceIndex);
}

function parseStringLiteral(source: string, start: number): { value: string; end: number } | null {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") {
    return null;
  }

  let value = "";
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i++;
      if (i < source.length) {
        value += source[i];
        i++;
      }
      continue;
    }
    if (ch === quote) {
      return { value, end: i + 1 };
    }
    value += ch;
    i++;
  }

  return null;
}

function parseKey(source: string, start: number): { value: string; end: number } | null {
  let i = start;
  while (i < source.length && /\s/.test(source[i])) {
    i++;
  }

  if (source[i] === '"' || source[i] === "'") {
    const parsed = parseStringLiteral(source, i);
    return parsed ? { value: parsed.value, end: parsed.end } : null;
  }

  const match = /^[a-zA-Z_$][\w$.-]*/.exec(source.slice(i));
  if (!match) {
    return null;
  }

  return { value: match[0], end: i + match[0].length };
}

function parseValue(source: string, start: number): { value: ParsedValue; end: number } | null {
  let i = start;
  while (i < source.length && /\s/.test(source[i])) {
    i++;
  }

  if (source[i] === "{") {
    const inner = extractBalancedBlock(source, i);
    if (inner === null) {
      return null;
    }

    const obj = parseObjectLiteral(inner);
    if (obj === null) {
      return null;
    }

    const end = source.indexOf("}", i) + 1;
    return { value: obj, end };
  }

  if (source[i] === '"' || source[i] === "'") {
    const parsed = parseStringLiteral(source, i);
    return parsed ? { value: parsed.value, end: parsed.end } : null;
  }

  return null;
}

function parseObjectLiteral(source: string): Record<string, ParsedValue> | null {
  const result: Record<string, ParsedValue> = {};
  let i = 0;

  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i])) {
      i++;
    }
    if (i >= source.length) {
      break;
    }
    if (source[i] === "}") {
      break;
    }

    const key = parseKey(source, i);
    if (!key) {
      return null;
    }
    i = key.end;

    while (i < source.length && /\s/.test(source[i])) {
      i++;
    }
    if (source[i] !== ":") {
      return null;
    }
    i++;

    const value = parseValue(source, i);
    if (!value) {
      return null;
    }
    result[key.value] = value.value;
    i = value.end;

    while (i < source.length && /\s/.test(source[i])) {
      i++;
    }
    if (source[i] === ",") {
      i++;
      continue;
    }
    if (source[i] === "}" || i >= source.length) {
      break;
    }
  }

  return result;
}

function toColorScale(obj: Record<string, ParsedValue>): ColorScale {
  const result: ColorScale = {};

  for (const [name, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[name] = value;
      continue;
    }

    const palette: Record<string, string> = {};
    for (const [shade, hex] of Object.entries(value)) {
      if (typeof hex === "string") {
        palette[shade] = hex;
      }
    }

    if (Object.keys(palette).length > 0) {
      result[name] = palette;
    }
  }

  return result;
}

function toSpacingScale(obj: Record<string, ParsedValue>): SpacingScale {
  const result: SpacingScale = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }

  return result;
}

export function parseUnoTheme(content: string): Partial<MergedTheme> {
  try {
    const themeMatch = /\btheme:\s*\{/.exec(content);
    if (!themeMatch) {
      return {};
    }

    const themeBraceIndex = content.indexOf("{", themeMatch.index);
    const themeInner = extractBalancedBlock(content, themeBraceIndex);
    if (themeInner === null) {
      return {};
    }

    const result: Partial<MergedTheme> = {};
    const colorsInner = findSectionBlock(themeInner, "colors");
    if (colorsInner !== null) {
      const parsed = parseObjectLiteral(colorsInner);
      if (parsed && Object.keys(parsed).length > 0) {
        result.colors = toColorScale(parsed);
      }
    }

    const spacingInner = findSectionBlock(themeInner, "spacing");
    if (spacingInner !== null) {
      const parsed = parseObjectLiteral(spacingInner);
      if (parsed && Object.keys(parsed).length > 0) {
        result.spacing = toSpacingScale(parsed);
      }
    }

    return result;
  } catch {
    return {};
  }
}
