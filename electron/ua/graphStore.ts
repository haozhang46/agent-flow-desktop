import fs from "node:fs/promises";
import {
  KnowledgeGraphSchema,
  UaConfigSchema,
  type KnowledgeGraph,
  type UaConfig,
} from "./types";
import { configPath, graphPath, resolveUaDir } from "./paths";

/**
 * Migrate pre-multi-root graphs before Zod parse:
 * - missing node.rootId → "main"
 * - missing project.roots → single main root from project meta
 */
export function normalizeGraph(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const data = { ...(raw as Record<string, unknown>) };

  if (Array.isArray(data.nodes)) {
    data.nodes = data.nodes.map((node) => {
      if (node === null || typeof node !== "object" || Array.isArray(node)) {
        return node;
      }
      const n = { ...(node as Record<string, unknown>) };
      if (n.rootId === undefined || n.rootId === null || n.rootId === "") {
        n.rootId = "main";
      }
      return n;
    });
  }

  if (data.project !== null && typeof data.project === "object" && !Array.isArray(data.project)) {
    const project = { ...(data.project as Record<string, unknown>) };
    if (!Array.isArray(project.roots)) {
      const label =
        typeof project.name === "string" && project.name.length > 0
          ? project.name
          : "Main";
      const gitCommitHash =
        typeof project.gitCommitHash === "string" || project.gitCommitHash === null
          ? (project.gitCommitHash as string | null)
          : null;
      project.roots = [
        {
          id: "main",
          label,
          path: ".",
          gitCommitHash,
        },
      ];
    }
    data.project = project;
  }

  return data;
}

export function assertValidGraph(data: unknown): KnowledgeGraph {
  return KnowledgeGraphSchema.parse(normalizeGraph(data));
}

export async function readGraph(projectRoot: string): Promise<KnowledgeGraph | null> {
  const uaDir = await resolveUaDir(projectRoot);
  const dest = graphPath(uaDir);
  try {
    const raw = await fs.readFile(dest, "utf8");
    return assertValidGraph(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

export async function writeGraph(
  projectRoot: string,
  graph: KnowledgeGraph,
): Promise<void> {
  const uaDir = await resolveUaDir(projectRoot);
  await fs.mkdir(uaDir, { recursive: true });
  const dest = graphPath(uaDir);
  const tmpDest = `${dest}.tmp`;
  await fs.writeFile(tmpDest, JSON.stringify(graph, null, 2), "utf8");
  await fs.rename(tmpDest, dest);
}

const DEFAULT_UA_CONFIG: UaConfig = { outputLanguage: "zh" };

export async function readUaConfig(projectRoot: string): Promise<UaConfig> {
  const uaDir = await resolveUaDir(projectRoot);
  const dest = configPath(uaDir);
  try {
    const raw = await fs.readFile(dest, "utf8");
    return UaConfigSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return DEFAULT_UA_CONFIG;
    }
    throw err;
  }
}

export async function writeUaConfig(
  projectRoot: string,
  config: UaConfig,
): Promise<void> {
  const uaDir = await resolveUaDir(projectRoot);
  await fs.mkdir(uaDir, { recursive: true });
  const dest = configPath(uaDir);
  await fs.writeFile(dest, JSON.stringify(config, null, 2), "utf8");
}
