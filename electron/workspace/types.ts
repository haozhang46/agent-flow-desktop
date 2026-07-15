import { z } from "zod";

export const WorkspaceRootSchema = z.object({
  id: z.string(),
  path: z.string(),
  label: z.string(),
});

export const WorkspaceFileSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  roots: z.array(WorkspaceRootSchema),
  defaults: z
    .object({
      analyzeRootIds: z.array(z.string()).optional(),
    })
    .optional(),
});

export type WorkspaceRoot = z.infer<typeof WorkspaceRootSchema>;
export type WorkspaceFile = z.infer<typeof WorkspaceFileSchema>;

export type ResolvedRoot = {
  id: string;
  path: string;
  label: string;
  absolutePath: string;
};
