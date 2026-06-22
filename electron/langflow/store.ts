import fs from "node:fs/promises";
import path from "node:path";
import type { LangflowProjectState } from "./types";

function langflowStatePath(projectRoot: string): string {
  return path.join(projectRoot, ".agentflow/langflow.json");
}

export async function readLangflowState(projectRoot: string): Promise<LangflowProjectState> {
  try {
    const raw = await fs.readFile(langflowStatePath(projectRoot), "utf8");
    return JSON.parse(raw) as LangflowProjectState;
  } catch {
    return {};
  }
}

export async function writeLangflowState(
  projectRoot: string,
  state: LangflowProjectState,
): Promise<void> {
  const dir = path.join(projectRoot, ".agentflow");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(langflowStatePath(projectRoot), JSON.stringify(state, null, 2), "utf8");
}
