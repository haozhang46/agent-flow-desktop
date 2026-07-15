import fs from "node:fs/promises";
import path from "node:path";
import {
  WorkspaceFileSchema,
  type ResolvedRoot,
  type WorkspaceFile,
} from "./types";

function workspaceFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, "workspace.json");
}

function syntheticWorkspace(workspaceRoot: string): WorkspaceFile {
  const label = path.basename(workspaceRoot);
  return {
    version: 1,
    name: label,
    roots: [{ id: "main", path: ".", label }],
  };
}

function assertUniqueRootIds(roots: WorkspaceFile["roots"]): void {
  const seen = new Set<string>();
  for (const root of roots) {
    if (seen.has(root.id)) {
      throw new Error(`Duplicate root id: ${root.id}`);
    }
    seen.add(root.id);
  }
}

export async function loadWorkspace(workspaceRoot: string): Promise<WorkspaceFile> {
  const dest = workspaceFilePath(workspaceRoot);
  try {
    const raw = await fs.readFile(dest, "utf8");
    return WorkspaceFileSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return syntheticWorkspace(workspaceRoot);
    }
    throw err;
  }
}

export async function saveWorkspace(
  workspaceRoot: string,
  file: WorkspaceFile,
): Promise<void> {
  const validated = WorkspaceFileSchema.parse(file);
  assertUniqueRootIds(validated.roots);
  const dest = workspaceFilePath(workspaceRoot);
  await fs.writeFile(dest, JSON.stringify(validated, null, 2), "utf8");
}

export async function resolveRoots(
  workspaceRoot: string,
  file?: WorkspaceFile,
): Promise<ResolvedRoot[]> {
  const workspace = file ?? (await loadWorkspace(workspaceRoot));
  return workspace.roots.map((root) => ({
    id: root.id,
    path: root.path,
    label: root.label,
    absolutePath: path.resolve(workspaceRoot, root.path),
  }));
}

export async function ensureWorkspaceFile(
  workspaceRoot: string,
): Promise<WorkspaceFile> {
  const dest = workspaceFilePath(workspaceRoot);
  try {
    await fs.access(dest);
    return loadWorkspace(workspaceRoot);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const file = syntheticWorkspace(workspaceRoot);
      await saveWorkspace(workspaceRoot, file);
      return file;
    }
    throw err;
  }
}
