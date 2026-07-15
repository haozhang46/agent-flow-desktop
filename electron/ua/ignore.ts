import fs from "node:fs/promises";
import path from "node:path";
import { ignorePath, resolveUaDir } from "./paths";

export const DEFAULT_IGNORE_PATTERNS = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  ".agentflow/chatMemory/",
  "*.lock",
  "pnpm-lock.yaml",
] as const;

export function parseUnderstandIgnore(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, "/");
}

function matchesPattern(relPath: string, pattern: string): boolean {
  const normalized = normalizeRelPath(relPath);
  const negated = pattern.startsWith("!");
  const raw = negated ? pattern.slice(1) : pattern;

  if (raw.endsWith("/")) {
    const prefix = raw.slice(0, -1);
    return (
      normalized === prefix ||
      normalized.startsWith(`${prefix}/`)
    );
  }

  if (raw.startsWith("*.")) {
    const suffix = raw.slice(1);
    return normalized.endsWith(suffix);
  }

  return normalized === raw;
}

export function isIgnored(relPath: string, patterns: string[]): boolean {
  const normalized = normalizeRelPath(relPath);
  const allPatterns = [...DEFAULT_IGNORE_PATTERNS, ...patterns];
  let ignored = false;

  for (const pattern of allPatterns) {
    const negated = pattern.startsWith("!");
    const raw = negated ? pattern.slice(1) : pattern;
    if (matchesPattern(normalized, raw)) {
      ignored = !negated;
    }
  }

  return ignored;
}

export async function loadIgnorePatterns(projectRoot: string): Promise<string[]> {
  const uaDir = await resolveUaDir(projectRoot);
  const filePath = ignorePath(uaDir);

  try {
    const text = await fs.readFile(filePath, "utf-8");
    return parseUnderstandIgnore(text);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readIgnoreFileIfPresent(filePath: string): Promise<string[]> {
  try {
    const text = await fs.readFile(filePath, "utf-8");
    return parseUnderstandIgnore(text);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function loadIgnorePatternsForRoot(
  workspaceRoot: string,
  rootAbsPath: string,
): Promise<string[]> {
  const patterns = await loadIgnorePatterns(workspaceRoot);

  const rootUaIgnore = path.join(rootAbsPath, ".ua", ".understandignore");
  const rootIgnore = path.join(rootAbsPath, ".understandignore");

  const rootUaPatterns = await readIgnoreFileIfPresent(rootUaIgnore);
  const rootPatterns = await readIgnoreFileIfPresent(rootIgnore);

  return [...patterns, ...rootUaPatterns, ...rootPatterns];
}
