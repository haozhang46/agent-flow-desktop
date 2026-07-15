import fs from "node:fs/promises";
import path from "node:path";
import { isIgnored, loadIgnorePatternsForRoot } from "./ignore";

export interface InventoryEntry {
  rootId: string;
  path: string;
  bytes: number;
}

const DEFAULT_MAX_FILES = 2000;

export type InventoryRootOptions = {
  workspaceRoot: string;
  rootId: string;
  absolutePath: string;
  maxFiles?: number;
};

export async function inventoryRoot(
  opts: InventoryRootOptions,
): Promise<InventoryEntry[]> {
  const { workspaceRoot, rootId, absolutePath, maxFiles = DEFAULT_MAX_FILES } =
    opts;
  const patterns = await loadIgnorePatternsForRoot(workspaceRoot, absolutePath);
  const entries: InventoryEntry[] = [];

  async function walk(dir: string): Promise<void> {
    if (entries.length >= maxFiles) {
      return;
    }

    const relDir = path.relative(absolutePath, dir);
    const relDirPosix =
      relDir === "" ? "" : relDir.split(path.sep).join("/");

    if (relDirPosix && isIgnored(relDirPosix, patterns)) {
      return;
    }

    const names = await fs.readdir(dir);
    names.sort();

    for (const name of names) {
      if (entries.length >= maxFiles) {
        return;
      }

      const absPath = path.join(dir, name);
      const relPath = path
        .relative(absolutePath, absPath)
        .split(path.sep)
        .join("/");

      if (isIgnored(relPath, patterns)) {
        continue;
      }

      const stat = await fs.stat(absPath);
      if (stat.isDirectory()) {
        await walk(absPath);
      } else if (stat.isFile()) {
        entries.push({ rootId, path: relPath, bytes: stat.size });
      }
    }
  }

  await walk(absolutePath);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

export async function inventoryProject(
  projectRoot: string,
  maxFiles = DEFAULT_MAX_FILES,
): Promise<InventoryEntry[]> {
  return inventoryRoot({
    workspaceRoot: projectRoot,
    rootId: "main",
    absolutePath: projectRoot,
    maxFiles,
  });
}
