import { claudeCodeExecutor } from "./claudeCode";
import { deepseekExecutor } from "./deepseek";
import type { StepExecutor } from "./types";

const executors = new Map<string, StepExecutor>([
  [deepseekExecutor.id, deepseekExecutor],
  [claudeCodeExecutor.id, claudeCodeExecutor],
]);

export function registerExecutor(executor: StepExecutor): void {
  executors.set(executor.id, executor);
}

export function getExecutor(id: string): StepExecutor {
  const executor = executors.get(id);
  if (!executor) {
    throw new Error(`unknown executor: ${id}`);
  }
  return executor;
}
