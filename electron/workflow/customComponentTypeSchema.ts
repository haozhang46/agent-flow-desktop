import { z } from "zod";
import { WORKSPACE_REGISTRY, type PropFieldType } from "../../shared/workspaceRegistryData";

const PropFieldTypeSchema = z.enum([
  "string",
  "boolean",
  "select",
  "string[]",
  "file-list",
  "skills",
  "langflow-flow",
] as [PropFieldType, ...PropFieldType[]]);

const PropFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: PropFieldTypeSchema,
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

export const CustomComponentTypeSchema = z.object({
  type: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9-]*$/, "type must be kebab-case starting with a letter"),
  label: z.string().min(1),
  description: z.string(),
  category: z.string().min(1),
  defaultProps: z.record(z.unknown()).default({}),
  propsFields: z.array(PropFieldSchema),
});

export type CustomComponentType = z.infer<typeof CustomComponentTypeSchema>;

const RESERVED = new Set(WORKSPACE_REGISTRY.map((e) => e.type));

export function assertNotReservedType(type: string): void {
  if (RESERVED.has(type)) {
    throw new Error(`Component type "${type}" is reserved for a built-in widget`);
  }
}

export function parseCustomComponentType(input: unknown): CustomComponentType {
  const parsed = CustomComponentTypeSchema.parse(input);
  assertNotReservedType(parsed.type);
  return parsed;
}
