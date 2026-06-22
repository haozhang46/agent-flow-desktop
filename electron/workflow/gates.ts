import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { GateCheck, GateResult } from "./types";

const execFileAsync = promisify(execFile);

export function allGatesPassed(results: GateResult[]): boolean {
  return results.every((r) => r.status === "PASS" || r.status === "SKIP");
}

export async function runGate(
  projectRoot: string,
  gate: GateCheck,
): Promise<GateResult> {
  if (gate.type === "file") {
    const target = path.join(projectRoot, gate.path);
    try {
      const stat = await fs.stat(target);
      if (gate.min_bytes != null && stat.size < gate.min_bytes) {
        return {
          id: gate.id,
          status: "FAIL",
          message: `${gate.path} size ${stat.size} < min_bytes ${gate.min_bytes}`,
        };
      }
      return { id: gate.id, status: "PASS" };
    } catch {
      return { id: gate.id, status: "FAIL", message: `${gate.path} not found` };
    }
  }

  const cwd = gate.cwd ? path.join(projectRoot, gate.cwd) : projectRoot;
  const expectExit = gate.expect_exit ?? 0;
  try {
    await execFileAsync("sh", ["-c", gate.command], { cwd, timeout: 120_000 });
    return { id: gate.id, status: "PASS" };
  } catch (err: unknown) {
    const exitCode =
      err && typeof err === "object" && "code" in err ? Number((err as { code: unknown }).code) : -1;
    if (exitCode === expectExit) {
      return { id: gate.id, status: "PASS" };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      id: gate.id,
      status: "FAIL",
      message: `exit ${exitCode} (expected ${expectExit}): ${message}`,
    };
  }
}

export async function runGates(
  projectRoot: string,
  gates: GateCheck[],
): Promise<GateResult[]> {
  if (gates.length === 0) {
    return [];
  }
  const results: GateResult[] = [];
  for (const gate of gates) {
    results.push(await runGate(projectRoot, gate));
  }
  return results;
}
