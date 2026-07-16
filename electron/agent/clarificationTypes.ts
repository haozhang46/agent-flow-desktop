import { z } from "zod";

export const ClarificationOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
});

export const AskQuestionArgsSchema = z.object({
  question: z.string(),
  options: z.array(ClarificationOptionSchema).min(1),
  allow_multiple: z.boolean().default(false),
  allow_free_text: z.boolean().default(true),
});

export const ClarificationAnswerSchema = z.object({
  selected_option_ids: z.array(z.string()),
  free_text: z.string().optional(),
});

export type ClarificationOption = z.infer<typeof ClarificationOptionSchema>;
export type AskQuestionArgs = z.infer<typeof AskQuestionArgsSchema>;
export type ClarificationAnswer = z.infer<typeof ClarificationAnswerSchema>;

export type ClarificationStatus = "pending" | "answered" | "cancelled";

export type PendingClarification = {
  threadId: string;
  clarificationId: string;
  status: ClarificationStatus;
  question: string;
  options: ClarificationOption[];
  allow_multiple: boolean;
  allow_free_text: boolean;
};
