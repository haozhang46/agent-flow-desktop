import fs from "node:fs/promises";
import path from "node:path";
import { isIgnored, loadIgnorePatterns } from "./ignore";

export interface InventoryEntry {
  path: string;
  bytes: number;
}

const DEFAULT_MAX_FILES = 2000;

export async function inventoryProject(
  projectRoot: string,
  maxFiles = DEFAULT_MAX_FILES,
): Promise<InventoryEntry[]> {
  const patterns = await loadIgnorePatterns(projectRoot);
  const entries: InventoryEntry[] = [];

  async function walk(dir: string): Promise<void> {
    if (entries.length >= maxFiles) {
      return;
    }

    const relDir = path.relative(projectRoot, dir);
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
      const relPath = path.relative(projectRoot, absPath).split(path.sep).join("/");

      if (isIgnored(relPath, patterns)) {
        continue;
      }

      const stat = await fs.stat(absPath);
      if (stat.isDirectory()) {
        await walk(absPath);
      } else if (stat.isFile()) {
        entries.push({ path: relPath, bytes: stat.size });
      }
    }
  }

  await walk(projectRoot);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}
