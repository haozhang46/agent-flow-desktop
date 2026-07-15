import { z } from "zod";
import { WorkflowSchema } from "../workflow/types";

export const WorkflowDraftMetaSchema = z.object({
  source: z.literal("ua-graph"),
  analyzedAt: z.string().nullable(),
  gitCommitHash: z.string().nullable(),
  goal: z.string().nullable(),
});

export const WorkflowDraftSchema = z
  .object({
    workflow: WorkflowSchema,
    prompts: z.record(z.string()),
    workspaces: z.record(z.unknown()).optional(),
    meta: WorkflowDraftMetaSchema,
  })
  .superRefine((draft, ctx) => {
    for (const step of draft.workflow.steps) {
      const expected = `prompts/${step.id}.md`;
      if (step.prompt_template !== expected) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step "${step.id}" prompt_template must be "${expected}"`,
          path: ["workflow", "steps"],
        });
      }
      if (typeof draft.prompts[expected] !== "string") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing prompt body for "${expected}"`,
          path: ["prompts", expected],
        });
      }
    }
  });

export type WorkflowDraft = z.infer<typeof WorkflowDraftSchema>;

export function assertValidDraft(data: unknown): WorkflowDraft {
  return WorkflowDraftSchema.parse(data);
}
