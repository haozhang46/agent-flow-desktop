import type { AgentflowSettings } from "../settings/store";

/** LangGraph requires recursionLimit >= 1; used when settings choose unlimited. */
export const UNLIMITED_RECURSION_LIMIT = 100_000;

let cachedRecursionLimit = UNLIMITED_RECURSION_LIMIT;

export function resolveRecursionLimit(settings: AgentflowSettings): number {
  const raw = settings.agentRecursionLimit;
  if (raw === undefined || raw === null || raw === 0) {
    return UNLIMITED_RECURSION_LIMIT;
  }
  return Math.max(1, Math.floor(raw));
}

export function isUnlimitedRecursionLimit(settings: AgentflowSettings): boolean {
  const raw = settings.agentRecursionLimit;
  return raw === undefined || raw === null || raw === 0;
}

export function getRecursionLimit(): number {
  return cachedRecursionLimit;
}

export function setRecursionLimitCache(limit: number): void {
  cachedRecursionLimit = limit;
}
