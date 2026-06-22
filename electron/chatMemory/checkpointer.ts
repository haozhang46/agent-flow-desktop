import fs from "node:fs";
import path from "node:path";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { chatMemoryRoot, checkpointsDbPath } from "./paths";

const checkpointers = new Map<string, SqliteSaver>();

function normalizeProjectRoot(projectRoot: string): string {
  return path.resolve(projectRoot);
}

export function getProjectCheckpointer(projectRoot: string): SqliteSaver {
  const normalized = normalizeProjectRoot(projectRoot);
  const existing = checkpointers.get(normalized);
  if (existing) {
    return existing;
  }

  fs.mkdirSync(chatMemoryRoot(normalized), { recursive: true });
  const saver = SqliteSaver.fromConnString(checkpointsDbPath(normalized));
  checkpointers.set(normalized, saver);
  return saver;
}

export function resetCheckpointersForTests(): void {
  checkpointers.clear();
}
