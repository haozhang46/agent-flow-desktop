import type { StepEvent } from "../executors/types";
import {
  formatResourceContextForPrompt,
  resolveResources,
  type ResolvedResource,
} from "../resources/resolver";
import {
  combineResourceAndTopologyContext,
  formatTopologyContextForPrompt,
  projectIdFromRoot,
  resolveTopology,
  type Topology,
} from "../resources/topology";
import { dispatch } from "./dispatcher";
import { compareEvalReports, runHarnessEval, type EvalReport } from "./eval";
import { getActiveWorkflowId, loadWorkflow } from "./loader";
import { StepRunner } from "./stepRunner";
import type { WorkflowRunState } from "./state";
import { setIntentRisk } from "./stateFile";
import type { Intent, Risk } from "./types";

const runners = new Map<string, StepRunner>();

function runnerKey(workspaceRoot: string, workflowId: string): string {
  return `${workspaceRoot}:${workflowId}`;
}

async function resolveWorkflowId(
  workspaceRoot: string,
  workflowId?: string,
): Promise<string> {
  return workflowId ?? getActiveWorkflowId(workspaceRoot);
}

export async function getRunner(
  workspaceRoot: string,
  getApiKey: () => string | null,
  getResourceServerUrl?: () => string | null,
  workflowId?: string,
): Promise<StepRunner> {
  const id = await resolveWorkflowId(workspaceRoot, workflowId);
  const key = runnerKey(workspaceRoot, id);
  let runner = runners.get(key);
  if (!runner) {
    const workflow = await loadWorkflow(workspaceRoot, id);
    runner = await StepRunner.create(workspaceRoot, workflow, getApiKey, getResourceServerUrl);
    runners.set(key, runner);
  }
  return runner;
}

export function clearRunner(workspaceRoot: string, workflowId?: string): void {
  if (workflowId) {
    runners.delete(runnerKey(workspaceRoot, workflowId));
    return;
  }
  for (const key of [...runners.keys()]) {
    if (key.startsWith(`${workspaceRoot}:`)) {
      runners.delete(key);
    }
  }
}

export async function getResourceContext(
  workspaceRoot: string,
  getResourceServerUrl?: () => string | null,
): Promise<{ markdown: string; resources: ResolvedResource[]; topology: Topology | null }> {
  const serverUrl = getResourceServerUrl?.() ?? undefined;
  const resources = await resolveResources(workspaceRoot, serverUrl ?? undefined);
  const resourceMarkdown = formatResourceContextForPrompt(resources);
  const topology = await resolveTopology(
    workspaceRoot,
    serverUrl ?? undefined,
    projectIdFromRoot(workspaceRoot),
  );
  const topologyMarkdown = topology ? formatTopologyContextForPrompt(topology) : "";
  return {
    markdown: combineResourceAndTopologyContext(resourceMarkdown, topologyMarkdown),
    resources,
    topology,
  };
}

export async function getWorkflowState(
  workspaceRoot: string,
  getApiKey: () => string | null,
  getResourceServerUrl?: () => string | null,
  workflowId?: string,
): Promise<WorkflowRunState> {
  const runner = await getRunner(workspaceRoot, getApiKey, getResourceServerUrl, workflowId);
  return runner.getState();
}

export async function getDispatchDecision(
  workspaceRoot: string,
  getApiKey: () => string | null,
  getResourceServerUrl?: () => string | null,
  workflowId?: string,
) {
  const runner = await getRunner(workspaceRoot, getApiKey, getResourceServerUrl, workflowId);
  return runner.getDispatchDecision();
}

export async function* runWorkflowStep(
  workspaceRoot: string,
  getApiKey: () => string | null,
  stepId?: string,
  getResourceServerUrl?: () => string | null,
  workflowId?: string,
): AsyncIterable<StepEvent> {
  const runner = await getRunner(workspaceRoot, getApiKey, getResourceServerUrl, workflowId);
  if (stepId) {
    runner.setCurrentStepId(stepId);
  }
  yield* runner.runCurrentStep();
}

export async function advanceWorkflow(
  workspaceRoot: string,
  getApiKey: () => string | null,
  action: "continue" | "skip" | "retry",
  getResourceServerUrl?: () => string | null,
  workflowId?: string,
): Promise<WorkflowRunState> {
  const runner = await getRunner(workspaceRoot, getApiKey, getResourceServerUrl, workflowId);
  return runner.advance(action);
}

export async function runWorkflowGates(
  workspaceRoot: string,
  getApiKey: () => string | null,
  stepId?: string,
  getResourceServerUrl?: () => string | null,
  workflowId?: string,
): Promise<WorkflowRunState> {
  const runner = await getRunner(workspaceRoot, getApiKey, getResourceServerUrl, workflowId);
  return runner.runGatesForStep(stepId);
}

export async function setWorkflowIntent(
  workspaceRoot: string,
  getApiKey: () => string | null,
  intent: Intent,
  risk: Risk,
  getResourceServerUrl?: () => string | null,
  workflowId?: string,
): Promise<WorkflowRunState> {
  const id = await resolveWorkflowId(workspaceRoot, workflowId);
  clearRunner(workspaceRoot, id);
  const workflow = await loadWorkflow(workspaceRoot, id);
  const runner = await getRunner(workspaceRoot, getApiKey, getResourceServerUrl, id);
  const state = runner.getState();
  const next = await setIntentRisk(workspaceRoot, workflow, state, intent, risk);
  runners.set(
    runnerKey(workspaceRoot, id),
    new StepRunner(workspaceRoot, workflow, getApiKey, getResourceServerUrl, next),
  );
  return next;
}

export async function activateWorkflow(
  workspaceRoot: string,
  workflowId: string,
  getApiKey: () => string | null,
  getResourceServerUrl?: () => string | null,
): Promise<void> {
  const { setActiveWorkflowId } = await import("./loader");
  await setActiveWorkflowId(workspaceRoot, workflowId);
  clearRunner(workspaceRoot);
}

export async function runWorkflowEval(
  workspaceRoot: string,
  getApiKey: () => string | null,
  getResourceServerUrl?: () => string | null,
  workflowId?: string,
): Promise<EvalReport> {
  const id = await resolveWorkflowId(workspaceRoot, workflowId);
  const workflow = await loadWorkflow(workspaceRoot, id);
  const state = await getWorkflowState(workspaceRoot, getApiKey, getResourceServerUrl, id);
  return runHarnessEval(workspaceRoot, workflow, state);
}

export function compareWorkflowEvals(baseline: EvalReport, candidate: EvalReport) {
  return compareEvalReports(baseline, candidate);
}

export { dispatch };
