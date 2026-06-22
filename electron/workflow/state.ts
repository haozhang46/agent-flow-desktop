import { randomUUID } from "node:crypto";
import type { WorkflowDefinition } from "./types";
import type { GateResult, Intent, Risk } from "./types";

export type StepStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "skipped"
  | "gate_failed";

export interface WorkflowRunState {
  workflowId: string;
  intent: Intent;
  risk: Risk;
  currentStepId: string;
  activeStepIds: string[];
  stepStatuses: Record<string, StepStatus>;
  lastGateResults: Record<string, GateResult[]>;
  threadId: string;
}

const runs = new Map<string, WorkflowRunState>();

export function cloneRunState(state: WorkflowRunState): WorkflowRunState {
  return {
    ...state,
    activeStepIds: [...state.activeStepIds],
    stepStatuses: { ...state.stepStatuses },
    lastGateResults: Object.fromEntries(
      Object.entries(state.lastGateResults).map(([k, v]) => [k, [...v]]),
    ),
  };
}

export function saveRunState(state: WorkflowRunState): void {
  runs.set(state.threadId, cloneRunState(state));
}

export function loadRunState(threadId: string): WorkflowRunState | undefined {
  const state = runs.get(threadId);
  if (!state) {
    return undefined;
  }
  return cloneRunState(state);
}

export function legacyCreateInitialState(
  workflow: WorkflowDefinition,
): WorkflowRunState {
  const stepStatuses: Record<string, StepStatus> = {};
  const activeStepIds = workflow.steps.map((s) => s.id);
  for (const step of workflow.steps) {
    stepStatuses[step.id] = "pending";
  }

  return {
    workflowId: workflow.id,
    intent: "FEATURE",
    risk: "HIGH",
    currentStepId: workflow.steps[0].id,
    activeStepIds,
    stepStatuses,
    lastGateResults: {},
    threadId: randomUUID(),
  };
}
