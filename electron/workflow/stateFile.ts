import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { loadWorkflow, listWorkflows } from "./loader";
import type { Intent, Risk, WorkflowDefinition } from "./types";
import { applyIntentRisk, resolveActiveSteps } from "./dispatcher";
import type { GateResult } from "./types";
import type { StepStatus, WorkflowRunState } from "./state";

async function isLegacyWorkflow(projectRoot: string, workflowId: string): Promise<boolean> {
  await loadWorkflow(projectRoot, workflowId);
  const list = await listWorkflows(projectRoot);
  const entry = list.find((w) => w.id === workflowId);
  if (!entry) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  return entry.isLegacy;
}

export function stateFilePath(
  projectRoot: string,
  workflowId: string,
  isLegacy: boolean,
): string {
  if (isLegacy) {
    return path.join(projectRoot, ".agentflow/state.json");
  }
  return path.join(projectRoot, ".agentflow/workflows", workflowId, "state.json");
}

export async function resolveStateFilePath(
  projectRoot: string,
  workflowId: string,
): Promise<string> {
  const legacy = await isLegacyWorkflow(projectRoot, workflowId);
  return stateFilePath(projectRoot, workflowId, legacy);
}

export async function loadStateFile(
  projectRoot: string,
  workflow: WorkflowDefinition,
): Promise<WorkflowRunState | null> {
  try {
    const dest = await resolveStateFilePath(projectRoot, workflow.id);
    const raw = await fs.readFile(dest, "utf8");
    const parsed = JSON.parse(raw) as WorkflowRunState;
    if (parsed.workflowId !== workflow.id) {
      return null;
    }
    return {
      ...parsed,
      stepStatuses: { ...parsed.stepStatuses },
      lastGateResults: { ...parsed.lastGateResults },
      activeStepIds: [...parsed.activeStepIds],
    };
  } catch {
    return null;
  }
}

export async function saveStateFile(
  projectRoot: string,
  state: WorkflowRunState,
): Promise<void> {
  const dest = await resolveStateFilePath(projectRoot, state.workflowId);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, JSON.stringify(state, null, 2), "utf8");
}

export function createRunState(
  workflow: WorkflowDefinition,
  intent: Intent = "FEATURE",
  risk: Risk = "HIGH",
): WorkflowRunState {
  const activeStepIds = resolveActiveSteps(workflow, intent, risk);
  const stepStatuses: Record<string, StepStatus> = {};
  for (const step of workflow.steps) {
    stepStatuses[step.id] = activeStepIds.includes(step.id) ? "pending" : "skipped";
  }

  return {
    workflowId: workflow.id,
    intent,
    risk,
    currentStepId: activeStepIds[0] ?? workflow.steps[0].id,
    activeStepIds,
    stepStatuses,
    lastGateResults: {},
    threadId: randomUUID(),
  };
}

export async function getOrCreateState(
  projectRoot: string,
  workflow: WorkflowDefinition,
): Promise<WorkflowRunState> {
  const existing = await loadStateFile(projectRoot, workflow);
  if (existing) {
    return existing;
  }
  const state = createRunState(workflow);
  await saveStateFile(projectRoot, state);
  return state;
}

export async function setIntentRisk(
  projectRoot: string,
  workflow: WorkflowDefinition,
  state: WorkflowRunState,
  intent: Intent,
  risk: Risk,
): Promise<WorkflowRunState> {
  const next = applyIntentRisk(workflow, state, intent, risk);
  await saveStateFile(projectRoot, next);
  return next;
}

export function recordGateResults(
  state: WorkflowRunState,
  stepId: string,
  results: GateResult[],
): WorkflowRunState {
  return {
    ...state,
    lastGateResults: { ...state.lastGateResults, [stepId]: results },
    stepStatuses: {
      ...state.stepStatuses,
      [stepId]: results.every((r) => r.status === "PASS" || r.status === "SKIP")
        ? state.stepStatuses[stepId]
        : "gate_failed",
    },
  };
}
