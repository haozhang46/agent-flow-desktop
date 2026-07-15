import fs from "node:fs/promises";
import path from "node:path";

export async function resolveUaDir(projectRoot: string): Promise<string> {
  const legacy = path.join(projectRoot, ".understand-anything");
  try {
    await fs.access(legacy);
    return legacy;
  } catch {
    return path.join(projectRoot, ".ua");
  }
}

export function graphPath(uaDir: string): string {
  return path.join(uaDir, "knowledge-graph.json");
}

export function configPath(uaDir: string): string {
  return path.join(uaDir, "config.json");
}

export function ignorePath(uaDir: string): string {
  return path.join(uaDir, ".understandignore");
}
