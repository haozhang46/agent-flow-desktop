import fs from "node:fs/promises";
import path from "node:path";
import { runGates } from "./gates";
import { readGateResults } from "./phases";
import type { GateResult, WorkflowDefinition } from "./types";
import { normalizeStep, normalizeWorkflow } from "./types";
import type { WorkflowRunState } from "./state";

export interface EvalDimension {
  id: string;
  weight: number;
  score: number;
  max: number;
  detail: string;
}

export interface EvalReport {
  workflowId: string;
  intent: string;
  risk: string;
  dimensions: EvalDimension[];
  totalScore: number;
  grade: string;
  generatedAt: string;
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

async function scoreCompleteness(
  projectRoot: string,
  workflow: WorkflowDefinition,
  state: WorkflowRunState,
): Promise<EvalDimension> {
  const required = state.activeStepIds;
  const done = required.filter((id) => state.stepStatuses[id] === "done");
  const score = required.length === 0 ? 100 : Math.round((done.length / required.length) * 100);
  return {
    id: "completeness",
    weight: 0.3,
    score,
    max: 100,
    detail: `${done.length}/${required.length} active steps done`,
  };
}

async function scoreArtifacts(
  projectRoot: string,
  workflow: WorkflowDefinition,
  state: WorkflowRunState,
): Promise<EvalDimension> {
  const wf = normalizeWorkflow(workflow);
  const active = new Set(state.activeStepIds);
  let found = 0;
  let total = 0;

  for (const step of wf.steps) {
    if (!active.has(step.id)) continue;
    const normalized = normalizeStep(step);
    for (const output of normalized.outputs) {
      total++;
      try {
        await fs.access(path.join(projectRoot, output));
        found++;
      } catch {
        // missing
      }
    }
  }

  const score = total === 0 ? 100 : Math.round((found / total) * 100);
  return {
    id: "artifacts",
    weight: 0.25,
    score,
    max: 100,
    detail: `${found}/${total} declared outputs present`,
  };
}

async function scoreGates(
  projectRoot: string,
  workflow: WorkflowDefinition,
  state: WorkflowRunState,
): Promise<EvalDimension> {
  const wf = normalizeWorkflow(workflow);
  let pass = 0;
  let total = 0;

  for (const stepId of state.activeStepIds) {
    const step = wf.steps.find((s) => s.id === stepId);
    if (!step) continue;
    const normalized = normalizeStep(step);
    if (normalized.gates.length === 0) continue;

    let results: GateResult[] | null = state.lastGateResults[stepId] ?? null;
    if (!results) {
      results = await readGateResults(projectRoot, stepId);
    }
    if (!results) {
      results = await runGates(projectRoot, normalized.gates);
    }

    for (const r of results) {
      total++;
      if (r.status === "PASS" || r.status === "SKIP") pass++;
    }
  }

  const score = total === 0 ? 100 : Math.round((pass / total) * 100);
  return {
    id: "gates",
    weight: 0.25,
    score,
    max: 100,
    detail: `${pass}/${total} gate checks passed`,
  };
}

async function scorePhases(
  projectRoot: string,
  state: WorkflowRunState,
): Promise<EvalDimension> {
  let found = 0;
  for (const stepId of state.activeStepIds) {
    if (state.stepStatuses[stepId] !== "done") continue;
    try {
      await fs.access(path.join(projectRoot, ".agentflow/phases", `${stepId}.md`));
      found++;
    } catch {
      // missing phase
    }
  }
  const doneCount = state.activeStepIds.filter((id) => state.stepStatuses[id] === "done").length;
  const score = doneCount === 0 ? 0 : Math.round((found / doneCount) * 100);
  return {
    id: "phases",
    weight: 0.2,
    score,
    max: 100,
    detail: `${found}/${doneCount} completed steps have phase handoff files`,
  };
}

export async function runHarnessEval(
  projectRoot: string,
  workflow: WorkflowDefinition,
  state: WorkflowRunState,
): Promise<EvalReport> {
  const dimensions = await Promise.all([
    scoreCompleteness(projectRoot, workflow, state),
    scoreArtifacts(projectRoot, workflow, state),
    scoreGates(projectRoot, workflow, state),
    scorePhases(projectRoot, state),
  ]);

  const totalScore = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) /
      dimensions.reduce((sum, d) => sum + d.weight, 0),
  );

  return {
    workflowId: workflow.id,
    intent: state.intent,
    risk: state.risk,
    dimensions,
    totalScore,
    grade: gradeFromScore(totalScore),
    generatedAt: new Date().toISOString(),
  };
}

export interface EvalComparison {
  baseline: EvalReport;
  candidate: EvalReport;
  delta: number;
  improved: string[];
  regressed: string[];
}

export function compareEvalReports(baseline: EvalReport, candidate: EvalReport): EvalComparison {
  const delta = candidate.totalScore - baseline.totalScore;
  const improved: string[] = [];
  const regressed: string[] = [];

  for (const cand of candidate.dimensions) {
    const base = baseline.dimensions.find((d) => d.id === cand.id);
    if (!base) continue;
    if (cand.score > base.score) improved.push(`${cand.id}: ${base.score} → ${cand.score}`);
    if (cand.score < base.score) regressed.push(`${cand.id}: ${base.score} → ${cand.score}`);
  }

  return { baseline, candidate, delta, improved, regressed };
}
