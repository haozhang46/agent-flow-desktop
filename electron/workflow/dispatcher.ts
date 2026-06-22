import type { Intent, Risk, WorkflowDefinition } from "./types";
import { normalizeStep, normalizeWorkflow, profileKey } from "./types";
import type { WorkflowRunState } from "./state";

const DEFAULT_PROFILES: Record<string, { required_steps: string[] }> = {
  "QUERY/NA": { required_steps: [] },
  "BUG_FIX/LOW": { required_steps: ["be-dev", "test", "cicd"] },
  "FEATURE/MEDIUM": {
    required_steps: ["prd", "architecture", "fe-dev", "be-dev", "test", "review", "cicd"],
  },
  "FEATURE/HIGH": {
    required_steps: [
      "prd",
      "architecture",
      "fe-dev",
      "be-dev",
      "test",
      "review",
      "test-2",
      "cicd",
    ],
  },
};

export function resolveActiveSteps(
  workflow: WorkflowDefinition,
  intent: Intent,
  risk: Risk,
): string[] {
  const wf = normalizeWorkflow(workflow);
  const key = profileKey(intent, risk);
  const profile = wf.profiles?.[key] ?? DEFAULT_PROFILES[key];
  if (!profile) {
    return wf.steps.map((s) => s.id);
  }
  return profile.required_steps;
}

export function getPriorActiveStepId(
  workflow: WorkflowDefinition,
  state: WorkflowRunState,
  currentStepId: string,
): string | null {
  const active = state.activeStepIds;
  const idx = active.indexOf(currentStepId);
  if (idx <= 0) {
    return null;
  }
  return active[idx - 1];
}

export function getNextActiveStepId(
  workflow: WorkflowDefinition,
  state: WorkflowRunState,
  currentStepId: string,
): string | null {
  const active = state.activeStepIds;
  const idx = active.indexOf(currentStepId);
  if (idx < 0 || idx >= active.length - 1) {
    return null;
  }
  return active[idx + 1];
}

export type DispatchDecision = {
  action: "run" | "wait_manual" | "complete" | "idle";
  stepId: string | null;
  priorStepId: string | null;
  reason: string;
};

export function dispatch(
  workflow: WorkflowDefinition,
  state: WorkflowRunState,
): DispatchDecision {
  const wf = normalizeWorkflow(workflow);

  if (state.intent === "QUERY" && state.risk === "NA") {
    return { action: "idle", stepId: null, priorStepId: null, reason: "QUERY/NA — no workflow" };
  }

  if (state.activeStepIds.length === 0) {
    return { action: "complete", stepId: null, priorStepId: null, reason: "no active steps" };
  }

  const stepId = state.currentStepId;
  const status = state.stepStatuses[stepId];

  if (!state.activeStepIds.includes(stepId)) {
    const firstPending = state.activeStepIds.find(
      (id) => state.stepStatuses[id] === "pending" || state.stepStatuses[id] === "gate_failed",
    );
    if (firstPending) {
      return {
        action: "run",
        stepId: firstPending,
        priorStepId: getPriorActiveStepId(wf, state, firstPending),
        reason: "current step inactive; routing to first pending active step",
      };
    }
    return { action: "complete", stepId: null, priorStepId: null, reason: "all active steps done" };
  }

  if (status === "pending" || status === "gate_failed") {
    return {
      action: "run",
      stepId,
      priorStepId: getPriorActiveStepId(wf, state, stepId),
      reason: status === "gate_failed" ? "retry after gate failure" : "step pending",
    };
  }

  if (status === "running") {
    return {
      action: "wait_manual",
      stepId,
      priorStepId: getPriorActiveStepId(wf, state, stepId),
      reason: "step still running",
    };
  }

  if (status === "done") {
    const step = wf.steps.find((s) => s.id === stepId);
    const gatesOk =
      !state.lastGateResults[stepId] ||
      state.lastGateResults[stepId].every((g) => g.status === "PASS" || g.status === "SKIP");

    if (!gatesOk) {
      return {
        action: "wait_manual",
        stepId,
        priorStepId: getPriorActiveStepId(wf, state, stepId),
        reason: "gates failed — blocked",
      };
    }

    if (step?.advance === "manual") {
      return {
        action: "wait_manual",
        stepId,
        priorStepId: getPriorActiveStepId(wf, state, stepId),
        reason: "awaiting user continue",
      };
    }

    const next = getNextActiveStepId(wf, state, stepId);
    if (!next) {
      return { action: "complete", stepId: null, priorStepId: stepId, reason: "workflow complete" };
    }
    return {
      action: "run",
      stepId: next,
      priorStepId: stepId,
      reason: "auto-advance after gates",
    };
  }

  if (status === "skipped" || status === "failed") {
    const next = getNextActiveStepId(wf, state, stepId);
    if (!next) {
      return { action: "complete", stepId: null, priorStepId: stepId, reason: "workflow complete" };
    }
    return {
      action: "run",
      stepId: next,
      priorStepId: stepId,
      reason: `after ${status}`,
    };
  }

  return { action: "idle", stepId, priorStepId: null, reason: "unknown state" };
}

export function applyIntentRisk(
  workflow: WorkflowDefinition,
  state: WorkflowRunState,
  intent: Intent,
  risk: Risk,
): WorkflowRunState {
  const activeStepIds = resolveActiveSteps(workflow, intent, risk);
  const stepStatuses = { ...state.stepStatuses };

  for (const step of workflow.steps) {
    if (!activeStepIds.includes(step.id) && stepStatuses[step.id] === "pending") {
      stepStatuses[step.id] = "skipped";
    }
  }

  let currentStepId = state.currentStepId;
  if (!activeStepIds.includes(currentStepId)) {
    currentStepId = activeStepIds[0] ?? currentStepId;
  }

  return {
    ...state,
    intent,
    risk,
    activeStepIds,
    currentStepId,
    stepStatuses,
  };
}
