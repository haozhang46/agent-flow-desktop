import fs from "node:fs/promises";
import {
  KnowledgeGraphSchema,
  UaConfigSchema,
  type KnowledgeGraph,
  type UaConfig,
} from "./types";
import { configPath, graphPath, resolveUaDir } from "./paths";

export function assertValidGraph(data: unknown): KnowledgeGraph {
  return KnowledgeGraphSchema.parse(data);
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
