import {
  AnalyzeService,
  type AnalyzeGraphRunner,
  type AnalyzeProgress,
} from "./analyzeService";
import type { GenerateWorkflowRunner } from "./generateWorkflowService";
import { createCompleteJson, createLlmGenerateRunner } from "./llmComplete";
import { createLlmAnalyzeRunner } from "./llmAnalyzeRunner";
import { getProjectLock, type LockKind } from "./projectLock";

export type UaRouteContext = {
  getApiKey: () => string | null;
  getWorkspaceRoot: () => string;
};

export type UaRunnersForTests = {
  analyzeRunner?: AnalyzeGraphRunner;
  generateRunner?: GenerateWorkflowRunner;
};

let testOverrides: UaRunnersForTests | null = null;
let analyzeServiceInstance: AnalyzeService | null = null;
const lastProgressByRoot = new Map<string, AnalyzeProgress>();
const progressUnsubs = new Map<string, () => void>();

/** Inject stub runners for Vitest only. Recreates AnalyzeService. */
export function setUaRunnersForTests(runners: UaRunnersForTests): void {
  clearProgressTracking();
  testOverrides = runners;
  analyzeServiceInstance = null;
}

export function resetUaRuntimeForTests(): void {
  clearProgressTracking();
  testOverrides = null;
  analyzeServiceInstance = null;
}

function clearProgressTracking(): void {
  for (const unsub of progressUnsubs.values()) {
    unsub();
  }
  progressUnsubs.clear();
  lastProgressByRoot.clear();
}

function ensureProgressListener(
  service: AnalyzeService,
  projectRoot: string,
): void {
  if (progressUnsubs.has(projectRoot)) {
    return;
  }
  const unsub = service.onProgress(projectRoot, (p) => {
    lastProgressByRoot.set(projectRoot, p);
  });
  progressUnsubs.set(projectRoot, unsub);
}

function getAnalyzeService(getApiKey: () => string | null): AnalyzeService {
  if (!analyzeServiceInstance) {
    const runner =
      testOverrides?.analyzeRunner ??
      createLlmAnalyzeRunner({
        getApiKey,
        completeJson: createCompleteJson(getApiKey),
      });
    analyzeServiceInstance = new AnalyzeService(runner);
  }
  return analyzeServiceInstance;
}

function getGenerateRunner(
  getApiKey: () => string | null,
): GenerateWorkflowRunner {
  if (testOverrides?.generateRunner) {
    return testOverrides.generateRunner;
  }
  return createLlmGenerateRunner({
    getApiKey,
    completeJson: createCompleteJson(getApiKey),
  });
}

export function getUaBusyKind(projectRoot: string): LockKind | null {
  return getProjectLock(projectRoot);
}

export function getUaLastProgress(
  projectRoot: string,
): AnalyzeProgress | undefined {
  return lastProgressByRoot.get(projectRoot);
}

export function cancelUaAnalyze(projectRoot: string, getApiKey: () => string | null): void {
  getAnalyzeService(getApiKey).cancel(projectRoot);
}

export function startUaAnalyze(
  projectRoot: string,
  opts: { forceFull?: boolean; rootIds?: string[] } | undefined,
  getApiKey: () => string | null,
): Promise<unknown> {
  const service = getAnalyzeService(getApiKey);
  ensureProgressListener(service, projectRoot);
  return service.start(projectRoot, opts).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    const prev = lastProgressByRoot.get(projectRoot);
    lastProgressByRoot.set(projectRoot, {
      phase: prev?.phase ?? "extract",
      message: `Error: ${message}`,
    });
    throw err;
  });
}

export function isUaAnalyzeBusy(
  projectRoot: string,
  getApiKey: () => string | null,
): boolean {
  return getAnalyzeService(getApiKey).isBusy(projectRoot);
}

export { getGenerateRunner };
