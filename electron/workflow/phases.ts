import fs from "node:fs/promises";
import path from "node:path";
import type { GateResult } from "./types";

const PHASES_DIR = ".agentflow/phases";

export function phasesDir(projectRoot: string): string {
  return path.join(projectRoot, PHASES_DIR);
}

export function phasePath(
  projectRoot: string,
  stepId: string,
  workflowId?: string,
): string {
  if (workflowId) {
    return path.join(phasesDir(projectRoot), workflowId, `${stepId}.md`);
  }
  return path.join(phasesDir(projectRoot), `${stepId}.md`);
}

export function gateResultsPath(
  projectRoot: string,
  stepId: string,
  workflowId?: string,
): string {
  if (workflowId) {
    return path.join(phasesDir(projectRoot), workflowId, `${stepId}.gates.json`);
  }
  return path.join(phasesDir(projectRoot), `${stepId}.gates.json`);
}

export async function ensurePhasesDir(projectRoot: string, workflowId?: string): Promise<void> {
  const dir = workflowId
    ? path.join(phasesDir(projectRoot), workflowId)
    : phasesDir(projectRoot);
  await fs.mkdir(dir, { recursive: true });
}

export async function writePhaseOutput(
  projectRoot: string,
  stepId: string,
  content: string,
  relPath?: string,
  workflowId?: string,
): Promise<string> {
  await ensurePhasesDir(projectRoot, workflowId);
  const dest = relPath
    ? path.join(projectRoot, ".agentflow", relPath)
    : phasePath(projectRoot, stepId, workflowId);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, content, "utf8");
  return dest;
}

export async function readPhaseOutput(
  projectRoot: string,
  stepId: string,
  relPath?: string,
  workflowId?: string,
): Promise<string | null> {
  const candidates = [
    relPath ? path.join(projectRoot, ".agentflow", relPath) : null,
    workflowId ? phasePath(projectRoot, stepId, workflowId) : null,
    phasePath(projectRoot, stepId),
  ].filter(Boolean) as string[];

  for (const file of candidates) {
    try {
      return await fs.readFile(file, "utf8");
    } catch {
      // try next
    }
  }
  return null;
}

export async function writeGateResults(
  projectRoot: string,
  stepId: string,
  results: GateResult[],
  workflowId?: string,
): Promise<void> {
  await ensurePhasesDir(projectRoot, workflowId);
  await fs.writeFile(
    gateResultsPath(projectRoot, stepId, workflowId),
    JSON.stringify({ stepId, results, checkedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

export async function readGateResults(
  projectRoot: string,
  stepId: string,
  workflowId?: string,
): Promise<GateResult[] | null> {
  const candidates = [
    workflowId ? gateResultsPath(projectRoot, stepId, workflowId) : null,
    gateResultsPath(projectRoot, stepId),
  ].filter(Boolean) as string[];

  for (const file of candidates) {
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as { results?: GateResult[] };
      return parsed.results ?? null;
    } catch {
      // try next
    }
  }
  return null;
}
