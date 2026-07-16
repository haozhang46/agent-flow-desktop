import { z } from "zod";
import type { PanelTypeDocument } from "./types";

const propFieldTypeSchema = z.enum([
  "string",
  "boolean",
  "select",
  "string[]",
  "file-list",
  "skills",
  "langflow-flow",
]);

const propFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: propFieldTypeSchema,
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

const panelRootViewSchema = z.object({
  type: z.literal("view"),
  name: z.string(),
  props: z.record(z.unknown()).optional(),
});

const panelRootFormSchema = z.object({
  type: z.literal("form"),
});

const panelRootSchema = z.discriminatedUnion("type", [
  panelRootViewSchema,
  panelRootFormSchema,
]);

const actionKindSchema = z
  .string()
  .regex(/^(props\.set|chat\.invoke|panel\.[A-Za-z][A-Za-z0-9]*)$/);

const panelActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: actionKindSchema,
  payload: z.record(z.unknown()).optional(),
});

const panelTypeDocumentSchema = z.object({
  type: z.string(),
  label: z.string(),
  description: z.string(),
  category: z.string(),
  defaultProps: z.record(z.unknown()),
  propsFields: z.array(propFieldSchema),
  root: panelRootSchema,
  actions: z.array(panelActionSchema).optional(),
});

export function parsePanelTypeDocument(input: unknown): PanelTypeDocument {
  return panelTypeDocumentSchema.parse(input);
}
