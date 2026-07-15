import { z } from "zod";

export const IntentSchema = z.enum(["QUERY", "BUG_FIX", "FEATURE"]);
export const RiskSchema = z.enum(["NA", "LOW", "MEDIUM", "HIGH"]);

export const GateFileSchema = z.object({
  id: z.string(),
  type: z.literal("file"),
  path: z.string(),
  min_bytes: z.number().int().nonnegative().optional(),
});

export const GateShellSchema = z.object({
  id: z.string(),
  type: z.literal("shell"),
  command: z.string(),
  cwd: z.string().optional(),
  expect_exit: z.number().int().optional().default(0),
});

export const GateCheckSchema = z.discriminatedUnion("type", [
  GateFileSchema,
  GateShellSchema,
]);

export const WorkflowProfileSchema = z.object({
  required_steps: z.array(z.string()),
});

export const WorkflowStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  executor: z.enum(["deepseek", "claude-code"]),
  agents_md: z.string().nullable().optional(),
  skills: z.array(z.string()).default([]),
  prompt_template: z.string().optional(),
  outputs: z.array(z.string()).default([]),
  phase_output: z.string().optional(),
  gates: z.array(GateCheckSchema).default([]),
  advance: z.enum(["manual", "auto"]).optional(),
  gate: z.enum(["manual", "auto"]).optional(),
  requires_resources: z.array(z.string()).default([]),
  rootId: z.string().optional(),
});

export const WorkflowEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

export const WorkflowSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  title: z.string(),
  steps: z.array(WorkflowStepSchema).min(1),
  edges: z.array(WorkflowEdgeSchema),
  profiles: z.record(WorkflowProfileSchema).optional(),
  resources: z
    .array(z.object({ type: z.string(), name: z.string(), optional: z.boolean().optional() }))
    .default([]),
});

export type Intent = z.infer<typeof IntentSchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type GateCheck = z.infer<typeof GateCheckSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowSchema>;
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export type GateStatus = "PASS" | "FAIL" | "SKIP";

export interface GateResult {
  id: string;
  status: GateStatus;
  message?: string;
}

export function profileKey(intent: Intent, risk: Risk): string {
  return `${intent}/${risk}`;
}

export function normalizeStep(step: WorkflowStep): WorkflowStep {
  const advance = step.advance ?? step.gate ?? "manual";
  const gates = [...(step.gates ?? [])];
  if (gates.length === 0 && step.outputs.length > 0) {
    for (const output of step.outputs) {
      gates.push({ id: `output-${output.replace(/[/\\]/g, "-")}`, type: "file", path: output });
    }
  }
  return { ...step, advance, gates };
}

export function normalizeWorkflow(workflow: WorkflowDefinition): WorkflowDefinition {
  return {
    ...workflow,
    steps: workflow.steps.map(normalizeStep),
  };
}
