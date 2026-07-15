import { z } from "zod";

export const ComplexitySchema = z.enum(["low", "medium", "high"]);

export const ProjectSchema = z.object({
  name: z.string(),
  description: z.string(),
  languages: z.array(z.string()),
  frameworks: z.array(z.string()),
  analyzedAt: z.string(),
  gitCommitHash: z.string().nullable(),
});

export const GraphNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  filePath: z.string().optional(),
  summary: z.string(),
  tags: z.array(z.string()),
  complexity: ComplexitySchema,
});

export const GraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: z.string(),
  direction: z.string().optional(),
  weight: z.number().optional(),
});

export const LayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  nodeIds: z.array(z.string()),
});

export const TourStepSchema = z.object({
  order: z.number().int(),
  title: z.string(),
  description: z.string(),
  nodeIds: z.array(z.string()),
  languageLesson: z.string().optional(),
});

export const KnowledgeGraphSchema = z.object({
  version: z.string().optional(),
  project: ProjectSchema,
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  layers: z.array(LayerSchema),
  tour: z.array(TourStepSchema),
});

export type KnowledgeGraph = z.infer<typeof KnowledgeGraphSchema>;

export const UaConfigSchema = z.object({
  outputLanguage: z.string().default("zh"),
});

export type UaConfig = z.infer<typeof UaConfigSchema>;
