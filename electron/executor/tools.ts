import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function resolveWorkspacePath(workspaceRoot: string, relPath: string): string {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(root, relPath || ".");
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error("path escapes workspace");
  }
  return target;
}

export async function readFileTool(workspaceRoot: string, relPath: string): Promise<string> {
  const target = resolveWorkspacePath(workspaceRoot, relPath);
  return fs.readFile(target, "utf8");
}

export interface WorkspaceEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

export async function listDirTool(workspaceRoot: string, relPath: string): Promise<string> {
  const entries = await listDirEntries(workspaceRoot, relPath);
  return entries
    .map((e) => `${e.type === "directory" ? "d" : "f"}\t${e.name}`)
    .join("\n");
}

export async function listDirEntries(
  workspaceRoot: string,
  relPath: string,
): Promise<WorkspaceEntry[]> {
  const target = resolveWorkspacePath(workspaceRoot, relPath || ".");
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(target, { withFileTypes: true });
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return [];
    }
    throw err;
  }
  const base = relPath ? relPath.replace(/\/$/, "") : "";
  return entries
    .filter((e) => !e.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    })
    .map((e) => ({
      name: e.name,
      path: base ? `${base}/${e.name}` : e.name,
      type: e.isDirectory() ? "directory" : "file",
    }));
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".agentflow",
  "dist",
  ".output",
  "__pycache__",
  ".venv",
  "out",
]);

export async function listFilesRecursive(
  workspaceRoot: string,
  relPath: string,
  maxFiles = 500,
): Promise<WorkspaceEntry[]> {
  const results: WorkspaceEntry[] = [];
  const queue = [relPath.replace(/\/$/, "") || "."];

  while (queue.length > 0 && results.length < maxFiles) {
    const current = queue.shift()!;
    let entries: WorkspaceEntry[];
    try {
      entries = await listDirEntries(workspaceRoot, current === "." ? "" : current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.type === "directory") {
        if (!SKIP_DIRS.has(entry.name)) {
          queue.push(entry.path);
        }
      } else {
        results.push(entry);
        if (results.length >= maxFiles) break;
      }
    }
  }

  return results;
}

export async function writeFileTool(
  workspaceRoot: string,
  relPath: string,
  content: string,
): Promise<void> {
  const target = resolveWorkspacePath(workspaceRoot, relPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

export async function deleteFileTool(workspaceRoot: string, relPath: string): Promise<void> {
  const target = resolveWorkspacePath(workspaceRoot, relPath);
  const stat = await fs.stat(target);
  if (stat.isDirectory()) {
    await fs.rm(target, { recursive: true, force: true });
  } else {
    await fs.unlink(target);
  }
}

export async function gitStatus(workspaceRoot: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd: workspaceRoot });
  return stdout || "(clean)";
}

export async function gitDiff(workspaceRoot: string, relPath: string): Promise<string> {
  const args = relPath ? ["diff", "--", relPath] : ["diff"];
  const { stdout } = await execFileAsync("git", args, { cwd: workspaceRoot });
  return stdout || "(no diff)";
}

const DANGEROUS = [/rm\s+-rf/i, /git\s+push\s+.*--force/i, /chmod\s+/i];

export function needsConfirm(command: string): boolean {
  return DANGEROUS.some((re) => re.test(command));
}

export async function runShell(
  workspaceRoot: string,
  command: string,
  confirm: (cmd: string) => Promise<boolean>,
): Promise<string> {
  if (needsConfirm(command)) {
    const ok = await confirm(command);
    if (!ok) throw new Error("user_denied");
  }
  const { stdout, stderr } = await execFileAsync("sh", ["-c", command], {
    cwd: workspaceRoot,
    maxBuffer: 1024 * 1024,
  });
  return [stdout, stderr].filter(Boolean).join("\n") || "(no output)";
}
